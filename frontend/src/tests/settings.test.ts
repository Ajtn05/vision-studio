import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DETECTION_PRESETS,
  loadSettings,
  saveSettings,
} from '../services/settings';

function restore(saved: unknown) {
  const storage = { getItem: vi.fn(() => JSON.stringify(saved)), setItem: vi.fn() };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

afterEach(() => vi.unstubAllGlobals());

describe('live reading settings', () => {
  it('uses the Live preset for a new session', () => {
    restore({});
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject(DETECTION_PRESETS.Live);
  });

  it.each([undefined, 640])(
    'upgrades the former defaults with inference size %s',
    (inferenceSize) => {
      restore({
        backendUrl: 'ws://localhost:8000',
        resolution: '640x360',
        inferenceSize,
        targetFps: 5,
        confidence: 0.4,
        jpegQuality: 0.65,
        mirrored: false,
      });
      expect(loadSettings()).toEqual({
        ...DEFAULT_SETTINGS,
        backendUrl: 'ws://localhost:8000',
        mirrored: false,
      });
    },
  );

  it('preserves selected detail and sampling preferences across a save and restore', () => {
    const selected = { ...DEFAULT_SETTINGS, ...DETECTION_PRESETS.Detail, targetFps: 2 };
    const storage = restore(selected);
    expect(loadSettings()).toEqual(selected);
    expect(saveSettings(selected)).toBeNull();
    expect(storage.setItem).toHaveBeenCalledWith(
      'vision-studio.settings.v1',
      JSON.stringify(selected),
    );
  });
});
