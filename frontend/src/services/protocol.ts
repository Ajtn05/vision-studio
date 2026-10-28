import type { Detection, DetectionResult, ServerInfo } from '../types/detection';

export const FRAME_HEADER_BYTES = 16;
export const STALE_AFTER_MS = 2000;

export function backendSocketUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(
      'Enter a valid backend URL, such as wss://your-server.your-tailnet.ts.net:8443.',
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Use a backend URL without credentials, query parameters, or a fragment.');
  }
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) {
    throw new Error('Remote servers require wss://. Plain ws:// is allowed only on localhost.');
  }
  if (!loopback && !url.hostname.endsWith('.ts.net')) {
    throw new Error('Use the private .ts.net hostname provided by Tailscale Serve.');
  }
  if (loopback && url.port !== '8000') throw new Error('Local development uses port 8000.');
  if (url.pathname !== '/' && url.pathname !== '/ws/detect') {
    throw new Error('Use the server root URL or /ws/detect.');
  }
  url.pathname = '/ws/detect';
  return url.toString();
}

export function encodeFrame(jpeg: Blob, frameId: number, capturedAt: number): Blob {
  const header = new ArrayBuffer(FRAME_HEADER_BYTES);
  const view = new DataView(header);
  new Uint8Array(header).set([0x56, 0x53, 0x30, 0x31]);
  view.setUint32(4, frameId, false);
  view.setFloat64(8, capturedAt, false);
  return new Blob([header, jpeg], { type: 'application/octet-stream' });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, min = 0, max = Number.MAX_VALUE): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isDetection(value: unknown): value is Detection {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.class_id) &&
    finite(value.class_id) &&
    typeof value.label === 'string' &&
    value.label.length > 0 &&
    value.label.length <= 128 &&
    finite(value.confidence, 0, 1) &&
    finite(value.x, 0, 1) &&
    finite(value.y, 0, 1) &&
    finite(value.width, 0, 1) &&
    finite(value.height, 0, 1) &&
    value.x + value.width <= 1.000001 &&
    value.y + value.height <= 1.000001
  );
}

export function parseDetectionResult(value: unknown): DetectionResult {
  if (
    !isRecord(value) ||
    value.type !== 'detections' ||
    !Number.isInteger(value.frame_id) ||
    !finite(value.frame_id, 1, 2 ** 32 - 1) ||
    !Number.isInteger(value.revision) ||
    !finite(value.revision, 1) ||
    !finite(value.captured_at) ||
    !finite(value.processing_ms) ||
    !finite(value.inference_ms) ||
    !Number.isInteger(value.image_width) ||
    !finite(value.image_width, 1, 1280) ||
    !Number.isInteger(value.image_height) ||
    !finite(value.image_height, 1, 720) ||
    !Array.isArray(value.objects) ||
    value.objects.length > 100 ||
    !value.objects.every(isDetection)
  ) {
    throw new Error(
      'The backend sent an invalid detection response. Check that both versions match.',
    );
  }
  return value as unknown as DetectionResult;
}

export function parseServerInfo(value: unknown): ServerInfo {
  if (
    !isRecord(value) ||
    typeof value.model_name !== 'string' ||
    typeof value.provider !== 'string' ||
    typeof value.model_ready !== 'boolean' ||
    !isRecord(value.capabilities) ||
    !finite(value.capabilities.max_message_bytes, 1024, 4_194_304)
  ) {
    throw new Error('The backend sent invalid server information.');
  }
  return value as unknown as ServerInfo;
}
