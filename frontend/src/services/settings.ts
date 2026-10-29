import type { Settings } from '../types/detection';

const KEY = 'vision-studio.settings.v1';
export const DEFAULT_SETTINGS: Settings = {
  backendUrl: '',
  confidence: 0.4,
  resolution: '320x180',
  inferenceSize: 320,
  targetFps: 10,
  jpegQuality: 0.65,
  mirrored: true,
};

export const DETECTION_PRESETS = {
  Live: {
    resolution: '320x180',
    inferenceSize: 320,
    targetFps: 10,
    jpegQuality: 0.65,
    confidence: 0.4,
  },
  Balanced: {
    resolution: '640x360',
    inferenceSize: 640,
    targetFps: 10,
    jpegQuality: 0.8,
    confidence: 0.35,
  },
  Detail: {
    resolution: '960x540',
    inferenceSize: 960,
    targetFps: 5,
    jpegQuality: 0.85,
    confidence: 0.25,
  },
} satisfies Record<string, Partial<Settings>>;

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    // Upgrade the old untouched defaults to the live preset. Preserve any
    // explicitly selected detail, confidence, quality, or sampling settings.
    const legacyDefaults =
      saved.resolution === '640x360' &&
      (saved.inferenceSize === undefined || saved.inferenceSize === 640) &&
      saved.targetFps === 5 &&
      saved.confidence === 0.4 &&
      saved.jpegQuality === 0.65;
    const restored = legacyDefaults ? { ...saved, ...DETECTION_PRESETS.Live } : saved;
    return {
      backendUrl:
        typeof saved.backendUrl === 'string' && !/[@?#]/.test(saved.backendUrl)
          ? saved.backendUrl
          : '',
      confidence:
        typeof saved.confidence === 'number' && saved.confidence >= 0.05 && saved.confidence <= 0.95
          ? saved.confidence
          : 0.4,
      resolution: ['320x180', '640x360', '960x540'].includes(restored.resolution)
        ? restored.resolution
        : DEFAULT_SETTINGS.resolution,
      inferenceSize: [320, 640, 960].includes(restored.inferenceSize)
        ? restored.inferenceSize
        : DEFAULT_SETTINGS.inferenceSize,
      targetFps: [1, 2, 5, 10].includes(restored.targetFps)
        ? restored.targetFps
        : DEFAULT_SETTINGS.targetFps,
      jpegQuality:
        typeof saved.jpegQuality === 'number' &&
        saved.jpegQuality >= 0.3 &&
        saved.jpegQuality <= 0.9
          ? saved.jpegQuality
          : 0.65,
      mirrored: typeof saved.mirrored === 'boolean' ? saved.mirrored : true,
    };
  } catch (error) {
    console.warn('Could not restore Vision Studio settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): string | null {
  try {
    const safeUrl = /[@?#]/.test(settings.backendUrl) ? '' : settings.backendUrl;
    localStorage.setItem(KEY, JSON.stringify({ ...settings, backendUrl: safeUrl }));
    return null;
  } catch (error) {
    console.warn('Could not save Vision Studio settings:', error);
    return 'Settings could not be saved locally. They still apply to this session.';
  }
}
