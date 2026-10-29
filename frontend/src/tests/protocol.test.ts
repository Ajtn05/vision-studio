import { describe, expect, it } from 'vitest';
import {
  backendSocketUrl,
  encodeFrame,
  parseDetectionResult,
  parseServerInfo,
} from '../services/protocol';

export const resultMessage = {
  type: 'detections',
  frame_id: 1,
  captured_at: 1234,
  revision: 1,
  processing_ms: 25,
  inference_ms: 20,
  image_width: 640,
  image_height: 360,
  objects: [
    { class_id: 0, label: 'person', confidence: 0.9, x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  ],
};

describe('binary protocol', () => {
  it('writes network-byte-order metadata alongside JPEG bytes', async () => {
    const data = await encodeFrame(
      new Blob([new Uint8Array([255, 216, 255, 217])]),
      42,
      1234.5,
    ).arrayBuffer();
    const view = new DataView(data);
    expect(new TextDecoder().decode(data.slice(0, 4))).toBe('VS01');
    expect(view.getUint32(4, false)).toBe(42);
    expect(view.getFloat64(8, false)).toBe(1234.5);
    expect([...new Uint8Array(data.slice(16))]).toEqual([255, 216, 255, 217]);
  });
  it('validates real detection response fields and rejects unsafe coordinates', () => {
    expect(parseDetectionResult(resultMessage).objects).toHaveLength(1);
    expect(() => parseDetectionResult({ ...resultMessage, processing_ms: NaN })).toThrow();
    expect(() =>
      parseDetectionResult({
        ...resultMessage,
        objects: [{ ...resultMessage.objects[0], x: 0.9 }],
      }),
    ).toThrow();
    expect(() => parseDetectionResult({ ...resultMessage, image_width: 0 })).toThrow();
  });
  it('validates hand landmark payloads before drawing them', () => {
    const hand = {
      handedness: 'Right',
      landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: -0.1 })),
      extended_fingers: ['thumb', 'index'],
    };
    const message = {
      ...resultMessage,
      model: 'hands',
      objects: [{ ...resultMessage.objects[0], hand }],
    };
    expect(parseDetectionResult(message).objects[0].hand?.extended_fingers).toHaveLength(2);
    for (const patch of [
      { landmarks: hand.landmarks.slice(1) },
      { landmarks: hand.landmarks.map((point) => ({ ...point, z: NaN })) },
      { extended_fingers: ['index', 'index'] },
      { handedness: 'invalid' },
    ])
      expect(() =>
        parseDetectionResult({
          ...message,
          objects: [{ ...message.objects[0], hand: { ...hand, ...patch } }],
        }),
      ).toThrow();
  });
  it('rejects malformed or duplicate model capabilities', () => {
    const info = {
      model_name: 'test',
      provider: 'cpu',
      model_ready: true,
      capabilities: { max_message_bytes: 1048576 },
    };
    expect(() =>
      parseServerInfo({ ...info, models: [{ id: 'hands', name: 'Hands', available: 'yes' }] }),
    ).toThrow();
    const model = { id: 'hands', name: 'Hands', available: true };
    expect(() => parseServerInfo({ ...info, models: [model, model] })).toThrow();
  });
});

describe('private backend URLs', () => {
  it('accepts Tailscale HTTPS/WSS and explicit local development', () => {
    expect(backendSocketUrl('https://server.example.ts.net:8443')).toBe(
      'wss://server.example.ts.net:8443/ws/detect',
    );
    expect(backendSocketUrl('ws://127.0.0.1:8000/ws/detect')).toBe('ws://127.0.0.1:8000/ws/detect');
  });
  it.each([
    'ws://server.example.ts.net',
    'wss://public.example',
    'https://user:pass@server.example.ts.net',
    'https://server.example.ts.net?token=secret',
    'ws://localhost:9000',
    'garbage',
  ])('rejects %s', (url) => {
    expect(() => backendSocketUrl(url)).toThrow();
  });
});
