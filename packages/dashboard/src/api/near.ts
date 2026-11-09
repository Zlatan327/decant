/**
 * near.ts — Real-time NEAR Testnet RPC client for the Decant Dashboard.
 *
 * Direct FastNEAR JSON-RPC queries for:
 *   - Account balance (view_account)
 *   - Smart contract quota inspection (call_function: get_quota)
 * */

export const DEFAULT_NEAR_RPC = 'https://test.rpc.fastnear.com';
export const DEFAULT_CONTRACT_ID = import.meta.env.VITE_DECANT_NEAR_CONTRACT_ID?.trim() || '';

export interface NearAccountInfo {
  accountId: string;
  nearBalance: string;
  rawAmount: string;
  blockHeight: number;
}

export interface NearContractQuota {
  sessionId: string;
  owner: string;
  total: number;
  remaining: number;
}

function yoctoToNear(yocto: string): string {
  const raw = BigInt(yocto);
  const oneNear = BigInt('1000000000000000000000000'); // 1e24
  const whole = raw / oneNear;
  const remainder = raw % oneNear;
  const decimal = remainder.toString().padStart(24, '0').slice(0, 4);
  return `${whole}.${decimal}`;
}

export async function fetchNearAccount(
  accountId: string,
  rpcUrl = DEFAULT_NEAR_RPC
): Promise<NearAccountInfo> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `view-acct-${Date.now()}`,
      method: 'query',
      params: {
        request_type: 'view_account',
        finality: 'final',
        account_id: accountId.trim(),
      },
    }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || json.error.data || 'Failed to query NEAR account');
  }

  const result = json.result;
  if (!response.ok || typeof result?.amount !== 'string' || !Number.isSafeInteger(result?.block_height)) {
    throw new Error('NEAR RPC returned an invalid account response');
  }
  return {
    accountId,
    nearBalance: yoctoToNear(result.amount),
    rawAmount: result.amount,
    blockHeight: result.block_height,
  };
}

export async function fetchContractQuota(
  sessionId: string,
  contractId = DEFAULT_CONTRACT_ID,
  rpcUrl = DEFAULT_NEAR_RPC
): Promise<NearContractQuota | null> {
  const argsBase64 = btoa(JSON.stringify({ session_id: sessionId.trim() }));

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `get-quota-${Date.now()}`,
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: contractId.trim(),
        method_name: 'get_quota',
        args_base64: argsBase64,
      },
    }),
  });

  const json = await response.json();
  if (!response.ok || json.error || !Array.isArray(json.result?.result)) {
    throw new Error('NEAR RPC could not read the contract quota');
  }

  const decoded = new TextDecoder().decode(Uint8Array.from(json.result.result));
  const parsed = JSON.parse(decoded);
  if (parsed === null) return null;
  if (typeof parsed.session_id !== 'string' || typeof parsed.owner !== 'string'
    || !Number.isSafeInteger(parsed.total) || !Number.isSafeInteger(parsed.remaining)) {
    throw new Error('NEAR RPC returned an invalid quota record');
  }
  return { sessionId: parsed.session_id, owner: parsed.owner, total: parsed.total, remaining: parsed.remaining };
}
