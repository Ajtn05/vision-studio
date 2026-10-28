import { useCallback, useEffect, useRef, useState } from 'react';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestId = useRef(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const refreshDevices = useCallback(async () => {
    try {
      if (navigator.mediaDevices)
        setDevices(
          (await navigator.mediaDevices.enumerateDevices()).filter(
            (device) => device.kind === 'videoinput',
          ),
        );
    } catch (error) {
      setError(`Cannot list cameras: ${(error as Error).message}`);
    }
  }, []);

  const stop = useCallback(() => {
    requestId.current++;
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setStarting(false);
    setDimensions({ width: 0, height: 0 });
  }, []);

  const start = useCallback(
    async (selectedDevice = deviceId) => {
      stop();
      const currentRequest = requestId.current;
      setStarting(true);
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            'Camera capture requires the desktop app or a secure browser context (localhost / HTTPS).',
          );
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
            ...(selectedDevice ? { deviceId: { exact: selectedDevice } } : { facingMode: 'user' }),
          },
        });
        if (currentRequest !== requestId.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        track.onended = () => {
          stop();
          setError('The camera disconnected or access ended. Select a camera and start it again.');
        };
        const video = videoRef.current;
        if (!video) throw new Error('The camera preview is unavailable.');
        video.srcObject = stream;
        await video.play();
        if (currentRequest !== requestId.current) return;
        setDimensions({ width: video.videoWidth, height: video.videoHeight });
        setActive(true);
        setDeviceId(track.getSettings().deviceId ?? selectedDevice);
        await refreshDevices();
      } catch (error) {
        if (currentRequest !== requestId.current) return;
        stop();
        const name = (error as DOMException).name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was denied. Allow Vision Studio in System Settings → Privacy & Security → Camera, then try again.'
            : name === 'NotReadableError'
              ? 'The camera is in use or unavailable. Close other camera apps and try again.'
              : name === 'NotFoundError' || name === 'OverconstrainedError'
                ? 'This camera is unavailable. Select another camera.'
                : (error as Error).message,
        );
      } finally {
        if (currentRequest === requestId.current) setStarting(false);
      }
    },
    [deviceId, refreshDevices, stop],
  );

  const selectDevice = (selectedDevice: string) => {
    setDeviceId(selectedDevice);
    if (active || starting) void start(selectedDevice);
  };

  useEffect(() => {
    void refreshDevices();
    const media = navigator.mediaDevices;
    media?.addEventListener('devicechange', refreshDevices);
    return () => {
      media?.removeEventListener('devicechange', refreshDevices);
      stop();
    };
  }, [refreshDevices, stop]);

  return {
    videoRef,
    devices,
    deviceId,
    active,
    starting,
    error,
    dimensions,
    start,
    stop,
    selectDevice,
  };
}
