/**
 * crypto.ts — Production Web3 Cryptographic Verification for Decant.
 *
 * Implements Ed25519 signature generation and verification adhering to the NEAR
 * protocol standard (`ed25519:<base58_key>`).
 *
 * Prevents:
 *   - Replay attacks (via dynamic timestamp window verification).
 *   - Request tampering (via SHA-256 payload binding).
 *   - Impersonation (via Ed25519 cryptographic public-key assertion).
 */

import { PublicKey } from "near-api-js";
import { createHash } from "node:crypto";

export interface SignedPayloadHeaders {
  sessionId: string;
  signature: string;
  timestamp: number;
}

const MAX_DRIFT_MS = 60_000; // 60 seconds maximum allowed clock drift

// In-memory anti-replay cache: signatureHex -> timestamp received
const seenSignatures = new Map<string, number>();

/**
 * Periodically purge stale entries from the anti-replay cache (older than MAX_DRIFT_MS * 2).
 */
function pruneStaleSignatures(): void {
  const threshold = Date.now() - MAX_DRIFT_MS * 2;
  for (const [sig, seenAt] of seenSignatures.entries()) {
    if (seenAt < threshold) {
      seenSignatures.delete(sig);
    }
  }
}

// Prune every 30 seconds if timer is not disabled
let pruneTimer: NodeJS.Timeout | null = null;
if (typeof setInterval !== "undefined") {
  pruneTimer = setInterval(pruneStaleSignatures, 30_000);
  if (pruneTimer.unref) pruneTimer.unref();
}

export class DecantCrypto {
  /**
   * Resets the anti-replay cache (useful in automated test suites).
   */
  public static resetReplayCache(): void {
    seenSignatures.clear();
  }

  /**
   * Generates a deterministic message hash for signature validation.
   */
  public static createDigest(
    method: string,
    path: string,
    timestamp: number,
    body: string = ""
  ): Uint8Array {
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const payload = `${method.toUpperCase()}:${path}:${timestamp}:${bodyHash}`;
    return createHash("sha256").update(payload).digest();
  }

  /**
   * Mathematically verifies an Ed25519 signature against the registered public key,
   * enforcing anti-replay window and replay prevention.
   *
   * @param publicKeyBase58 - Public key string, e.g. "ed25519:6E8..." or raw base58
   * @param signatureHex    - Hex-encoded Ed25519 signature
   * @param method          - HTTP Method (e.g. "POST")
   * @param path            - URL Path (e.g. "/v1/chat/completions")
   * @param timestamp       - Epoch millisecond timestamp passed in headers
   * @param body            - Request body string
   */
  public static verifySignature(
    publicKeyBase58: string,
    signatureHex: string,
    method: string,
    path: string,
    timestamp: number,
    body: string = ""
  ): boolean {
    if (!signatureHex || typeof signatureHex !== "string") {
      return false;
    }

    const now = Date.now();
    // Replay attack defense 1: timestamp must be within drift window
    if (Math.abs(now - timestamp) > MAX_DRIFT_MS) {
      return false;
    }

    // Replay attack defense 2: duplicate signature replay prevention
    if (seenSignatures.has(signatureHex)) {
      return false; // Exact signature already processed
    }

    try {
      const pubKey = PublicKey.fromString(
        publicKeyBase58.startsWith("ed25519:") ? publicKeyBase58 : `ed25519:${publicKeyBase58}`
      );

      const digest = this.createDigest(method, path, timestamp, body);
      const signatureBytes = Buffer.from(signatureHex, "hex");

      const isValid = pubKey.verify(digest, signatureBytes);
      if (isValid) {
        seenSignatures.set(signatureHex, now);
      }
      return isValid;
    } catch {
      return false;
    }
  }
}
