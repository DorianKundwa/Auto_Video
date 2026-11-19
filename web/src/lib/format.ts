export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

export function formatUsd(usd: number): string {
  if (usd === 0) return '$0.0000';
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(3)}`;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  done: 'Done',
  stale: 'Stale',
  failed: 'Failed',
};

export function statusClass(status: string | undefined): string {
  switch (status) {
    case 'done':
      return 'status-done';
    case 'running':
      return 'status-running';
    case 'failed':
      return 'status-failed';
    case 'stale':
      return 'status-stale';
    default:
      return 'status-pending';
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
