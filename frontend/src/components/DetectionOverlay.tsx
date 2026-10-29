import { useEffect, useRef } from 'react';
import type { DetectionResult, MeasurementCalibration } from '../types/detection';
import { detectionToCanvas } from '../utils/coordinates';
import { formatDimensions, objectDimensions } from '../utils/measurements';

export const BOX_COLORS = ['#a8b8ff', '#7dd9c4', '#f0c484', '#dfa5e8', '#94ccef'];
const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

export function DetectionOverlay({
  result,
  mirrored,
  visible,
  calibration = null,
}: {
  result: DetectionResult | null;
  mirrored: boolean;
  visible: boolean;
  calibration?: MeasurementCalibration | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const context = canvas.getContext('2d');
      if (!context) return;
      const { width, height } = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.scale(pixelRatio, pixelRatio);
      context.clearRect(0, 0, width, height);
      if (!result || !visible) return;
      context.font = '600 12px system-ui, sans-serif';
      context.lineWidth = 2;
      for (const object of result.objects) {
        const box = detectionToCanvas(
          object,
          result.image_width,
          result.image_height,
          width,
          height,
          mirrored,
        );
        const color = BOX_COLORS[object.class_id % BOX_COLORS.length];
        context.strokeStyle = color;
        context.fillStyle = color;
        context.strokeRect(box.x, box.y, box.width, box.height);
        if (object.hand) {
          const points = object.hand.landmarks.map((point) =>
            detectionToCanvas(
              { ...point, width: 0, height: 0 },
              result.image_width,
              result.image_height,
              width,
              height,
              mirrored,
            ),
          );
          context.beginPath();
          for (const [from, to] of HAND_CONNECTIONS) {
            context.moveTo(points[from].x, points[from].y);
            context.lineTo(points[to].x, points[to].y);
          }
          context.stroke();
          for (let i = 0; i < points.length; i++) {
            context.beginPath();
            context.fillStyle = [4, 8, 12, 16, 20].includes(i) ? '#f0c484' : color;
            context.arc(points[i].x, points[i].y, 3, 0, 2 * Math.PI);
            context.fill();
          }
          context.fillStyle = color;
        }
        const label = object.hand
          ? `${object.label} · ${object.hand.extended_fingers.length} raised`
          : `${object.label}  ${Math.round(object.confidence * 100)}%`;
        const labelWidth = Math.min(width, context.measureText(label).width + 14);
        const labelX = Math.max(0, Math.min(box.x, width - labelWidth));
        const labelY = Math.max(0, box.y - 24);
        context.fillRect(labelX, labelY, labelWidth, 24);
        context.fillStyle = '#101722';
        context.fillText(label, labelX + 7, labelY + 16, labelWidth - 10);
        if (result.model === 'measurement') {
          const text = formatDimensions(objectDimensions(object, result, calibration));
          const textWidth = Math.min(width, context.measureText(text).width + 14);
          const textX = Math.max(0, Math.min(box.x, width - textWidth));
          const textY = Math.max(0, Math.min(height - 24, box.y + box.height + 3));
          context.fillStyle = '#101722e8';
          context.fillRect(textX, textY, textWidth, 24);
          context.fillStyle = color;
          context.fillText(text, textX + 7, textY + 16, textWidth - 10);
          // End ticks make the horizontal extent explicit.
          context.beginPath();
          context.moveTo(box.x, box.y + box.height - 5);
          context.lineTo(box.x, box.y + box.height + 5);
          context.moveTo(box.x + box.width, box.y + box.height - 5);
          context.lineTo(box.x + box.width, box.y + box.height + 5);
          context.stroke();
        }
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [result, mirrored, visible, calibration]);
  return <canvas ref={canvasRef} className="detection-overlay" aria-hidden="true" />;
}
