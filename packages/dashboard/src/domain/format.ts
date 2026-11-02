const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDateTime(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return '—';
  return dateTimeFormatter.format(new Date(timestamp));
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainder = total % 60;
  return days > 0
    ? `${days}d ${hours}h ${minutes}m`
    : hours > 0
      ? `${hours}h ${minutes}m ${remainder}s`
      : `${minutes}m ${remainder}s`;
}

export function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  return milliseconds >= 1_000 ? `${(milliseconds / 1_000).toFixed(2)} s` : `${Math.round(milliseconds)} ms`;
}

export function shortIdentifier(value: string, edge = 8): string {
  if (value.length <= edge * 2 + 3) return value;
  return `${value.slice(0, edge)}…${value.slice(-edge)}`;
}

export function quotaPercent(remaining: number, total: number): number {
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (remaining / total) * 100));
}

export function isFallbackModel(model: string | null): boolean {
  return model?.startsWith('decant-depin-v1/') ?? false;
}
