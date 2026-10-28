import type { StreamSnapshot } from '../types/detection';

export function PerformanceStats({
  stream,
  active,
  count,
}: {
  stream: StreamSnapshot;
  active: boolean;
  count: number;
}) {
  const fresh = active && stream.state === 'connected' && !stream.stale && stream.result;
  const measurement = (value: number | null | undefined, digits = 0) =>
    value == null ? '—' : value.toFixed(digits);
  const stats = [
    { label: 'Detections', value: fresh ? String(count) : '—', unit: '' },
    {
      label: 'Inference FPS',
      value: measurement(active && stream.state === 'connected' ? stream.inferenceFps : null, 1),
      unit: '',
    },
    {
      label: 'Inference',
      value: measurement(fresh ? stream.result?.inference_ms : null),
      unit: 'ms',
    },
    {
      label: 'Processing',
      value: measurement(fresh ? stream.result?.processing_ms : null),
      unit: 'ms',
    },
    { label: 'RTT', value: measurement(stream.networkRttMs), unit: 'ms' },
    {
      label: 'Frame latency',
      value: measurement(fresh ? stream.frameLatencyMs : null),
      unit: 'ms',
    },
  ];
  return (
    <section className="performance-strip" aria-label="Measured performance">
      {stats.map((stat) => (
        <div className="stat" key={stat.label}>
          <h3>{stat.label}</h3>
          <p>
            <strong>{stat.value}</strong>
            <span>{stat.unit}</span>
          </p>
        </div>
      ))}
    </section>
  );
}
