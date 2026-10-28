import { describe, expect, it } from 'vitest';
import { backendSocketUrl, encodeFrame, parseDetectionResult } from '../services/protocol';

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
