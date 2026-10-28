import type { Detection } from '../types/detection';
import { BOX_COLORS } from './DetectionOverlay';

export function DetectionsPanel({ objects, waiting }: { objects: Detection[]; waiting: boolean }) {
  return (
    <section className="detections-panel">
      <div className="panel-heading">
        <h2>Detections</h2>
        <span>{objects.length}</span>
      </div>
      {objects.length === 0 ? (
        <p className="detections-empty">{waiting ? 'No detection data' : 'No objects detected'}</p>
      ) : (
        <div className="detection-list">
          <table>
            <thead>
              <tr>
                <th>Class</th>
                <th>Label</th>
                <th>Confidence</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
