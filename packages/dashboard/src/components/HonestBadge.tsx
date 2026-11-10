export type HonestBadgeType = 'Verified' | 'Unverified' | 'Accrued' | 'Sandbox' | 'Testnet' | 'Fail-Closed';

interface HonestBadgeProps {
  type: HonestBadgeType;
  tooltip?: string;
  size?: 'sm' | 'md';
}

const BADGE_CONFIG: Record<HonestBadgeType, { bg: string; color: string; border: string; label: string; defaultTooltip: string }> = {
  Verified: {
    bg: 'rgba(34, 197, 94, 0.12)',
    color: '#22c55e',
    border: 'rgba(34, 197, 94, 0.25)',
    label: 'Verified',
    defaultTooltip: 'Cryptographically verified with signed proof or operator attestation.',
  },
  Unverified: {
    bg: 'rgba(234, 179, 8, 0.12)',
    color: '#eab308',
    border: 'rgba(234, 179, 8, 0.25)',
    label: 'Unverified',
    defaultTooltip: 'Off-chain local record. Awaiting on-chain verification or payout rail.',
  },
  Accrued: {
    bg: 'rgba(59, 130, 246, 0.12)',
    color: '#3b82f6',
    border: 'rgba(59, 130, 246, 0.25)',
    label: 'Accrued (Unpaid)',
    defaultTooltip: 'Solver credits earned but unpaid. Real payout rails arrive in Phase 4.',
  },
  Sandbox: {
    bg: 'rgba(168, 85, 247, 0.12)',
    color: '#a855f7',
    border: 'rgba(168, 85, 247, 0.25)',
    label: 'Sandbox',
    defaultTooltip: 'Simulated environment with mock credits. Zero real fund expenditure.',
  },
  Testnet: {
    bg: 'rgba(14, 165, 233, 0.12)',
    color: '#38bdf8',
    border: 'rgba(14, 165, 233, 0.25)',
    label: 'NEAR Testnet',
    defaultTooltip: 'Running against NEAR Protocol testnet contract (shylibrary4027.testnet).',
  },
  'Fail-Closed': {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#ef4444',
    border: 'rgba(239, 68, 68, 0.25)',
    label: 'Fail-Closed',
    defaultTooltip: 'Circuit breaker or security policy active. Requests fail closed without fallback.',
  },
};

export function HonestBadge({ type, tooltip, size = 'sm' }: HonestBadgeProps) {
  const conf = BADGE_CONFIG[type] ?? BADGE_CONFIG.Unverified;
  const tip = tooltip ?? conf.defaultTooltip;

  return (
    <span
      className="honest-badge"
      title={tip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: size === 'sm' ? '2px 7px' : '4px 10px',
        borderRadius: '4px',
        fontSize: size === 'sm' ? '11px' : '12px',
        fontWeight: 600,
        fontFamily: 'monospace',
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        backgroundColor: conf.bg,
        color: conf.color,
        border: `1px solid ${conf.border}`,
        cursor: 'help',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          backgroundColor: conf.color,
        }}
      />
      {conf.label}
    </span>
  );
}
