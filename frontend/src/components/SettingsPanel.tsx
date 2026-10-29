import type { ModelOption, Settings } from '../types/detection';
import { DETECTION_PRESETS } from '../services/settings';

export function SettingsPanel({
  settings,
  update,
  model,
  provider,
  independentDetail = true,
  classCount,
  models,
  modelSelection = false,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  model?: string;
  provider?: string;
  independentDetail?: boolean;
  classCount?: number | null;
  models?: ModelOption[];
  modelSelection?: boolean;
}) {
  return (
    <section className="settings-panel">
      <h2>Inference configuration</h2>
      <div className="settings-body">
        <label className="field">
          <span>Vision mode</span>
          <select
            value={settings.model}
            disabled={!modelSelection && settings.model === 'objects'}
            onChange={(event) => update({ model: event.target.value as Settings['model'] })}
          >
            {(
              models ?? [
                { id: 'objects', name: 'Object detection', available: true },
                { id: 'hands', name: 'Hands & fingers', available: false },
                { id: 'measurement', name: 'Object measurement', available: false },
              ]
            ).map((option) => (
              <option key={option.id} value={option.id} disabled={!option.available}>
                {option.name}
                {!option.available ? ' · Not installed' : ''}
              </option>
            ))}
          </select>
          <small>
            {!modelSelection
              ? 'Connect to an updated backend to discover available models.'
              : settings.model === 'hands'
                ? 'Detect up to two hands, draw 21 joints per hand, and estimate raised fingers. Keep the whole hand visible.'
                : settings.model === 'measurement'
                  ? 'Measure detected bounding boxes. Add a known reference width for approximate real-world dimensions.'
                  : 'Identify objects and draw their bounding boxes.'}
          </small>
        </label>
        {models?.some((option) => !option.available) && (
          <details className="model-setup">
            <summary>Model setup needed</summary>
            {models
              .filter((option) => !option.available)
              .map((option) => (
                <p key={option.id}>
                  <strong>{option.name}:</strong> {option.reason}
                </p>
              ))}
          </details>
        )}
        <dl className="model-info">
          <div>
            <dt>Model</dt>
            <dd>{model ?? '—'}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{provider ?? '—'}</dd>
          </div>
          <div>
            <dt>Vocabulary</dt>
            <dd>{classCount ? `${classCount.toLocaleString()} classes` : '—'}</dd>
          </div>
        </dl>
        <div className="preset-buttons" aria-label="Detection presets">
          {Object.entries(DETECTION_PRESETS).map(([name, preset]) => (
            <button type="button" key={name} onClick={() => update(preset)}>
              {name}
            </button>
          ))}
        </div>
        <p className="field-help">
          Live continuously reads the newest camera frame as fast as the server allows, up to 10
          FPS. Detail favors small objects and takes longer between readings.
        </p>
        <label className="field range-field">
          <span>
            {settings.model === 'hands' ? 'Hand detection threshold' : 'Confidence'}
            <output>{settings.confidence.toFixed(2)}</output>
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
          <span>Inference size</span>
          <select
            value={settings.inferenceSize}
            disabled={!independentDetail || settings.model === 'hands'}
            onChange={(event) =>
              update({ inferenceSize: Number(event.target.value) as Settings['inferenceSize'] })
            }
          >
            <option value={320}>320 · Fast</option>
            <option value={640}>640 · Balanced</option>
            <option value={960}>960 · Detail</option>
          </select>
          <small>
            {settings.model === 'hands'
              ? 'Hand landmarks use a fixed model input. Increase transmitted frame size to retain source detail.'
              : independentDetail
                ? 'Larger inputs can find smaller objects; processing takes longer. Use a larger frame size to retain source detail.'
                : 'Update the backend to control inference size separately. This server uses frame size.'}
          </small>
        </label>
        <label className="field">
          <span>Transmitted frame size</span>
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
