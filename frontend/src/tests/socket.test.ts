import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetectionSocket, emptySnapshot } from '../services/detectionSocket';
import type { StreamSnapshot } from '../types/detection';

class TestWebSocket {
  static OPEN = 1;
  static instances: TestWebSocket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  sent: (string | Blob)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  constructor(public url: string) {
    TestWebSocket.instances.push(this);
  }
  send(value: string | Blob) {
    this.sent.push(value);
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

const config = { confidence: 0.4, resolution: '640x360' as const };
const result = {
  type: 'detections',
  frame_id: 1,
  captured_at: 1234,
  revision: 1,
  processing_ms: 20,
  inference_ms: 15,
  image_width: 640,
  image_height: 360,
  objects: [],
};

describe('detection session', () => {
  let client: DetectionSocket;
  let snapshot: StreamSnapshot;
  let now: number;
  const current = () => TestWebSocket.instances.at(-1)!;
  const ready = () => {
    current().open();
    current().receive({
      type: 'ready',
      config: { revision: 1 },
      info: {
        model_name: 'test',
        provider: 'test',
        model_ready: true,
        capabilities: { max_message_bytes: 1048576 },
      },
    });
  };
  const send = () =>
    client.sendFrame(
      new Blob(['jpeg']),
      1234,
      now,
      client.generation,
      client.configurationRevision,
    );

  beforeEach(() => {
    now = 100;
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('WebSocket', TestWebSocket);
    TestWebSocket.instances = [];
    snapshot = emptySnapshot();
    client = new DetectionSocket((next) => {
      snapshot = next;
    });
    client.connect('ws://localhost:8000', config);
  });
  afterEach(() => {
    client.disconnect();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('requires configure acknowledgement before sending and enforces one in-flight frame', () => {
    expect(snapshot.state).toBe('connecting');
    expect(send()).toBe(false);
    ready();
    expect(snapshot.state).toBe('connected');
    expect(send()).toBe(true);
    expect(send()).toBe(false);
    now += 50;
    current().receive(result);
    expect(snapshot.frameLatencyMs).toBe(50);
    expect(client.canSend()).toBe(true);
  });
  it('disregards mismatched and out-of-order results', () => {
    ready();
    send();
    current().receive({ ...result, frame_id: 99 });
    expect(snapshot.result).toBeNull();
    expect(client.canSend()).toBe(false);
    current().receive(result);
    current().receive({ ...result, objects: ['invalid'] });
    expect(snapshot.state).toBe('error');
  });
  it('does not show an old camera result after clearing the preview', () => {
    ready();
    send();
    client.clearDetections();
    current().receive(result);
    expect(snapshot.result).toBeNull();
    expect(client.canSend()).toBe(true);
  });
  it('rejects encodes belonging to a previous session generation', () => {
    ready();
    const oldGeneration = client.generation;
    client.clearDetections();
    expect(client.sendFrame(new Blob(['jpeg']), 1234, now, oldGeneration, 1)).toBe(false);
  });
  it('discards results already stale on arrival', () => {
    ready();
    send();
    now += 2100;
    current().receive(result);
    expect(snapshot.result).toBeNull();
    expect(snapshot.stale).toBe(true);
  });
  it('expires previously fresh overlays', () => {
    ready();
    send();
    current().receive(result);
    now += 2100;
    vi.advanceTimersByTime(250);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.inferenceFps).toBe(0);
  });
  it('measures reading age from capture, including processing and time on screen', () => {
    ready();
    send();
    now += 1500;
    current().receive(result);
    expect(snapshot.readingAgeMs).toBe(1500);
    expect(snapshot.stale).toBe(false);
    now += 400;
    vi.advanceTimersByTime(100);
    expect(snapshot.readingAgeMs).toBe(1900);
    expect(snapshot.stale).toBe(false);
    now += 200;
    vi.advanceTimersByTime(100);
    expect(snapshot.readingAgeMs).toBe(2100);
    expect(snapshot.stale).toBe(true);
  });
  it('continuously releases capacity for new readings and recovers from a late result', () => {
    ready();
    send();
    now += 2100;
    current().receive(result);
    expect(snapshot.stale).toBe(true);
    for (let frame = 2; frame <= 30; frame++) {
      expect(send()).toBe(true);
      now += 50;
      current().receive({ ...result, frame_id: frame });
      expect(snapshot.result?.frame_id).toBe(frame);
      expect(snapshot.stale).toBe(false);
      expect(snapshot.readingAgeMs).toBe(50);
    }
    client.clearDetections();
    expect(snapshot.readingAgeMs).toBeNull();
  });
  it('measures ping RTT only for the matching nonce', () => {
    ready();
    now += 25;
    current().receive({ type: 'pong', nonce: 999 });
    expect(snapshot.networkRttMs).toBeNull();
    current().receive({ type: 'pong', nonce: 1 });
    expect(snapshot.networkRttMs).toBe(25);
  });
  it('reconnects after an interruption and cancels retries on explicit disconnect', () => {
    ready();
    current().close(1006);
    expect(snapshot.state).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(TestWebSocket.instances).toHaveLength(2);
    client.disconnect();
    vi.advanceTimersByTime(30000);
    expect(snapshot.state).toBe('disconnected');
    expect(TestWebSocket.instances).toHaveLength(2);
  });
  it('does not retry policy rejection', () => {
    current().close(1008);
    vi.advanceTimersByTime(10000);
    expect(snapshot.state).toBe('error');
    expect(TestWebSocket.instances).toHaveLength(1);
  });
  it('suspends capture until the latest settings are acknowledged', () => {
    ready();
    client.configure({ ...config, confidence: 0.7 });
    expect(client.canSend()).toBe(false);
    current().receive({ type: 'ready', config: { revision: 1 } });
    expect(client.canSend()).toBe(false);
  });
  it('drops frames while the browser send buffer is occupied', () => {
    ready();
    current().bufferedAmount = 10;
    expect(send()).toBe(false);
  });
  it('negotiates independent inference size only after capability discovery', () => {
    client.connect('ws://localhost:8000', { ...config, inference_size: 960 });
    current().open();
    expect(JSON.parse(current().sent[0] as string)).not.toHaveProperty('inference_size');
    const info = {
      model_name: 'broad-model',
      provider: 'cpu',
      model_ready: true,
      class_count: 4585,
      capabilities: { max_message_bytes: 1048576 },
      supported_options: { inference_sizes: [320, 640, 960] },
    };
    current().receive({ type: 'ready', config: { revision: 1 }, info });
    expect(client.canSend()).toBe(false);
    expect(JSON.parse(current().sent.at(-1) as string)).toMatchObject({
      type: 'configure',
      revision: 2,
      inference_size: 960,
    });
    current().receive({ type: 'ready', config: { revision: 2, inference_size: 960 }, info });
    expect(client.canSend()).toBe(true);
    expect(snapshot.info?.class_count).toBe(4585);
  });
  it('keeps connecting to legacy servers without sending an unsupported field', () => {
    client.connect('ws://localhost:8000', { ...config, inference_size: 960 });
    ready();
    expect(client.canSend()).toBe(true);
    client.configure({ ...config, inference_size: 320 });
    expect(JSON.parse(current().sent.at(-1) as string)).not.toHaveProperty('inference_size');
  });
  it('wakes capture when a stale camera result releases the pending slot', () => {
    const available = vi.fn();
    const unsubscribe = client.subscribeAvailability(available);
    ready();
    expect(available).toHaveBeenCalledTimes(1);
    send();
    client.clearDetections();
    current().receive(result);
    expect(available).toHaveBeenCalledTimes(2);
    unsubscribe();
    vi.advanceTimersByTime(250);
    expect(available).toHaveBeenCalledTimes(2);
  });
});
