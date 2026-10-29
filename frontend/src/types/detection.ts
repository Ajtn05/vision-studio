export type ConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type Resolution = '320x180' | '640x360' | '960x540';
export type InferenceSize = 320 | 640 | 960;
export type ModelMode = 'objects' | 'hands' | 'measurement';
export type MeasurementUnit = 'cm' | 'in';
export type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export interface HandDetails {
  handedness: 'Left' | 'Right';
  landmarks: { x: number; y: number; z: number }[];
  extended_fingers: Finger[];
}
export interface ModelOption {
  id: ModelMode;
  name: string;
  available: boolean;
  reason?: string | null;
}
export interface MeasurementCalibration {
  unitsPerImageWidth: number;
  aspectRatio: number;
  unit: MeasurementUnit;
  referenceLabel: string;
}

export interface Detection {
  class_id: number;
  label: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hand?: HandDetails | null;
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
  model?: ModelMode;
}

export interface Settings {
  backendUrl: string;
  confidence: number;
  resolution: Resolution;
  inferenceSize: InferenceSize;
  targetFps: number;
  jpegQuality: number;
  mirrored: boolean;
  model: ModelMode;
}

export interface RuntimeConfig {
  confidence: number;
  resolution: Resolution;
  inference_size?: InferenceSize;
  model?: ModelMode;
}

export interface ServerInfo {
  model_name: string;
  provider: string;
  model_ready: boolean;
  class_count?: number | null;
  active_model?: ModelMode;
  models?: ModelOption[];
  capabilities: { max_message_bytes: number };
  supported_options?: {
    inference_sizes?: InferenceSize[];
    max_fps?: number;
    model_selection?: boolean;
  };
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
  readingAgeMs: number | null;
  droppedFrames: number;
}
