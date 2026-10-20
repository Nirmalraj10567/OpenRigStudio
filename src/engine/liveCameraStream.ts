export interface LiveCameraStream {
  stream: MediaStream;
  stop: () => void;
}

let active: LiveCameraStream | null = null;

/**
 * Exposes the rendered stage as a standards-based MediaStream for WebRTC,
 * OBS/browser recording, or a MediaRecorder pipeline. The caller owns the
 * signaling/transport layer; no network connection is created here.
 */
export function startLiveCameraStream(canvas: HTMLCanvasElement, fps = 30): LiveCameraStream {
  if (!canvas || typeof canvas.captureStream !== 'function') throw new Error('This browser cannot capture the camera canvas as a MediaStream');
  active?.stop();
  const stream = canvas.captureStream(Math.max(1, Math.min(120, fps)));
  const session: LiveCameraStream = { stream, stop: () => { stream.getTracks().forEach(track => track.stop()); if (active === session) active = null; } };
  active = session; return session;
}

export function currentLiveCameraStream(): MediaStream | null { return active?.stream ?? null; }
export function stopLiveCameraStream(): void { active?.stop(); }

export async function recordLiveCameraStream(stream: MediaStream, durationMs = 0, mimeType = 'video/webm;codecs=vp9') : Promise<Blob> {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(mimeType)) throw new Error('MediaRecorder WebM output is unavailable in this browser');
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  return new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Live camera recording failed'));
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.start(250);
    if (durationMs > 0) window.setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, durationMs);
  });
}
