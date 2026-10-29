import type {
  Detection,
  DetectionResult,
  MeasurementCalibration,
  ModelMode,
} from '../types/detection';
import { formatDimensions, objectDimensions } from '../utils/measurements';
import { BOX_COLORS } from './DetectionOverlay';

export function DetectionsPanel({
  objects,
  waiting,
  mode = 'objects',
  result = null,
  calibration = null,
  onReference,
  canCalibrate = false,
}: {
  objects: Detection[];
  waiting: boolean;
  mode?: ModelMode;
  result?: DetectionResult | null;
  calibration?: MeasurementCalibration | null;
  onReference?: (object: Detection) => void;
  canCalibrate?: boolean;
}) {
  return (
    <section className="detections-panel">
      <div className="panel-heading">
        <h2>
          {mode === 'hands'
            ? 'Hands & fingers'
            : mode === 'measurement'
              ? 'Object measurements'
              : 'Detections'}
        </h2>
        <span>
          {mode === 'hands'
            ? `${objects.reduce((sum, object) => sum + (object.hand?.extended_fingers.length ?? 0), 0)} fingers raised · ${objects.length} ${objects.length === 1 ? 'hand' : 'hands'}`
            : objects.length}
        </span>
      </div>
      {objects.length === 0 ? (
        <p className="detections-empty">
          {waiting
            ? 'No detection data'
            : mode === 'hands'
              ? 'No hands detected · show your whole hand to the camera'
              : 'No objects detected'}
        </p>
      ) : (
        <div className="detection-list">
          <table>
            <thead>
              <tr>
                <th>Class</th>
                <th>Label</th>
                <th>{mode === 'hands' ? 'Handedness score' : 'Confidence'}</th>
                {mode === 'hands' && <th>Raised fingers (estimate)</th>}
                {mode === 'measurement' && (
                  <>
                    <th>Width × height</th>
                    <th>Reference</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {objects.map((object, index) => (
                <tr key={`${object.class_id}-${index}`}>
                  <td>{object.class_id}</td>
                  <td>
                    <span
                      className="object-dot"
                      style={{ background: BOX_COLORS[object.class_id % BOX_COLORS.length] }}
                    />
                    {object.label}
                  </td>
                  <td>{object.confidence.toFixed(3)}</td>
                  {mode === 'hands' && (
                    <td>
                      {object.hand
                        ? `${object.hand.extended_fingers.length} · ${object.hand.extended_fingers.join(', ') || 'none'}`
                        : '—'}
                    </td>
                  )}
                  {mode === 'measurement' && result && (
                    <>
                      <td className="dimension-value">
                        {formatDimensions(objectDimensions(object, result, calibration))}
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={!canCalibrate || object.width * result.image_width < 5}
                          title={`Use ${object.label}'s bounding-box width as the known reference`}
                          onClick={() => onReference?.(object)}
                        >
                          Use width
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
