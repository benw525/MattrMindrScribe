import Anthropic from '@anthropic-ai/sdk';

interface Segment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function refineSpeakersWithGPT(
  segments: Segment[],
  expectedSpeakers?: number | null
): Promise<Segment[]> {
  if (segments.length === 0) return segments;
  if (segments.length > 500) {
    console.log(`[Speaker Refinement] Skipping refinement — ${segments.length} segments exceeds limit`);
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

  const systemPrompt = `You are an expert legal transcript analyst specializing in deposition and court proceeding speaker identification. You have deep knowledge of how legal proceedings are structured and who the typical participants are.

Your response must be valid JSON with two fields:
- "labels": an array of speaker labels (one per segment, in order)
- "identifications": an object mapping generic labels to identified names/roles (only for 75%+ confidence identifications)`;

  const userPrompt = `Below is a transcript with preliminary speaker labels. You have two tasks:

**Task 1: Correct speaker labels**
Review the conversational flow and correct any speaker misattributions. ${speakerHint}
- Preserve the original speaker label if it seems correct
- Look for conversational cues: questions followed by answers likely indicate speaker changes
- Do NOT merge speakers that are clearly different people
- Do NOT split a single speaker into multiple speakers unless there's strong evidence

**Task 2: Identify speaker names and roles**
Analyze the transcript to identify real names or roles for each speaker. Use these patterns specific to legal depositions:

**Videographer patterns:**
- Opens the deposition with phrases like "This begins the video deposition of [deponent name]..." or "We are now on the record..."
- Closes the deposition with "This concludes the video deposition of [deponent name]..." or "We are now off the record..."
- May announce the time and date at the start
- Label this speaker as "Videographer" (or by name if identifiable)

**Court Reporter patterns:**
- Administers the oath: "Do you solemnly swear..." or "Do you, [name], swear to tell the truth..."
- Asks about "usual stipulations" or "standard stipulations"
- May swear in the witness
- Label this speaker as "Court Reporter" (or by name if identifiable)

**Examining Attorney patterns:**
- Asks most of the questions during the deposition
- May introduce themselves at the start ("My name is..." or "[Name] on behalf of...")
- Directs the witness ("Could you state your name for the record?")
- Label by name if identifiable (e.g. "Attorney Smith"), otherwise "Examining Attorney"

**Deponent/Witness patterns:**
- The person being questioned — typically provides answers
- Often named in the videographer's opening statement ("video deposition of [name]")
- Named during the oath ("Do you, [name], swear to...")
- Label by name if identifiable (e.g. "Barry Porter"), otherwise "The Witness"

**Defending Attorney patterns:**
- Makes objections ("Objection", "Objection, form", "Objection, leading")
- May instruct the witness not to answer
- May introduce themselves ("defending attorney" or "on behalf of the defendant")
- Label by name if identifiable, otherwise "Defending Attorney"

**Other participants:**
- Look for self-introductions ("My name is...", "I'm...", "This is...")
- Direct address ("Mr. Smith", "Ms. Johnson", "Your Honor")
- Role references ("counsel for the plaintiff", "the witness")

**Name assignment rules:**
- Only assign a name when you are at least 75% confident in the identification
- If you cannot confidently identify a speaker, keep their generic label (e.g. "Speaker 1")
- Use the most formal/complete version of the name when possible (e.g. "Barry Porter" not just "Barry")
- For roles without names, use the role (e.g. "Court Reporter", "Videographer")
- It is perfectly fine to leave some or all speakers unnamed — only name those you are confident about

**Example response:**
{
  "labels": ["Videographer", "Court Reporter", "Attorney Smith", "Barry Porter", "Attorney Smith", "Barry Porter"],
  "identifications": {"Speaker 1": "Videographer", "Speaker 2": "Court Reporter", "Speaker 3": "Attorney Smith", "Speaker 4": "Barry Porter"}
}

Transcript segments:
${JSON.stringify(segmentData)}`;

  try {
    console.log(`[Speaker Refinement] Sending ${segments.length} segments to Claude Opus 4.6 for refinement and name identification...`);

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 8192,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const content = textBlock?.text;
    if (!content) {
      console.log('[Speaker Refinement] Empty response from Claude Opus 4.6, keeping original labels');
      return segments;
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Speaker Refinement] Could not extract JSON from response, keeping original labels');
      return segments;
    }

    const parsed = JSON.parse(jsonMatch[0]);
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
    console.error('[Speaker Refinement] Claude Opus 4.6 refinement failed:', err.message);
    return segments;
  }
}
