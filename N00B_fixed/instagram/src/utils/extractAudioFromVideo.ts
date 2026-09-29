// Pulls just the audio out of a video file, entirely in the browser — no server round trip, no
// ffmpeg dependency. decodeAudioData() demuxes the container and decodes the audio track regardless
// of the video track, so this works for the same video files any browser can already play.
// The result is re-encoded as MP3 (lamejs, pure JS — no WASM, works on every browser this app
// supports) rather than left as raw PCM: a 20-minute song as uncompressed WAV is ~200MB, the same
// song as 128kbps MP3 is ~19MB, and this project has been bitten by bloated media before.
// Loaded lazily — most visits never touch music upload, and the encoder is sizeable.
import type { Mp3Encoder as Mp3EncoderType } from 'lamejs';

export const MAX_MUSIC_UPLOAD_SECONDS = 20 * 60;

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

async function encodeMp3(buffer: AudioBuffer): Promise<Blob> {
  const { Mp3Encoder }: { Mp3Encoder: typeof Mp3EncoderType } = await import('lamejs');
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const left = floatTo16BitPCM(buffer.getChannelData(0));
  const right = numChannels > 1 ? floatTo16BitPCM(buffer.getChannelData(1)) : left;

  const encoder = new Mp3Encoder(numChannels, buffer.sampleRate, 128);
  const chunks: Int8Array[] = [];
  const blockSize = 1152;
  for (let i = 0; i < left.length; i += blockSize) {
    const chunk = encoder.encodeBuffer(left.subarray(i, i + blockSize), right.subarray(i, i + blockSize));
    if (chunk.length) chunks.push(chunk);
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(tail);
  return new Blob(chunks as BlobPart[], { type: 'audio/mp3' });
}

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name);
}

export async function extractAudioFromVideoFile(file: File): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    if (audioBuffer.duration > MAX_MUSIC_UPLOAD_SECONDS) {
      throw new Error(`That video is longer than 20 minutes (${Math.round(audioBuffer.duration / 60)} min) — please upload something shorter.`);
    }
    const mp3Blob = await encodeMp3(audioBuffer);
    const name = file.name.replace(/\.[^.]+$/, '') + '.mp3';
    return new File([mp3Blob], name, { type: 'audio/mp3' });
  } finally {
    void ctx.close();
  }
}
