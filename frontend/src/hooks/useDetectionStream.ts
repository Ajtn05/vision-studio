import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Settings } from '../types/detection';
import { DetectionSocket, emptySnapshot } from '../services/detectionSocket';
import { startFrameCapture } from '../services/frameCapture';

export function useDetectionStream(
  videoRef: RefObject<HTMLVideoElement | null>,
  cameraActive: boolean,
  settings: Settings,
  cameraDeviceId: string,
) {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const client = useRef<DetectionSocket | null>(null);
  const maxFps = snapshot.info?.supported_options?.max_fps ?? 10;

  useEffect(() => {
    const connection = new DetectionSocket(setSnapshot);
    client.current = connection;
    return () => {
      client.current = null;
      connection.disconnect();
    };
  }, []);

  useEffect(() => {
    client.current?.configure({
      confidence: settings.confidence,
      resolution: settings.resolution,
      inference_size: settings.inferenceSize,
      model: settings.model,
    });
  }, [settings.confidence, settings.resolution, settings.inferenceSize, settings.model]);

  useEffect(() => {
    client.current?.clearDetections();
    setCaptureError(null);
    const video = videoRef.current;
    if (!cameraActive || !video || !client.current) return;
    return startFrameCapture(video, client.current, { ...settings, maxFps }, setCaptureError);
  }, [
    videoRef,
    cameraActive,
    cameraDeviceId,
    settings.resolution,
    settings.targetFps,
    settings.jpegQuality,
    maxFps,
  ]);

  return {
    ...snapshot,
    captureError,
    connect: () =>
      client.current?.connect(settings.backendUrl, {
        confidence: settings.confidence,
        resolution: settings.resolution,
        inference_size: settings.inferenceSize,
        model: settings.model,
      }),
    disconnect: () => client.current?.disconnect(),
  };
}
