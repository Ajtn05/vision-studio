import { describe, expect, it } from 'vitest';
import { detectionToCanvas, fitFrame } from '../utils/coordinates';

const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

describe('normalized source coordinates', () => {
  it('scales a box to the video content', () => {
    expect(detectionToCanvas(box, 640, 360, 1280, 720, false)).toEqual({
      x: 128,
      y: 144,
      width: 384,
      height: 288,
    });
  });
  it('includes vertical letterbox offsets', () => {
    expect(detectionToCanvas(box, 640, 360, 640, 640, false)).toEqual({
      x: 64,
      y: 212,
      width: 192,
      height: 144,
    });
  });
  it('includes horizontal letterbox offsets', () => {
    expect(detectionToCanvas(box, 400, 400, 800, 400, false)).toEqual({
      x: 240,
      y: 80,
      width: 120,
      height: 160,
    });
  });
  it('mirrors the complete box instead of just its left edge', () => {
    expect(detectionToCanvas(box, 640, 360, 640, 360, true).x).toBeCloseTo(384);
  });
  it('handles an uninitialized video without infinities', () => {
    expect(detectionToCanvas(box, 0, 0, 100, 100, false)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
  it('preserves 4:3 capture aspect ratio within a 16:9 transmission limit', () => {
    expect(fitFrame(1280, 960, 640, 360)).toEqual({ width: 480, height: 360 });
    expect(fitFrame(320, 180, 640, 360)).toEqual({ width: 320, height: 180 });
  });
});
