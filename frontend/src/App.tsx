import { useEffect, useState } from 'react';
import { CameraPreview } from './components/CameraPreview';
import { ConnectionStatus } from './components/ConnectionStatus';
import { DetectionsPanel } from './components/DetectionsPanel';
import { PerformanceStats } from './components/PerformanceStats';
import { SettingsPanel } from './components/SettingsPanel';
import { useCamera } from './hooks/useCamera';
import { useDetectionStream } from './hooks/useDetectionStream';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './services/settings';
import type { Settings } from './types/detection';

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [storageError, setStorageError] = useState<string | null>(null);
  const camera = useCamera();
  const stream = useDetectionStream(camera.videoRef, camera.active, settings, camera.deviceId);
  const sessionActive = ['connected', 'connecting', 'reconnecting'].includes(stream.state);
  const hasFreshResult =
    camera.active && stream.state === 'connected' && !stream.stale && stream.result;
  const objects = hasFreshResult ? stream.result!.objects : [];
  const update = (patch: Partial<Settings>) =>
    setSettings((previous) => ({ ...previous, ...patch }));
  useEffect(() => {
    setStorageError(saveSettings(settings));
  }, [settings]);
  const errors = [camera.error, stream.error, stream.captureError, storageError].filter(Boolean);

  return (
    <div className="studio-shell">
      <header className="app-header">
        <h1>
          Vision Studio <span>v0.1.0</span>
        </h1>
        <ConnectionStatus state={stream.state} />
      </header>
      <main>
        <section className="connection-panel" aria-label="Backend connection">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!sessionActive) stream.connect();
            }}
          >
            <label htmlFor="backend-url">Backend URL</label>
            <input
              id="backend-url"
              type="text"
              inputMode="url"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              value={settings.backendUrl}
              disabled={sessionActive}
              placeholder="wss://server.tailnet.ts.net:8443"
              onChange={(event) => update({ backendUrl: event.target.value })}
            />
            <button
              type="button"
              disabled={!sessionActive && !settings.backendUrl.trim()}
              onClick={sessionActive ? stream.disconnect : stream.connect}
            >
              {sessionActive ? 'Disconnect' : 'Connect'}
            </button>
          </form>
        </section>
        {errors.length > 0 && (
          <div className="error-stack" role="alert">
            {errors.map((error, index) => (
              <p key={index}>{error}</p>
            ))}
          </div>
        )}
        <div className="workspace-grid">
          <div className="view-column">
            <div className="camera-toolbar">
              <label htmlFor="camera-device">Camera</label>
              <select
                id="camera-device"
                value={camera.deviceId}
                disabled={camera.starting}
                onChange={(event) => camera.selectDevice(event.target.value)}
              >
                <option value="">Default device</option>
                {camera.devices.map((device, index) => (
                  <option key={device.deviceId || index} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
              <button
                onClick={camera.active || camera.starting ? camera.stop : () => void camera.start()}
              >
                {camera.active ? 'Stop camera' : camera.starting ? 'Cancel' : 'Start camera'}
              </button>
            </div>
            <CameraPreview
              videoRef={camera.videoRef}
              active={camera.active}
              starting={camera.starting}
              mirrored={settings.mirrored}
              result={stream.result}
              stale={stream.stale}
              connected={stream.state === 'connected'}
              width={camera.dimensions.width}
              height={camera.dimensions.height}
            />
            <PerformanceStats stream={stream} active={camera.active} count={objects.length} />
            <DetectionsPanel objects={objects} waiting={!hasFreshResult} />
          </div>
          <aside className="settings-column">
            <SettingsPanel
              settings={settings}
              update={update}
              model={stream.info?.model_name}
              provider={stream.info?.provider}
            />
            <section className="session-panel">
              <h2>Session</h2>
              <dl>
                <div>
                  <dt>Protocol</dt>
                  <dd>VS01 / JPEG</dd>
                </div>
                <div>
                  <dt>Max in-flight</dt>
                  <dd>1</dd>
                </div>
                <div>
                  <dt>Server-dropped</dt>
                  <dd>{stream.droppedFrames}</dd>
                </div>
                <div>
                  <dt>Results</dt>
                  <dd>{stream.stale ? 'Stale' : hasFreshResult ? 'Current' : 'None'}</dd>
                </div>
              </dl>
              <button
                onClick={() => update({ ...DEFAULT_SETTINGS, backendUrl: settings.backendUrl })}
              >
                Reset settings
              </button>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
