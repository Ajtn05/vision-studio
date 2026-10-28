import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Settings } from '../types/detection';
import { DetectionSocket, emptySnapshot } from '../services/detectionSocket';
import { fitFrame } from '../utils/coordinates';

export function useDetectionStream(
  videoRef: RefObject<HTMLVideoElement | null>,
  cameraActive: boolean,
  settings: Settings,
  cameraDeviceId: string,
) {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const client = useRef<DetectionSocket | null>(null);

  useEffect(() => {
    const connection = new DetectionSocket(setSnapshot);
    client.current = connection;
    return () => {
      client.current = null;
      connection.disconnect();
    };
  }, []);

  useEffect(() => {
    client.current?.configure({ confidence: settings.confidence, resolution: settings.resolution });
  }, [settings.confidence, settings.resolution]);

  useEffect(() => {
    client.current?.clearDetections();
    setCaptureError(null);
    if (!cameraActive) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      setCaptureError('This webview does not support frame capture.');
      return;
    }
    let cancelled = false;
    let encoding = false;
    let lastCaptured = -Infinity;
    const [maxWidth, maxHeight] = settings.resolution.split('x').map(Number);
    const timer = setInterval(() => {
      const socket = client.current;
      const video = videoRef.current;
      const now = performance.now();
      if (
        cancelled ||
        encoding ||
        document.hidden ||
        !socket?.canSend() ||
        !video ||
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        now - lastCaptured < 1000 / settings.targetFps
      )
        return;
      const { width, height } = fitFrame(video.videoWidth, video.videoHeight, maxWidth, maxHeight);
      canvas.width = width;
      canvas.height = height;
      const generation = socket.generation;
      const revision = socket.configurationRevision;
      const capturedAt = Date.now();
      encoding = true;
      lastCaptured = now;
      try {
        // Draw the unmirrored source. Mirroring is a preview-only presentation choice.
        context.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (jpeg) => {
            encoding = false;
            if (cancelled) return;
            if (!jpeg) {
              setCaptureError('JPEG encoding failed. Restart the camera.');
              return;
            }
            try {
              socket.sendFrame(jpeg, capturedAt, now, generation, revision);
            } catch (error) {
              setCaptureError(`Frame transmission failed: ${(error as Error).message}`);
            }
          },
          'image/jpeg',
          settings.jpegQuality,
        );
      } catch (error) {
        encoding = false;
        setCaptureError(`Frame capture failed: ${(error as Error).message}`);
      }
    }, 20);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    videoRef,
    cameraActive,
    cameraDeviceId,
    settings.resolution,
    settings.targetFps,
    settings.jpegQuality,
  ]);

  return {
    ...snapshot,
    captureError,
    connect: () =>
      client.current?.connect(settings.backendUrl, {
        confidence: settings.confidence,
        resolution: settings.resolution,
      }),
    disconnect: () => client.current?.disconnect(),
  };
}
