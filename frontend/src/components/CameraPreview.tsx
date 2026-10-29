import type { RefObject } from 'react';
import type { DetectionResult } from '../types/detection';
import { DetectionOverlay } from './DetectionOverlay';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  starting: boolean;
  mirrored: boolean;
  result: DetectionResult | null;
  stale: boolean;
  connected: boolean;
  width: number;
  height: number;
}

export function CameraPreview(props: Props) {
  return (
    <section className="preview-panel" aria-label="Camera output">
      <div className="panel-heading">
        <h2>Camera output</h2>
        <span>{props.active ? `${props.width} × ${props.height}` : 'Stopped'}</span>
      </div>
      <div className="video-stage">
        <video
          ref={props.videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Local webcam video"
          className={`${props.mirrored ? 'mirrored' : ''} ${!props.active ? 'video-inactive' : ''}`}
        />
        <DetectionOverlay
          result={props.result}
          mirrored={props.mirrored}
          visible={props.active && props.connected && !props.stale}
        />
        {!props.active && (
          <div className="camera-empty">
            {props.starting ? 'Opening camera…' : 'Camera stopped'}
          </div>
        )}
        {props.active && (props.stale || !props.connected || !props.result) && (
          <div className="stage-notice">
            {props.stale
              ? 'Waiting for a fresh reading…'
              : !props.connected
                ? 'Inference disconnected'
                : 'Awaiting inference'}
          </div>
        )}
      </div>
    </section>
  );
}
