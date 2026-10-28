import type { ConnectionState } from '../types/detection';

const LABELS: Record<ConnectionState, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Connection error',
};

export function ConnectionStatus({ state }: { state: ConnectionState }) {
  return (
    <span className={`connection-status status-${state}`} role="status">
      <span className="status-dot" />
      {LABELS[state]}
    </span>
  );
}
