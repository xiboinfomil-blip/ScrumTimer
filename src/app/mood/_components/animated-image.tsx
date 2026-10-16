'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

interface AnimatedImageProps {
  src: string;
  alt: string;
  paused: boolean;
  animated?: boolean;
  id?: string;
  className?: string;
  style?: CSSProperties;
  onLoad?: (image: HTMLImageElement) => void;
  onError?: () => void;
  onSnapshotError?: () => void;
  fetchPriority?: 'high' | 'low' | 'auto';
}

// Canvas is a sibling: background utilities and inline crop geometry must
// apply identically to the live image and its frozen frame.
export function AnimatedImage({
  src, alt, paused, animated = true, id, className, style,
  onLoad, onError, onSnapshotError, fetchPriority = 'auto',
}: AnimatedImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onLoad, onError, onSnapshotError });

  useEffect(() => {
    callbacks.current = { onLoad, onError, onSnapshotError };
  }, [onLoad, onError, onSnapshotError]);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image) return;
    let active = true;
    let reported = false;
    const applyMotion = () => {
      if (!active) return;
      image.hidden = animated && paused;
      if (!canvas) return;
      canvas.hidden = true;
      if (!animated || !paused || !image.complete || !image.naturalWidth) return;
      try {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas indisponible');
        context.drawImage(image, 0, 0);
        canvas.hidden = false;
      } catch {
        // Do not silently resume animation when reduced motion is requested.
        callbacks.current.onSnapshotError?.();
      }
    };
    const loaded = () => {
      if (!active) return;
      applyMotion();
      if (!reported) { reported = true; callbacks.current.onLoad?.(image); }
    };
    const failed = () => {
      if (!active || reported) return;
      reported = true;
      callbacks.current.onError?.();
    };
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    applyMotion();
    // Cached images may finish before effects attach their listeners. Defer
    // notification so cleanup can cancel it, including Strict Mode replay.
    if (image.complete) {
      queueMicrotask(() => { if (active) { if (image.naturalWidth) loaded(); else failed(); } });
    }
    return () => {
      active = false;
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    };
  }, [src, paused, animated]);

  return (
    <>
      {/* Native images are needed for GIF frames and canvas snapshots. */}
      <img key={`image:${src}`} ref={imageRef} id={id} src={src} alt={alt} decoding="async" fetchPriority={fetchPriority} className={className} style={style}
        hidden={animated && paused} />
      {animated && <canvas key={`canvas:${src}`} ref={canvasRef} hidden aria-hidden={alt ? undefined : true}
        role={alt ? 'img' : 'presentation'} aria-label={alt || undefined}
        className={`${className ?? ''}${id === 'meter-slide' ? ' absolute inset-0' : ''}`} style={style} />}
    </>
  );
}