import type { MeasurementCalibration, MeasurementUnit } from '../types/detection';

export function MeasurementPanel({
  referenceWidth,
  unit,
  calibration,
  updateWidth,
  updateUnit,
  clear,
}: {
  referenceWidth: string;
  unit: MeasurementUnit;
  calibration: MeasurementCalibration | null;
  updateWidth: (value: string) => void;
  updateUnit: (value: MeasurementUnit) => void;
  clear: () => void;
}) {
  return (
    <section className="session-panel" aria-label="Measurement calibration">
      <h2>Measurement scale</h2>
      <div className="settings-body">
        <label className="field">
          <span>Known reference width</span>
          <input
            type="number"
            min="0.01"
            max="100000"
            step="any"
            value={referenceWidth}
            onChange={(event) => updateWidth(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Unit</span>
          <select
            value={unit}
            onChange={(event) => updateUnit(event.target.value as MeasurementUnit)}
          >
            <option value="cm">Centimeters (cm)</option>
            <option value="in">Inches (in)</option>
          </select>
        </label>
        <p className="field-help">
          Enter the real width of a visible object, then choose <strong>Use width</strong> beside
          that object in the table. Until calibrated, dimensions use transmitted-image pixels.
        </p>
        <p className="calibration-status" role="status">
          {calibration
            ? `Scale set from ${calibration.referenceLabel} · ${referenceWidth} ${calibration.unit}`
            : 'Pixel measurements · no reference set'}
        </p>
        <p className="field-help">
          Estimates use the enclosing box, including empty space. Keep the reference and objects on
          the same flat plane, with the camera facing it straight on. Recalibrate after moving the
          camera or objects closer or farther away.
        </p>
        <button type="button" onClick={clear} disabled={!calibration}>
          Clear reference
        </button>
      </div>
    </section>
  );
}
