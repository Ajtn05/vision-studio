export type ConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type Resolution = '320x180' | '640x360' | '960x540';

export interface Detection {
  class_id: number;
  label: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  type: 'detections';
  frame_id: number;
  captured_at: number;
  revision: number;
  processing_ms: number;
  inference_ms: number;
  image_width: number;
  image_height: number;
  objects: Detection[];
}

export interface Settings {
  backendUrl: string;
  confidence: number;
  resolution: Resolution;
  targetFps: number;
  jpegQuality: number;
  mirrored: boolean;
}

export interface RuntimeConfig {
  confidence: number;
  resolution: Resolution;
}

export interface ServerInfo {
  model_name: string;
  provider: string;
  model_ready: boolean;
  capabilities: { max_message_bytes: number };
}

export interface StreamSnapshot {
  state: ConnectionState;
  error: string | null;
  result: DetectionResult | null;
  info: ServerInfo | null;
  stale: boolean;
  inferenceFps: number | null;
  networkRttMs: number | null;
  frameLatencyMs: number | null;
  droppedFrames: number;
}
