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

  const prompt = `You are an expert at analyzing legal transcripts to identify and name speakers.

Below is a transcript with preliminary speaker labels (e.g. "Speaker 1", "Speaker 2"). You have two tasks:

**Task 1: Correct speaker labels**
Review the conversational flow and correct any speaker misattributions. ${speakerHint}
- Preserve the original speaker label if it seems correct
- Look for conversational cues: questions followed by answers likely indicate speaker changes
- Legal proceedings often have a questioner (attorney) and respondent (witness)
- Do NOT merge speakers that are clearly different people
- Do NOT split a single speaker into multiple speakers unless there's strong evidence

**Task 2: Identify speaker names**
Analyze the transcript content to identify real names or roles for each speaker. Look for:
- Self-introductions ("My name is...", "I'm...", "This is...")
- Direct address ("Mr. Smith", "Ms. Johnson", "Your Honor")
- Role references ("the court reporter", "counsel for the plaintiff", "the witness")
- Formal introductions by others ("We have with us today...")
- Sworn-in statements ("Do you, [name], swear to...")

Name assignment rules:
- Only assign a name when you are at least 75% confident in the identification
- If you cannot confidently identify a speaker, keep their generic label (e.g. "Speaker 1")
- Use the most formal/complete version of the name when possible (e.g. "Barry Porter" not just "Barry")
- For roles without names, use the role (e.g. "Court Reporter", "The Videographer")
- It is perfectly fine to leave some or all speakers unnamed — only name those you are confident about

Return a JSON object with:
- "labels": an array of speaker labels (one per segment, in order) using either identified names or generic "Speaker N" labels
- "identifications": an object mapping generic labels to identified names, only for speakers you identified with 75%+ confidence. Example: {"Speaker 1": "Barry Porter", "Speaker 3": "Court Reporter"}

Example response:
{
  "labels": ["Attorney Smith", "Barry Porter", "Attorney Smith", "Barry Porter", "Speaker 3"],
  "identifications": {"Speaker 1": "Attorney Smith", "Speaker 2": "Barry Porter"}
}

Transcript segments:
${JSON.stringify(segmentData)}`;

  try {
    console.log(`[Speaker Refinement] Sending ${segments.length} segments to GPT-5.4 for refinement and name identification...`);

    const response = await aiClient.chat.completions.create({
      model: 'gpt-5.4',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('[Speaker Refinement] Empty response from GPT-5.4, keeping original labels');
      return segments;
    }

    const parsed = JSON.parse(content);
    let labels: string[];

    if (parsed.labels && Array.isArray(parsed.labels)) {
      labels = parsed.labels;
    } else if (Array.isArray(parsed)) {
      labels = parsed;
    } else if (parsed.speakers && Array.isArray(parsed.speakers)) {
      labels = parsed.speakers;
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

    if (parsed.identifications && typeof parsed.identifications === 'object') {
      const ids = parsed.identifications;
      const idEntries = Object.entries(ids);
      if (idEntries.length > 0) {
        console.log(`[Speaker Refinement] Identified speakers: ${idEntries.map(([from, to]) => `${from} → ${to}`).join(', ')}`);
      } else {
        console.log('[Speaker Refinement] No speakers could be confidently identified by name');
      }
    }

    const refined = segments.map((seg, i) => {
      const label = labels[i];
      if (typeof label === 'string' && label.trim().length > 0) {
        return { ...seg, speaker: label.trim() };
      }
      return seg;
    });

    const uniqueSpeakers = new Set(refined.map(s => s.speaker));
    console.log(`[Speaker Refinement] Refined to ${uniqueSpeakers.size} speaker(s): ${[...uniqueSpeakers].join(', ')}`);

    return refined;
  } catch (err: any) {
    console.error('[Speaker Refinement] GPT-5.4 refinement failed:', err.message);
    return segments;
  }
}
