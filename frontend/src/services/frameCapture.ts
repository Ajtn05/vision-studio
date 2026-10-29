import type { DetectionSocket } from './detectionSocket';
import type { Settings } from '../types/detection';
import { fitFrame } from '../utils/coordinates';

export type CaptureTransport = Pick<
  DetectionSocket,
  'canSend' | 'sendFrame' | 'subscribeAvailability' | 'generation' | 'configurationRevision'
>;

/** Sample fresh video frames only while the server has capacity. Never queue JPEGs. */
export function startFrameCapture(
  video: HTMLVideoElement,
  transport: CaptureTransport,
  settings: Pick<Settings, 'resolution' | 'targetFps' | 'jpegQuality'> & { maxFps?: number },
  onError: (message: string) => void,
): () => void {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    onError('This webview does not support frame capture.');
    return () => {};
  }
  const [maxWidth, maxHeight] = settings.resolution.split('x').map(Number);
  const maxFps = settings.maxFps ?? 10;
  const targetFps = Math.min(settings.targetFps, maxFps);
  // Small encode/network timing variations otherwise cause repeated drops
  // when sending exactly at the server's intake limit.
  const interval = 1000 / targetFps + (targetFps === maxFps ? 5 : 0);
  const useVideoCallback = typeof video.requestVideoFrameCallback === 'function';
  const frameVersion = () => {
    const frames = video.getVideoPlaybackQuality?.().totalVideoFrames;
    // Some camera webviews expose playback quality but always report zero.
    return frames && frames > 0 ? frames : video.currentTime;
  };
  let stopped = false;
  let encoding = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frameRequest: number | null = null;
  let lastCaptured = -Infinity;
  let lastFrameVersion = -Infinity;

  const schedule = () => {
    if (
      stopped ||
      encoding ||
      document.hidden ||
      !transport.canSend() ||
      timer !== null ||
      frameRequest !== null
    )
      return;
    const delay = interval - (performance.now() - lastCaptured);
    if (delay > 0) {
      timer = setTimeout(() => {
        timer = null;
        schedule();
      }, delay);
      return;
    }
    if (video.readyState >= 2 && video.videoWidth && frameVersion() !== lastFrameVersion) {
      capture();
      return;
    }
    frameRequest = useVideoCallback
      ? video.requestVideoFrameCallback(capture)
      : requestAnimationFrame(capture);
  };

  const capture = (_now?: number, metadata?: VideoFrameCallbackMetadata) => {
    frameRequest = null;
    if (stopped || document.hidden || !transport.canSend()) return;
    // A video-frame callback itself confirms a new presented frame. Playback
    // quality counters can freeze for MediaStream sources in native webviews.
    if (
      video.readyState < 2 ||
      !video.videoWidth ||
      (!metadata && frameVersion() === lastFrameVersion)
    ) {
      schedule();
      return;
    }
    const now = performance.now();
    // The callback can arrive after settings or the connection changed.
    const generation = transport.generation;
    const revision = transport.configurationRevision;
    const capturedAt = Date.now();
    const { width, height } = fitFrame(video.videoWidth, video.videoHeight, maxWidth, maxHeight);
    // Assigning width/height clears and reallocates the backing store.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    encoding = true;
    lastCaptured = now;
    lastFrameVersion = frameVersion();
    try {
      context.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (jpeg) => {
          encoding = false;
          if (stopped) return;
          if (!jpeg) {
            onError('JPEG encoding failed. Restart the camera.');
            return;
          }
          try {
            if (!document.hidden) transport.sendFrame(jpeg, capturedAt, now, generation, revision);
            // Pace from the completed send. Variable JPEG encode time must
            // not compress consecutive transmissions below the intake limit.
            lastCaptured = performance.now();
            schedule();
          } catch (error) {
            onError(`Frame transmission failed: ${(error as Error).message}`);
          }
        },
        'image/jpeg',
        settings.jpegQuality,
      );
    } catch (error) {
      encoding = false;
      onError(`Frame capture failed: ${(error as Error).message}`);
    }
  };

  const cancelScheduled = () => {
    if (timer !== null) clearTimeout(timer);
    if (frameRequest !== null) {
      if (useVideoCallback) video.cancelVideoFrameCallback(frameRequest);
      else cancelAnimationFrame(frameRequest);
    }
    timer = null;
    frameRequest = null;
  };
  const visibilityChanged = () => {
    if (document.hidden) cancelScheduled();
    else schedule();
  };
  const unsubscribe = transport.subscribeAvailability(schedule);
  document.addEventListener('visibilitychange', visibilityChanged);
  return () => {
    stopped = true;
    unsubscribe();
    cancelScheduled();
    document.removeEventListener('visibilitychange', visibilityChanged);
  };
}
