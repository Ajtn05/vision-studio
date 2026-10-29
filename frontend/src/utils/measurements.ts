import type {
  Detection,
  DetectionResult,
  MeasurementCalibration,
  MeasurementUnit,
} from '../types/detection';

export function calibrateWidth(
  object: Detection,
  result: DetectionResult,
  knownWidth: number,
  unit: MeasurementUnit,
): MeasurementCalibration | null {
  if (
    !Number.isFinite(knownWidth) ||
    knownWidth <= 0 ||
    knownWidth > 100_000 ||
    object.width * result.image_width < 5
  )
    return null;
  return {
    unitsPerImageWidth: knownWidth / object.width,
    aspectRatio: result.image_width / result.image_height,
    unit,
    referenceLabel: object.label,
  };
}

export function objectDimensions(
  object: Detection,
  result: DetectionResult,
  calibration: MeasurementCalibration | null,
) {
  // Normalized widths keep the same scale when only transmission resolution
  // changes. Reject calibration if the camera's image shape changes.
  if (
    calibration &&
    Math.abs(result.image_width / result.image_height - calibration.aspectRatio) < 0.01
  ) {
    return {
      width: object.width * calibration.unitsPerImageWidth,
      height: (object.height * calibration.unitsPerImageWidth) / calibration.aspectRatio,
      unit: calibration.unit,
    };
  }
  return {
    width: object.width * result.image_width,
    height: object.height * result.image_height,
    unit: 'px',
  };
}

export function formatDimensions(dimensions: ReturnType<typeof objectDimensions>): string {
  const precision = dimensions.unit === 'px' ? 0 : 1;
  return `${dimensions.unit === 'px' ? '' : '≈ '}${dimensions.width.toFixed(precision)} × ${dimensions.height.toFixed(precision)} ${dimensions.unit}`;
}
