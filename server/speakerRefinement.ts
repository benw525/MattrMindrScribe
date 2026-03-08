import OpenAI from 'openai';

interface Segment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

const aiClient = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function refineSpeakersWithGPT(
  segments: Segment[],
  expectedSpeakers?: number | null
): Promise<Segment[]> {
  if (segments.length === 0) return segments;
  if (segments.length > 500) {
    console.log(`[Speaker Refinement] Skipping GPT refinement — ${segments.length} segments exceeds limit`);
    return segments;
  }

  const segmentData = segments.map((s, i) => ({
    i,
    s: s.speaker,
    t: s.text,
  }));

  const speakerHint = expectedSpeakers
    ? `The recording is expected to have ${expectedSpeakers} speakers.`
    : 'Determine the correct number of speakers from context.';

  const prompt = `You are an expert at analyzing legal transcripts to identify speakers.

Below is a transcript with preliminary speaker labels. Review the conversational flow and correct any speaker misattributions. ${speakerHint}

Rules:
- Use labels like "Speaker 1", "Speaker 2", etc.
- Preserve the original speaker label if it seems correct
- Look for conversational cues: questions followed by answers likely indicate speaker changes
- Legal proceedings often have a questioner (attorney) and respondent (witness)
- If someone refers to themselves or their role, use that to maintain consistent labeling
- Do NOT merge speakers that are clearly different people
- Do NOT split a single speaker into multiple speakers unless there's strong evidence

Return a JSON array of corrected speaker labels, one per segment, in order. Example: ["Speaker 1", "Speaker 2", "Speaker 1", ...]

Transcript segments:
${JSON.stringify(segmentData)}`;

  try {
    console.log(`[Speaker Refinement] Sending ${segments.length} segments to GPT-4o for refinement...`);

    const response = await aiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('[Speaker Refinement] Empty response from GPT-4o, keeping original labels');
      return segments;
    }

    const parsed = JSON.parse(content);
    let labels: string[];

    if (Array.isArray(parsed)) {
      labels = parsed;
    } else if (parsed.speakers && Array.isArray(parsed.speakers)) {
      labels = parsed.speakers;
    } else if (parsed.labels && Array.isArray(parsed.labels)) {
      labels = parsed.labels;
    } else {
      const firstArrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (firstArrayKey) {
        labels = parsed[firstArrayKey];
      } else {
        console.log('[Speaker Refinement] Unexpected response format, keeping original labels');
        return segments;
      }
    }

    if (labels.length !== segments.length) {
      console.log(`[Speaker Refinement] Label count mismatch (${labels.length} vs ${segments.length}), keeping original labels`);
      return segments;
    }

    const refined = segments.map((seg, i) => {
      const label = labels[i];
      if (typeof label === 'string' && label.startsWith('Speaker')) {
        return { ...seg, speaker: label };
      }
      return seg;
    });

    const uniqueSpeakers = new Set(refined.map(s => s.speaker));
    console.log(`[Speaker Refinement] Refined to ${uniqueSpeakers.size} speaker(s): ${[...uniqueSpeakers].join(', ')}`);

    return refined;
  } catch (err: any) {
    console.error('[Speaker Refinement] GPT-4o refinement failed:', err.message);
    return segments;
  }
}
