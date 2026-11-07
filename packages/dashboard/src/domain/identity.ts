/**
 * identity.ts — Create a real Ed25519 agent identity in the browser.
 *
 * WHY THIS EXISTS
 * An agent proves who it is by signing every request with an Ed25519 private
 * key; the gateway only stores the matching PUBLIC key. A usable identity
 * therefore needs a genuine keypair, and whoever holds the private key is the
 * agent. This module creates one with the browser's WebCrypto API
 * (`crypto.subtle`, hardware-quality randomness) and encodes it in the same
 * string formats the rest of Decant already uses (NEAR-style `ed25519:<base58>`).
 *
 * WHAT YOU GET
 *   publicKey   "ed25519:<base58 of 32 bytes>"  -> send to the gateway to register
 *   privateKey  "ed25519:<base58 of 64 bytes>"  -> give to the agent; shown once
 *               (seed ‖ public key, which is what near-api-js `KeyPair.fromString` expects)
 *   sessionId   first 32 characters of the base58 public key. This is exactly
 *               what `DecantClient` derives when you do not pass a sessionId,
 *               so the agent works with zero extra configuration.
 *
 * SECURITY NOTES
 *   - The private key never leaves the browser tab: it is returned to the
 *     caller, which must display it once and discard it. It is never sent to
 *     the gateway and never written to browser storage.
 *   - `crypto.subtle` only exists in secure contexts (HTTPS or localhost).
 *   - Pure module: no React, no network, no storage. Safe to unit test in Node.
 */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const KEY_PREFIX = 'ed25519:' as const;

/** PKCS#8 wrapper for an Ed25519 key is 16 header bytes followed by the 32-byte seed. */
const PKCS8_ED25519_LENGTH = 48;
const SEED_LENGTH = 32;
const PUBLIC_KEY_LENGTH = 32;
/** Matches DecantClient's default session ID derivation (packages/agent-sdk/src/client.ts). */
const SESSION_ID_LENGTH = 32;

/** NEAR-style key string, e.g. `ed25519:6E8s…`. */
export type Ed25519KeyString = `ed25519:${string}`;

export interface AgentIdentity {
  sessionId: string;
  publicKey: Ed25519KeyString;
  privateKey: Ed25519KeyString;
}

/** Bitcoin-style base58 (the encoding NEAR uses for keys). Leading zero bytes become '1'. */
export function base58Encode(bytes: Uint8Array): string {
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros += 1;

  // Repeated multiply-and-add in base 58, least significant digit first.
  const digits: number[] = [];
  for (let index = leadingZeros; index < bytes.length; index += 1) {
    let carry = bytes[index] ?? 0;
    for (let digit = 0; digit < digits.length; digit += 1) {
      carry += (digits[digit] ?? 0) << 8;
      digits[digit] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let encoded = '1'.repeat(leadingZeros);
  for (let digit = digits.length - 1; digit >= 0; digit -= 1) {
    encoded += BASE58_ALPHABET.charAt(digits[digit] ?? 0);
  }
  return encoded;
}

/** True when this browser/runtime can generate Ed25519 keys (secure context + WebCrypto Ed25519). */
export function isIdentityGenerationSupported(): boolean {
  return typeof globalThis.crypto?.subtle?.generateKey === 'function';
}

/**
 * Generate a new agent identity.
 * @throws Error with a human-readable message if the runtime cannot generate Ed25519 keys.
 */
export async function generateAgentIdentity(): Promise<AgentIdentity> {
  if (!isIdentityGenerationSupported()) {
    throw new Error(
      'This browser cannot generate Ed25519 keys here (it needs HTTPS or localhost, and a recent browser). '
      + 'Run `npm run keygen` in a terminal instead.',
    );
  }

  const subtle = globalThis.crypto.subtle;
  let pair: CryptoKeyPair;
  try {
    pair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  } catch {
    throw new Error(
      'This browser does not support Ed25519 key generation. Update it, or run `npm run keygen` in a terminal instead.',
    );
  }

  const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
  const publicBytes = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  if (pkcs8.length !== PKCS8_ED25519_LENGTH || publicBytes.length !== PUBLIC_KEY_LENGTH) {
    throw new Error('The browser returned an unexpected Ed25519 key format; refusing to use it.');
  }

  // NEAR secret-key format: seed followed by the public key (64 bytes).
  const secretBytes = new Uint8Array(SEED_LENGTH + PUBLIC_KEY_LENGTH);
  secretBytes.set(pkcs8.slice(PKCS8_ED25519_LENGTH - SEED_LENGTH), 0);
  secretBytes.set(publicBytes, SEED_LENGTH);

  const publicBase58 = base58Encode(publicBytes);
  return {
    sessionId: publicBase58.slice(0, SESSION_ID_LENGTH),
    publicKey: `${KEY_PREFIX}${publicBase58}`,
    privateKey: `${KEY_PREFIX}${base58Encode(secretBytes)}`,
  };
}
