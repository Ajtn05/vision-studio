import type { Settings } from '../types/detection';

export function SettingsPanel({
  settings,
  update,
  model,
  provider,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  model?: string;
  provider?: string;
}) {
  return (
    <section className="settings-panel">
      <h2>Inference configuration</h2>
      <div className="settings-body">
        <dl className="model-info">
          <div>
            <dt>Model</dt>
            <dd>{model ?? '—'}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{provider ?? '—'}</dd>
          </div>
        </dl>
        <label className="field range-field">
          <span>
            Confidence<output>{settings.confidence.toFixed(2)}</output>
          </span>
          <input
            type="range"
            min="0.05"
            max="0.95"
            step="0.05"
            value={settings.confidence}
            onChange={(event) => update({ confidence: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Frame size</span>
          <select
            value={settings.resolution}
            onChange={(event) =>
              update({ resolution: event.target.value as Settings['resolution'] })
            }
          >
            <option value="320x180">320 × 180</option>
            <option value="640x360">640 × 360</option>
            <option value="960x540">960 × 540</option>
          </select>
        </label>
        <label className="field">
          <span>Target FPS</span>
          <select
            value={settings.targetFps}
            onChange={(event) => update({ targetFps: Number(event.target.value) })}
          >
            {[1, 2, 5, 10].map((fps) => (
              <option value={fps} key={fps}>
                {fps}
              </option>
            ))}
          </select>
        </label>
        <label className="field range-field">
          <span>
            JPEG quality<output>{settings.jpegQuality.toFixed(2)}</output>
          </span>
          <input
            type="range"
            min="0.3"
            max="0.9"
            step="0.05"
            value={settings.jpegQuality}
            onChange={(event) => update({ jpegQuality: Number(event.target.value) })}
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={settings.mirrored}
            onChange={(event) => update({ mirrored: event.target.checked })}
          />
          Mirror preview
        </label>
      </div>
    </section>
  );
}
