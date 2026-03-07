import { AssemblyAI } from 'assemblyai';
import { readFile } from 'fs/promises';

interface DiarizationLabel {
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
}

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
});

export async function diarizeWithAssemblyAI(
  audioFilePath: string,
  expectedSpeakers?: number | null
): Promise<DiarizationLabel[]> {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error('ASSEMBLYAI_API_KEY is not configured');
  }

  console.log(`[Diarization] Uploading audio to AssemblyAI...`);
  const audioData = await readFile(audioFilePath);
  const uploadUrl = await client.files.upload(audioData);
  console.log(`[Diarization] Upload complete, starting transcription with speaker labels...`);

  const config: any = {
    audio_url: uploadUrl,
    speaker_labels: true,
    speech_model: 'universal-3-pro',
  };

  if (expectedSpeakers && expectedSpeakers >= 2) {
    config.speakers_expected = expectedSpeakers;
  }

  const transcript = await client.transcripts.transcribe(config);

  if (transcript.status === 'error') {
    throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
  }

  const utterances = transcript.utterances || [];

  console.log(`[Diarization] Got ${utterances.length} utterances from AssemblyAI`);

  const labels: DiarizationLabel[] = utterances.map((u: any) => ({
    speaker: u.speaker,
    startTime: u.start / 1000,
    endTime: u.end / 1000,
    text: u.text || '',
  }));

  return labels;
}

export function mapDiarizationToSegments(
  whisperSegments: { speaker: string; text: string; startTime: number; endTime: number }[],
  diarizationLabels: DiarizationLabel[]
): { speaker: string; text: string; startTime: number; endTime: number }[] {
  if (diarizationLabels.length === 0) return whisperSegments;

  const speakerMap = new Map<string, number>();
  let speakerCounter = 0;

  return whisperSegments.map((seg) => {
    const segMid = (seg.startTime + seg.endTime) / 2;

    let bestMatch: DiarizationLabel | null = null;
    let bestOverlap = 0;

    for (const label of diarizationLabels) {
      const overlapStart = Math.max(seg.startTime, label.startTime);
      const overlapEnd = Math.min(seg.endTime, label.endTime);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = label;
      }
    }

    if (!bestMatch) {
      for (const label of diarizationLabels) {
        const labelMid = (label.startTime + label.endTime) / 2;
        const dist = Math.abs(segMid - labelMid);
        if (!bestMatch || dist < Math.abs(segMid - (bestMatch.startTime + bestMatch.endTime) / 2)) {
          bestMatch = label;
        }
      }
    }

    if (bestMatch) {
      if (!speakerMap.has(bestMatch.speaker)) {
        speakerCounter++;
        speakerMap.set(bestMatch.speaker, speakerCounter);
      }
      const speakerNum = speakerMap.get(bestMatch.speaker)!;
      return { ...seg, speaker: `Speaker ${speakerNum}` };
    }

    return seg;
  });
}
