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
  private lastResultAt = 0;
  private completions: number[] = [];
  private openedAt = 0;
  private pingSentAt = 0;
  private pingNonce = 0;
  private awaitingPong = false;
  private retries = 0;
  private snapshot = emptySnapshot();
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
    this.timer = setInterval(() => this.tick(), 250);
  }

  private open(): void {
    if (!this.desired) return;
    this.generation++;
    this.ready = false;
    this.pending = null;
    this.lastResultId = 0;
    this.nextFrameId = 1;
    this.completions = [];
    this.lastResultAt = 0;
    this.awaitingPong = false;
    this.openedAt = performance.now();
    this.publish({
      state: this.retries ? 'reconnecting' : 'connecting',
      result: null,
      stale: false,
      inferenceFps: null,
      networkRttMs: null,
      frameLatencyMs: null,
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
      socket.send(JSON.stringify({ type: 'configure', revision: this.revision, ...this.config }));
      this.sendPing();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      try {
        this.receive(event.data);
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
      this.publish({
        result: null,
        stale: false,
        inferenceFps: null,
        networkRttMs: null,
        frameLatencyMs: null,
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
      const age = performance.now() - this.pending.started;
      this.pending = null;
      if (result.frame_id <= this.lastResultId || result.revision !== this.revision) return;
      if (age > STALE_AFTER_MS) {
        this.lastResultAt = performance.now() - STALE_AFTER_MS - 1;
        this.publish({ result: null, stale: true, frameLatencyMs: null });
        return;
      }
      this.lastResultId = result.frame_id;
      this.lastResultAt = performance.now();
      this.completions.push(this.lastResultAt);
      this.publish({ result, stale: false, frameLatencyMs: age, error: null });
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
      config.resolution === this.config.resolution
    )
      return;
    this.config = config;
    this.revision++;
    this.ready = false;
    this.openedAt = performance.now();
    this.clearDetections();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'configure', revision: this.revision, ...config }));
    }
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
    this.lastResultAt = 0;
    this.completions = [];
    this.publish({ result: null, stale: false, inferenceFps: null, frameLatencyMs: null });
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
    const stale = this.lastResultAt > 0 && now - this.lastResultAt > STALE_AFTER_MS;
    const elapsed =
      this.completions.length >= 2 ? this.completions.at(-1)! - this.completions[0] : 0;
    const inferenceFps = stale
      ? 0
      : elapsed > 0
        ? ((this.completions.length - 1) * 1000) / elapsed
        : null;
    if (stale !== this.snapshot.stale || inferenceFps !== this.snapshot.inferenceFps)
      this.publish({ stale, inferenceFps });
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
