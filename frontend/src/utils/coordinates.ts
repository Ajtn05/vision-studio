import type { Detection } from '../types/detection';

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Match object-fit: contain, including letterboxing and horizontal mirroring. */
export function detectionToCanvas(
  box: Pick<Detection, 'x' | 'y' | 'width' | 'height'>,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  mirrored: boolean,
): Rectangle {
  if (Math.min(sourceWidth, sourceHeight, canvasWidth, canvasHeight) <= 0)
    return { x: 0, y: 0, width: 0, height: 0 };
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (canvasWidth - width) / 2 + (mirrored ? 1 - box.x - box.width : box.x) * width,
    y: (canvasHeight - height) / 2 + box.y * height,
    width: box.width * width,
    height: box.height * height,
  };
}

export function fitFrame(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
  };
}
