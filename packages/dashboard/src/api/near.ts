/**
 * near.ts — Real-time NEAR Testnet RPC client for the Decant Dashboard.
 *
 * Direct FastNEAR JSON-RPC queries for:
 *   - Account balance (view_account)
 *   - Smart contract quota inspection (call_function: get_quota)
 *   - Open compute intents (call_function: list_open_intents)
 */

export const DEFAULT_NEAR_RPC = 'https://test.rpc.fastnear.com';
export const DEFAULT_CONTRACT_ID = 'shylibrary4027.testnet';

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
  try {
    const raw = BigInt(yocto);
    const oneNear = BigInt('1000000000000000000000000'); // 1e24
    const whole = raw / oneNear;
    const remainder = raw % oneNear;
    const decimal = remainder.toString().padStart(24, '0').slice(0, 4);
    return `${whole}.${decimal}`;
  } catch {
    return '0.0000';
  }
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
  return {
    accountId,
    nearBalance: yoctoToNear(result.amount ?? '0'),
    rawAmount: result.amount ?? '0',
    blockHeight: result.block_height ?? 0,
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
  if (json.error || !json.result || !json.result.result) {
    return null;
  }

  try {
    const bytes = new Uint8Array(json.result.result);
    const decoded = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(decoded);
    if (!parsed) return null;
    return {
      sessionId: parsed.session_id,
      owner: parsed.owner,
      total: Number(parsed.total) || 0,
      remaining: Number(parsed.remaining) || 0,
    };
  } catch {
    return null;
  }
}
