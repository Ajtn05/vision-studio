import type { RuntimeConfig, StreamSnapshot } from '../types/detection';
import {
  backendSocketUrl,
  encodeFrame,
  isRecord,
  parseDetectionResult,
  parseServerInfo,
  STALE_AFTER_MS,
} from './protocol';

export function emptySnapshot(): StreamSnapshot {
  return {
    state: 'disconnected',
    error: null,
    result: null,
    info: null,
    stale: false,
    inferenceFps: null,
    networkRttMs: null,
    frameLatencyMs: null,
    readingAgeMs: null,
    droppedFrames: 0,
  };
}

interface PendingFrame {
  id: number;
  started: number;
  capturedAt: number;
}

/** Owns one WebSocket and its timers. React only subscribes to snapshots. */
export class DetectionSocket {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private desired = false;
  private ready = false;
  private endpoint = '';
  private config: RuntimeConfig = { confidence: 0.4, resolution: '640x360' };
  private revision = 1;
  private nextFrameId = 1;
  private pending: PendingFrame | null = null;
  private lastResultId = 0;
  private lastResultStarted: number | null = null;
  private completions: number[] = [];
  private openedAt = 0;
  private pingSentAt = 0;
  private pingNonce = 0;
  private awaitingPong = false;
  private retries = 0;
  private snapshot = emptySnapshot();
  private availableListeners = new Set<() => void>();
  // An async JPEG encode from an old connection must never enter a new session.
  generation = 0;

  constructor(private readonly onChange: (snapshot: StreamSnapshot) => void) {}

  private publish(patch: Partial<StreamSnapshot> = {}): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onChange(this.snapshot);
  }

  connect(url: string, config: RuntimeConfig): void {
    this.disconnect();
    try {
      this.endpoint = backendSocketUrl(url);
    } catch (error) {
      this.publish({ state: 'error', error: (error as Error).message });
      return;
    }
    this.desired = true;
    this.config = config;
    this.revision = 1;
    this.retries = 0;
    this.open();
    this.timer = setInterval(() => this.tick(), 100);
  }

  private open(): void {
    if (!this.desired) return;
    this.generation++;
    this.ready = false;
    this.pending = null;
    this.lastResultId = 0;
    this.nextFrameId = 1;
    this.completions = [];
    this.lastResultStarted = null;
    this.awaitingPong = false;
    this.openedAt = performance.now();
    this.publish({
      state: this.retries ? 'reconnecting' : 'connecting',
      result: null,
      stale: false,
      inferenceFps: null,
      networkRttMs: null,
      frameLatencyMs: null,
      readingAgeMs: null,
      info: null,
    });
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.endpoint);
    } catch (error) {
      this.stopWithError((error as Error).message);
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.openedAt = performance.now();
      this.sendConfiguration();
      this.sendPing();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      try {
        this.receive(event.data);
        this.notifyAvailable();
      } catch (error) {
        this.stopWithError((error as Error).message);
      }
    };
    socket.onerror = () => {
      if (this.socket === socket)
        this.publish({
          error:
            'Cannot reach the backend. Check Tailscale, the URL, TLS, and the server origin allowlist.',
        });
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.ready = false;
      this.pending = null;
      this.lastResultStarted = null;
      this.publish({
        result: null,
        stale: false,
        inferenceFps: null,
        networkRttMs: null,
        frameLatencyMs: null,
        readingAgeMs: null,
      });
      if (!this.desired) return;
      if (event.code === 1008 || event.code === 1002) {
        this.stopWithError(
          this.snapshot.error ??
            'The backend rejected this session. Check the protocol and origin allowlist.',
        );
        return;
      }
      this.retries++;
      this.publish({ state: 'reconnecting' });
      const delay = Math.min(1000 * 2 ** Math.min(this.retries - 1, 4), 10000);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string' || raw.length > 100_000)
      throw new Error('Unexpected backend message format.');
    const message: unknown = JSON.parse(raw);
    if (!isRecord(message)) throw new Error('Expected a JSON object from the backend.');
    if (message.type === 'ready') {
      if (!isRecord(message.config) || message.config.revision !== this.revision) return;
      const info = parseServerInfo(message.info);
      this.publish({ info });
      const requestedModel = this.config.model ?? 'objects';
      const selected = info.models?.find((model) => model.id === requestedModel);
      // Default-mode clients can still use a hand-only server. Advanced
      // selections must be explicitly available; never silently run another model.
      if (
        requestedModel !== 'objects' &&
        (!selected?.available || !info.supported_options?.model_selection)
      ) {
        throw new Error(
          selected?.reason ??
            'This backend does not support the selected model. Choose Object detection.',
        );
      }
      // Negotiate the extension after a basic handshake, so current clients
      // still connect to servers that reject unknown configuration fields.
      if (
        (this.config.inference_size !== undefined &&
          info.supported_options?.inference_sizes?.includes(this.config.inference_size) &&
          message.config.inference_size !== this.config.inference_size) ||
        (selected?.available &&
          info.supported_options?.model_selection &&
          message.config.model !== requestedModel)
      ) {
        this.revision++;
        this.openedAt = performance.now();
        this.sendConfiguration();
        return;
      }
      this.ready = true;
      this.retries = 0;
      this.publish({ state: 'connected', error: null, info });
    } else if (message.type === 'pong') {
      if (this.awaitingPong && message.nonce === this.pingNonce) {
        this.awaitingPong = false;
        this.publish({ networkRttMs: performance.now() - this.pingSentAt });
      }
    } else if (message.type === 'detections') {
      const result = parseDetectionResult(message);
      if (
        !this.pending ||
        result.frame_id !== this.pending.id ||
        result.captured_at !== this.pending.capturedAt
      )
        return;
      const now = performance.now();
      const started = this.pending.started;
      const age = now - started;
      this.pending = null;
      if (result.frame_id <= this.lastResultId || result.revision !== this.revision) return;
      if (age > STALE_AFTER_MS) {
        this.lastResultStarted = started;
        this.publish({ result: null, stale: true, frameLatencyMs: null, readingAgeMs: age });
        return;
      }
      this.lastResultId = result.frame_id;
      this.lastResultStarted = started;
      this.completions.push(now);
      this.publish({ result, stale: false, frameLatencyMs: age, readingAgeMs: age, error: null });
    } else if (message.type === 'dropped') {
      if (message.frame_id === this.pending?.id) {
        this.pending = null;
        this.publish({ droppedFrames: this.snapshot.droppedFrames + 1 });
      }
    } else if (message.type === 'error') {
      const error = typeof message.message === 'string' ? message.message : 'Backend error.';
      if (message.frame_id === this.pending?.id) this.pending = null;
      this.publish({ error });
      if (
        message.fatal === true &&
        message.code !== 'unavailable' &&
        message.code !== 'inference_timeout'
      ) {
        this.stopWithError(error);
      }
    } else {
      throw new Error('Unsupported backend message. Check that both protocol versions match.');
    }
  }

  configure(config: RuntimeConfig): void {
    if (
      config.confidence === this.config.confidence &&
      config.resolution === this.config.resolution &&
      config.inference_size === this.config.inference_size &&
      config.model === this.config.model
    )
      return;
    this.config = config;
    this.revision++;
    this.ready = false;
    this.openedAt = performance.now();
    this.clearDetections();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendConfiguration();
    }
  }

  private sendConfiguration(): void {
    const { confidence, resolution, inference_size, model } = this.config;
    const supported =
      inference_size !== undefined &&
      this.snapshot.info?.supported_options?.inference_sizes?.includes(inference_size);
    this.socket?.send(
      JSON.stringify({
        type: 'configure',
        revision: this.revision,
        confidence,
        resolution,
        ...(supported ? { inference_size } : {}),
        ...(this.snapshot.info?.supported_options?.model_selection &&
        this.snapshot.info.models?.some((option) => option.id === model && option.available)
          ? { model }
          : {}),
      }),
    );
  }

  subscribeAvailability(listener: () => void): () => void {
    this.availableListeners.add(listener);
    if (this.canSend()) listener();
    return () => {
      this.availableListeners.delete(listener);
    };
  }

  private notifyAvailable(): void {
    if (this.canSend()) this.availableListeners.forEach((listener) => listener());
  }

  get configurationRevision(): number {
    return this.revision;
  }

  canSend(): boolean {
    return (
      this.ready &&
      this.socket?.readyState === WebSocket.OPEN &&
      this.pending === null &&
      this.socket.bufferedAmount === 0
    );
  }

  sendFrame(
    jpeg: Blob,
    capturedAt: number,
    started: number,
    generation: number,
    revision: number,
  ): boolean {
    if (!this.canSend() || generation !== this.generation || revision !== this.revision)
      return false;
    if (jpeg.size + 16 > (this.snapshot.info?.capabilities.max_message_bytes ?? 1_048_576)) {
      this.publish({ error: 'Encoded frame is too large. Lower JPEG quality or resolution.' });
      return false;
    }
    if (this.nextFrameId > 2 ** 32 - 1) {
      this.socket?.close(1000, 'Renew frame IDs');
      return false;
    }
    const id = this.nextFrameId++;
    this.pending = { id, started, capturedAt };
    this.socket!.send(encodeFrame(jpeg, id, capturedAt));
    return true;
  }

  clearDetections(): void {
    this.generation++;
    this.lastResultId = Math.max(this.lastResultId, this.pending?.id ?? 0);
    this.lastResultStarted = null;
    this.completions = [];
    this.publish({
      result: null,
      stale: false,
      inferenceFps: null,
      frameLatencyMs: null,
      readingAgeMs: null,
    });
  }

  private sendPing(): void {
    if (this.socket?.readyState !== WebSocket.OPEN || this.awaitingPong) return;
    this.pingNonce++;
    this.pingSentAt = performance.now();
    this.awaitingPong = true;
    this.socket.send(JSON.stringify({ type: 'ping', nonce: this.pingNonce }));
  }

  private tick(): void {
    const now = performance.now();
    if (
      (!this.ready && now - this.openedAt > 10000) ||
      (this.pending && now - this.pending.started > 20000) ||
      (this.awaitingPong && now - this.pingSentAt > 15000)
    ) {
      this.publish({ error: 'Backend response timed out. Reconnecting…' });
      this.socket?.close(4000, 'Response timeout');
    }
    if (now - this.pingSentAt >= 5000) this.sendPing();
    this.completions = this.completions.filter((completed) => now - completed <= 10000);
    const readingAgeMs = this.lastResultStarted === null ? null : now - this.lastResultStarted;
    const stale = readingAgeMs !== null && readingAgeMs > STALE_AFTER_MS;
    const elapsed =
      this.completions.length >= 2 ? this.completions.at(-1)! - this.completions[0] : 0;
    const inferenceFps = stale
      ? 0
      : elapsed > 0
        ? ((this.completions.length - 1) * 1000) / elapsed
        : null;
    if (
      stale !== this.snapshot.stale ||
      inferenceFps !== this.snapshot.inferenceFps ||
      readingAgeMs !== this.snapshot.readingAgeMs
    )
      this.publish({ stale, inferenceFps, readingAgeMs });
    // Recover if the browser's send buffer cleared after the last response.
    this.notifyAvailable();
  }

  private stopWithError(error: string): void {
    this.disconnect();
    this.publish({ state: 'error', error });
  }

  disconnect(): void {
    this.desired = false;
    this.generation++;
    this.ready = false;
    this.pending = null;
    if (this.timer) clearInterval(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close(1000, 'Session ended');
      this.socket = null;
    }
    this.snapshot = emptySnapshot();
    this.publish();
  }
}
