import type { Settings } from '../types/detection';

const KEY = 'vision-studio.settings.v1';
export const DEFAULT_SETTINGS: Settings = {
  backendUrl: '',
  confidence: 0.4,
  resolution: '640x360',
  targetFps: 5,
  jpegQuality: 0.65,
  mirrored: true,
};

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      backendUrl:
        typeof saved.backendUrl === 'string' && !/[@?#]/.test(saved.backendUrl)
          ? saved.backendUrl
          : '',
      confidence:
        typeof saved.confidence === 'number' && saved.confidence >= 0.05 && saved.confidence <= 0.95
          ? saved.confidence
          : 0.4,
      resolution: ['320x180', '640x360', '960x540'].includes(saved.resolution)
        ? saved.resolution
        : '640x360',
      targetFps: [1, 2, 5, 10].includes(saved.targetFps) ? saved.targetFps : 5,
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
