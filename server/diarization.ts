import { AssemblyAI } from 'assemblyai';
import { createReadStream } from 'fs';

interface DiarizationLabel {
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface EnrichedUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
    speaker: string;
  }>;
}

export interface SentimentResult {
  text: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  confidence: number;
  speaker: string;
  start: number;
  end: number;
}

export interface EntityResult {
  text: string;
  entity_type: string;
  start: number;
  end: number;
}

export interface EnrichedDiarizationResult {
  labels: DiarizationLabel[];
  utterances: EnrichedUtterance[];
  sentiment_analysis_results: SentimentResult[];
  entities: EntityResult[];
}

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
});

export async function diarizeWithAssemblyAI(
  audioFilePath: string,
  expectedSpeakers?: number | null
): Promise<EnrichedDiarizationResult> {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error('ASSEMBLYAI_API_KEY is not configured');
  }

  console.log(`[Diarization] Uploading audio to AssemblyAI...`);
  const audioStream = createReadStream(audioFilePath);
  const uploadUrl = await client.files.upload(audioStream);
  console.log(`[Diarization] Upload complete, starting transcription with speaker labels + enrichment...`);

  const config: any = {
    audio_url: uploadUrl,
    speaker_labels: true,
    sentiment_analysis: true,
    entity_detection: true,
    language_code: 'en_us',
    punctuate: true,
    format_text: true,
  };

  if (expectedSpeakers && expectedSpeakers >= 2) {
    config.speakers_expected = expectedSpeakers;
  }

  const transcript = await client.transcripts.transcribe(config);

  if (transcript.status === 'error') {
    throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
  }

  const utterances = transcript.utterances || [];
  const sentimentResults = (transcript as any).sentiment_analysis_results || [];
  const entities = (transcript as any).entities || [];

  console.log(`[Diarization] Got ${utterances.length} utterances, ${sentimentResults.length} sentiment results, ${entities.length} entities from AssemblyAI`);

  const labels: DiarizationLabel[] = utterances.map((u: any) => ({
    speaker: u.speaker,
    startTime: u.start / 1000,
    endTime: u.end / 1000,
    text: u.text || '',
  }));

  const enrichedUtterances: EnrichedUtterance[] = utterances.map((u: any) => ({
    speaker: u.speaker,
    text: u.text || '',
    start: u.start,
    end: u.end,
    confidence: u.confidence || 0,
    words: (u.words || []).map((w: any) => ({
      text: w.text || '',
      start: w.start,
      end: w.end,
      confidence: w.confidence || 0,
      speaker: w.speaker || u.speaker,
    })),
  }));

  return {
    labels,
    utterances: enrichedUtterances,
    sentiment_analysis_results: sentimentResults.map((s: any) => ({
      text: s.text || '',
      sentiment: s.sentiment || 'NEUTRAL',
      confidence: s.confidence || 0,
      speaker: s.speaker || '',
      start: s.start || 0,
      end: s.end || 0,
    })),
    entities: entities.map((e: any) => ({
      text: e.text || '',
      entity_type: e.entity_type || '',
      start: e.start || 0,
      end: e.end || 0,
    })),
  };
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
