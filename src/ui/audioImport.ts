import type { ProjectAudio } from '../engine/model';
import { createId } from '../engine/Rig';

const MAX_BYTES = 12 * 1024 * 1024;
export async function readLocalAudio(file: File): Promise<ProjectAudio> {
  if (file.size > MAX_BYTES) throw new Error('Audio must be 12 MB or smaller. Trim or compress it locally first.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mime = extension === 'wav' ? 'audio/wav' : extension === 'mp3' ? 'audio/mpeg' : extension === 'ogg' ? 'audio/ogg' : '';
  if (!mime) throw new Error('Choose a WAV, MP3 or OGG audio file.');
  if (file.type && !/^(audio\/(wav|wave|x-wav|mpeg|mp3|ogg|x-ogg)|application\/(ogg|octet-stream))$/i.test(file.type)) {
    throw new Error('The file type is not WAV, MP3 or OGG audio.');
  }
  if (!new Audio().canPlayType(mime)) throw new Error(`${extension?.toUpperCase()} playback is not supported by this browser. Try WAV or MP3.`);
  if (typeof AudioContext === 'undefined') throw new Error('Audio decoding is unavailable in this browser.');
  const context = new AudioContext();
  try {
    const bytes = await file.arrayBuffer();
    let decoded: AudioBuffer;
    try { decoded = await context.decodeAudioData(bytes); }
    catch { throw new Error('Could not decode audio. The file may be damaged or use an unsupported codec. Try PCM WAV or MP3.'); }
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error('This audio file is empty.');
    if (decoded.duration > 300) throw new Error('Audio must be five minutes or shorter. Trim it locally before importing.');
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    const windowSize = Math.max(1, Math.round(decoded.sampleRate / 50));
    const peaks: number[] = [];
    for (let start = 0; start < decoded.length; start += windowSize) {
      const end = Math.min(decoded.length, start + windowSize);
      let energy = 0;
      for (let i = start; i < end; i++) {
        let mono = 0;
        for (const channel of channels) mono += channel[i] / channels.length;
        energy += mono * mono;
      }
      peaks.push(Math.min(1, Math.sqrt(energy / (end - start))));
    }
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the local audio file.'));
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mime};`));
      reader.readAsDataURL(file);
    });
    return { id: createId('audio'), name: file.name, src, duration: decoded.duration, offsetSeconds: 0, volume: 1, muted: false, peaks };
  } finally {
    await context.close().catch(() => undefined);
  }
}
