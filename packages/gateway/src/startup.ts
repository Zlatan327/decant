/**
 * startup.ts — Tell the operator, at boot, exactly what is and is not ready.
 *
 * WHY THIS EXISTS
 * The gateway deliberately "fails closed": with no operator key every
 * management route returns 503, and with no provider every inference request
 * returns 503. That is the right security posture, but a first-time user who
 * just ran `npm run dev:gateway` sees a healthy-looking server and then a
 * stream of confusing errors in the console. This module turns those silent
 * conditions into a short, actionable checklist printed once at startup.
 *
 * It is a pure function of its inputs (no env reads, no I/O) so it is trivial
 * to test. `proxy.ts` gathers the inputs and prints the report.
 */

export type StartupLevel = "ok" | "warn" | "info";

export interface StartupFinding {
  level: StartupLevel;
  /** What is the situation. */
  message: string;
  /** What to do about it (only for warnings). */
  fix?: string;
}

export interface StartupInputs {
  /** Value of DECANT_ADMIN_KEY (undefined or empty when unset). */
  adminKey: string | undefined;
  /** True when a provider endpoint/model is configured (DecantComputeEngine.configured). */
  inferenceConfigured: boolean;
  /** Models the gateway will accept (DecantComputeEngine.models). */
  models: string[];
  /** Interface the server is bound to, e.g. 127.0.0.1 or 0.0.0.0. */
  host: string;
  /** Raw CORS_ORIGINS value (undefined when unset). */
  corsOrigins: string | undefined;
}

/** Shorter than this is guessable enough that we say so. Matches `openssl rand -hex 16` and up. */
export const MIN_ADMIN_KEY_LENGTH = 32;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/** One command that works on any machine that has Node (the project requires it anyway). */
export const GENERATE_KEY_COMMAND =
  "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"";

export function checkStartup(input: StartupInputs): StartupFinding[] {
  const findings: StartupFinding[] = [];
  const adminKey = input.adminKey?.trim() ?? "";

  if (!adminKey) {
    findings.push({
      level: "warn",
      message: "DECANT_ADMIN_KEY is not set. Operator routes (sessions, top-ups, ledger) will answer 503.",
      fix: `Generate one with: ${GENERATE_KEY_COMMAND}  then put it in .env as DECANT_ADMIN_KEY=<value>`,
    });
  } else if (adminKey.length < MIN_ADMIN_KEY_LENGTH) {
    findings.push({
      level: "warn",
      message: `DECANT_ADMIN_KEY is only ${adminKey.length} characters; it is the only thing protecting credit allocation.`,
      fix: `Use at least ${MIN_ADMIN_KEY_LENGTH} random characters: ${GENERATE_KEY_COMMAND}`,
    });
  } else {
    findings.push({ level: "ok", message: "Operator key configured." });
  }

  if (!input.inferenceConfigured) {
    findings.push({
      level: "warn",
      message: "No inference provider is configured. Inference requests will answer 503.",
      fix: "Set UPSTREAM_BASE_URL + UPSTREAM_MODEL (OpenAI-compatible), or GEMINI_API_KEY + GEMINI_MODEL, in .env",
    });
  } else {
    findings.push({ level: "ok", message: `Inference provider configured. Models: ${input.models.join(", ")}.` });
  }

  const cors = input.corsOrigins?.trim();
  if (!LOOPBACK_HOSTS.has(input.host) && (!cors || cors === "*")) {
    findings.push({
      level: "warn",
      message: `Listening on ${input.host} with CORS open to any website.`,
      fix: "Set CORS_ORIGINS to your dashboard's exact https:// origin, and put the gateway behind an HTTPS proxy",
    });
  }

  findings.push({
    level: "info",
    message: "Accounting is local SQLite. NEAR is not connected, so no on-chain settlement or payouts occur.",
  });
  return findings;
}

/** Render findings as a compact console block. */
export function formatStartupReport(findings: StartupFinding[], url: string): string {
  const icon: Record<StartupLevel, string> = { ok: "[ok]  ", warn: "[warn]", info: "[info]" };
  const lines = [`[decant-gateway] Ready at ${url}`];
  for (const finding of findings) {
    lines.push(`  ${icon[finding.level]} ${finding.message}`);
    if (finding.fix) lines.push(`         fix: ${finding.fix}`);
  }
  const warnings = findings.filter((finding) => finding.level === "warn").length;
  lines.push(warnings === 0
    ? "  Everything needed for a first request is configured."
    : `  ${warnings} item(s) above need attention before the gateway is fully usable.`);
  return lines.join("\n");
}
