import { useEffect, useRef } from 'react';
import type { DetectionResult } from '../types/detection';
import { detectionToCanvas } from '../utils/coordinates';

export const BOX_COLORS = ['#a8b8ff', '#7dd9c4', '#f0c484', '#dfa5e8', '#94ccef'];

export function DetectionOverlay({
  result,
  mirrored,
  visible,
}: {
  result: DetectionResult | null;
  mirrored: boolean;
  visible: boolean;
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
        const label = `${object.label}  ${Math.round(object.confidence * 100)}%`;
        const labelWidth = Math.min(width, context.measureText(label).width + 14);
        const labelX = Math.max(0, Math.min(box.x, width - labelWidth));
        const labelY = Math.max(0, box.y - 24);
        context.fillRect(labelX, labelY, labelWidth, 24);
        context.fillStyle = '#101722';
        context.fillText(label, labelX + 7, labelY + 16, labelWidth - 10);
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [result, mirrored, visible]);
  return <canvas ref={canvasRef} className="detection-overlay" aria-hidden="true" />;
}
