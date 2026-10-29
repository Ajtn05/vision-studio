import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startFrameCapture } from '../services/frameCapture';
import type { CaptureTransport } from '../services/frameCapture';

describe('camera sampling', () => {
  let now: number;
  let available: boolean;
  let wake: () => void;
  let stop: () => void;
  let encode: BlobCallback;
  let nextId: number;
  let callbacks: Map<number, (now?: number, metadata?: VideoFrameCallbackMetadata) => void>;
  let documentStub: EventTarget & { hidden: boolean; createElement: ReturnType<typeof vi.fn> };
  let video: HTMLVideoElement;
  let canvas: {
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toBlob: ReturnType<typeof vi.fn>;
  };
  let transport: CaptureTransport;
  let error: ReturnType<typeof vi.fn>;
  const settings = { resolution: '640x360' as const, targetFps: 10, jpegQuality: 0.8 };
  const nextFrame = (time: number, presented = false) => {
    Object.assign(video, { currentTime: time, readyState: 2 });
    const [id, callback] = callbacks.entries().next().value!;
    callbacks.delete(id);
    callback(now, presented ? ({ mediaTime: time } as VideoFrameCallbackMetadata) : undefined);
  };
  const completeEncode = () => encode(new Blob(['jpeg']));

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    available = false;
    wake = () => {};
    stop = () => {};
    nextId = 1;
    callbacks = new Map();
    canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: BlobCallback) => {
        encode = callback;
      }),
    };
    documentStub = Object.assign(new EventTarget(), {
      hidden: false,
      createElement: vi.fn(() => canvas),
    });
    vi.stubGlobal('document', documentStub);
    const request = vi.fn(
      (callback: (now?: number, metadata?: VideoFrameCallbackMetadata) => void) => {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      },
    );
    const cancel = vi.fn((id: number) => {
      callbacks.delete(id);
    });
    video = {
      readyState: 1,
      videoWidth: 1280,
      videoHeight: 720,
      currentTime: 0,
      requestVideoFrameCallback: request,
      cancelVideoFrameCallback: cancel,
    } as unknown as HTMLVideoElement;
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    transport = {
      generation: 1,
      configurationRevision: 1,
      canSend: () => available,
      subscribeAvailability: (callback) => {
        wake = callback;
        if (available) wake();
        return () => {
          wake = () => {};
        };
      },
      sendFrame: vi.fn(() => {
        available = false;
        return true;
      }),
    };
    error = vi.fn();
  });
  afterEach(() => {
    stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does no polling or JPEG work while the server is busy, and reuses the canvas', () => {
    let width = 0;
    const resize = vi.fn((value: number) => {
      width = value;
    });
    Object.defineProperty(canvas, 'width', { configurable: true, get: () => width, set: resize });
    stop = startFrameCapture(video, transport, settings, error);
    vi.advanceTimersByTime(1000);
    expect(callbacks.size).toBe(0);
    expect(canvas.toBlob).not.toHaveBeenCalled();
    available = true;
    wake();
    nextFrame(1);
    completeEncode();
    expect(transport.sendFrame).toHaveBeenCalledTimes(1);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(callbacks.size).toBe(0);
    resize.mockClear();
    now = 200;
    available = true;
    wake();
    nextFrame(2);
    completeEncode();
    expect(resize).not.toHaveBeenCalled();
    expect(transport.sendFrame).toHaveBeenCalledTimes(2);
  });
  it('enforces the target FPS even when inference responds immediately', () => {
    available = true;
    stop = startFrameCapture(video, transport, settings, error);
    nextFrame(1);
    completeEncode();
    now = 20;
    available = true;
    wake();
    expect(callbacks.size).toBe(0);
    vi.advanceTimersByTime(84);
    expect(callbacks.size).toBe(0);
    now = 105;
    vi.advanceTimersByTime(1);
    expect(callbacks.size).toBe(1);
  });
  it('caps sampling to the server intake limit', () => {
    available = true;
    stop = startFrameCapture(video, transport, { ...settings, maxFps: 5 }, error);
    nextFrame(1);
    completeEncode();
    now = 20;
    available = true;
    wake();
    vi.advanceTimersByTime(184);
    expect(callbacks.size).toBe(0);
    now = 205;
    vi.advanceTimersByTime(1);
    expect(callbacks.size).toBe(1);
  });
  it('paces sends after variable JPEG encoding time to avoid intake drops', () => {
    available = true;
    stop = startFrameCapture(video, transport, settings, error);
    nextFrame(1);
    now = 80;
    completeEncode();
    now = 100;
    available = true;
    wake();
    now = 184;
    vi.advanceTimersByTime(84);
    expect(callbacks.size).toBe(0);
    now = 185;
    vi.advanceTimersByTime(1);
    expect(callbacks.size).toBe(1);
  });
  it('captures an already available fresh frame immediately without a polling delay', () => {
    available = true;
    Object.assign(video, { readyState: 2 });
    stop = startFrameCapture(video, transport, settings, error);
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0);
  });
  it('does not confuse an advancing media clock with a newly decoded frame', () => {
    let decodedFrames = 1;
    Object.assign(video, { getVideoPlaybackQuality: () => ({ totalVideoFrames: decodedFrames }) });
    available = true;
    stop = startFrameCapture(video, transport, settings, error);
    nextFrame(1);
    completeEncode();
    now = 200;
    available = true;
    wake();
    nextFrame(2);
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
    decodedFrames++;
    nextFrame(3);
    expect(canvas.toBlob).toHaveBeenCalledTimes(2);
  });
  it.each([0, 1])('keeps taking live readings with a frozen playback counter of %i', (counter) => {
    Object.assign(video, { getVideoPlaybackQuality: () => ({ totalVideoFrames: counter }) });
    available = true;
    stop = startFrameCapture(video, transport, settings, error);
    for (let frame = 1; frame <= 30; frame++) {
      nextFrame(frame, true);
      completeEncode();
      now += 110;
      available = true;
      wake();
    }
    expect(transport.sendFrame).toHaveBeenCalledTimes(30);
    expect(error).not.toHaveBeenCalled();
  });
  it('uses the media clock when playback statistics stay at zero without video callbacks', () => {
    Object.assign(video, {
      requestVideoFrameCallback: undefined,
      getVideoPlaybackQuality: () => ({ totalVideoFrames: 0 }),
    });
    available = true;
    stop = startFrameCapture(video, transport, settings, error);
    nextFrame(1);
    completeEncode();
    now = 200;
    available = true;
    wake();
    nextFrame(1);
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
    nextFrame(2);
    completeEncode();
    expect(transport.sendFrame).toHaveBeenCalledTimes(2);
  });
  it('cancels a pending frame callback and ignores late encodes after stop', () => {
    available = true;
    stop = startFrameCapture(video, transport, settings, error);
    nextFrame(1);
    stop();
    completeEncode();
    expect(transport.sendFrame).not.toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
    wake();
    expect(callbacks.size).toBe(0);
  });
  it('suspends when hidden, resumes on visibility, and does not transmit a hidden encode', () => {
    available = true;
    stop = startFrameCapture(video, transport, settings, error);
    documentStub.hidden = true;
    documentStub.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.size).toBe(0);
    documentStub.hidden = false;
    documentStub.dispatchEvent(new Event('visibilitychange'));
    nextFrame(1);
    documentStub.hidden = true;
    completeEncode();
    expect(transport.sendFrame).not.toHaveBeenCalled();
  });
  it('falls back to animation callbacks without re-encoding the same decoded frame', () => {
    Object.assign(video, { requestVideoFrameCallback: undefined });
    available = true;
    stop = startFrameCapture(video, transport, settings, error);
    nextFrame(1);
    completeEncode();
    now = 200;
    available = true;
    wake();
    nextFrame(1);
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(1);
    nextFrame(2);
    expect(canvas.toBlob).toHaveBeenCalledTimes(2);
  });
});
