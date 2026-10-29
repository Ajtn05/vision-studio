import { describe, expect, it } from 'vitest';
import { calibrateWidth, formatDimensions, objectDimensions } from '../utils/measurements';
import type { DetectionResult } from '../types/detection';

const object = {
  class_id: 0,
  label: 'reference',
  confidence: 0.9,
  x: 0,
  y: 0,
  width: 0.25,
  height: 0.5,
};
const result: DetectionResult = {
  type: 'detections',
  frame_id: 1,
  captured_at: 0,
  revision: 1,
  processing_ms: 10,
  inference_ms: 5,
  image_width: 640,
  image_height: 360,
  objects: [object],
  model: 'measurement',
};

describe('object measurements', () => {
  it('uses transmitted-image pixels until a scale is provided', () => {
    expect(formatDimensions(objectDimensions(object, result, null))).toBe('160 × 180 px');
  });
  it('calibrates both dimensions using source aspect ratio', () => {
    const scale = calibrateWidth(object, result, 10, 'cm');
    expect(objectDimensions(object, result, scale)).toEqual({
      width: 10,
      height: 11.25,
      unit: 'cm',
    });
    expect(formatDimensions(objectDimensions(object, result, scale))).toBe('≈ 10.0 × 11.3 cm');
    expect(objectDimensions({ ...object, width: 0.5 }, result, scale).width).toBe(20);
  });
  it('preserves calibration when the sampling resolution changes', () => {
    const scale = calibrateWidth(object, result, 4, 'in');
    expect(
      objectDimensions(object, { ...result, image_width: 320, image_height: 180 }, scale),
    ).toEqual({ width: 4, height: 4.5, unit: 'in' });
  });
  it('falls back to pixels when the camera aspect ratio changes', () => {
    const scale = calibrateWidth(object, result, 10, 'cm');
    expect(objectDimensions(object, { ...result, image_height: 480 }, scale).unit).toBe('px');
  });
  it.each([0, -1, NaN, Infinity, 100001])('rejects invalid reference length %s', (width) => {
    expect(calibrateWidth(object, result, width, 'cm')).toBeNull();
  });
  it('rejects reference boxes too small to calibrate reliably', () => {
    expect(calibrateWidth({ ...object, width: 0.001 }, result, 10, 'cm')).toBeNull();
  });
});
