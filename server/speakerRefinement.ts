import Anthropic from '@anthropic-ai/sdk';
import type { EnrichedDiarizationResult } from './diarization.js';

interface Segment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SINGLE_CALL_LIMIT = 800;
const BATCH_SIZE = 700;
const OVERLAP_CONTEXT = 20;

function buildSystemPrompt(): string {
  return `You are an expert legal transcript analyst. You will receive a transcript with preliminary speaker labels that are often wrong. Your job is to:

1. **Identify every speaker by name or role.** Extract names from the text itself — attorney appearances, introductions, the deponent stating their name, etc. Never leave a speaker as "Speaker 1" or "Speaker 2". Use full names when available, or role labels (e.g. "Videographer", "Court Reporter") when names cannot be determined.

2. **Correct speaker misattributions.** The preliminary labels from automated diarization are frequently wrong. Use conversational logic — questions come from one speaker, answers from another. The same person does not ask and answer their own question.

3. **Clean up text formatting.** Add proper punctuation (periods, question marks, commas). Format times with colons (e.g. "1.33 p.m." becomes "1:33 p.m."). Fix capitalization. But PRESERVE all filler words (uh, um, mm-hmm) and all spoken content exactly as said — do not add, remove, or rephrase words. Do not combine or split segments.

Your response must be ONLY valid JSON with no other text. The JSON has two fields:
- "segments": array of objects with "label" and "text", one per input segment, in order. Length MUST match input. IMPORTANT: Each segment's "label" must be the speaker's actual name or role (e.g. "Alexander Kirkland", "Barry Porter", "Videographer", "Court Reporter") — NOT a generic label like "Speaker 1" or "Speaker 2". Apply your identifications directly into every segment's label.
- "identifications": object mapping the original generic input labels to the identified names/roles (e.g. {"Speaker 1": "Videographer", "Speaker 3": "Alexander Kirkland"}).`;
}

const RECORDING_TYPE_SECTIONS: Record<string, string> = {
  deposition: `This is a deposition. Key structural knowledge:

- **Videographer**: Opens the record with a phrase like "This begins the video deposition of [name]..." and closes it similarly. States the time, date, and asks counsel to identify themselves. Not all depositions have a videographer — only video depositions do.
- **Court Reporter**: Administers the oath ("Do you swear or affirm..."). This is ALWAYS a different person from the videographer. May ask "usual stipulations?" and may interject to request spelling or repetition during testimony.
- **Attorneys**: State their appearances near the start ("[Name], here for the plaintiff", "[Name], for defendant"). The examining attorney asks the questions. The defending attorney speaks rarely, mainly for objections.
- **Deponent/Witness**: The person being questioned. Named in the videographer's opening and states their own name when asked. Provides answers.

After the opening formalities, depositions follow strict Q&A alternation: the examining attorney asks a question, the deponent answers. They alternate. If the same speaker appears to both ask and answer, one attribution is wrong. Short responses like "Yes", "Sure", "Okay", "I do", "Mm-hmm" after a question are almost always the deponent answering. Short transitional phrases like "Okay", "All right" after an answer are almost always the attorney moving to the next question.`,

  court_hearing: `This is a court hearing. Key roles:

- **Judge**: Presides, rules on motions ("Sustained", "Overruled"), directs proceedings.
- **Clerk/Bailiff**: Calls court to order ("All rise"), may administer oaths, announces the judge.
- **Attorneys**: Present arguments, examine witnesses. Identify by name from appearances.
- **Witness**: Testifies under examination. Named when called to the stand.
- **Defendant**: Enters pleas, may make statements when addressed by the judge.
- **Court Reporter**: Rarely speaks, may ask for clarification.`,

  recorded_statement: `This is a recorded statement. Key roles:

- **Adjuster/Investigator**: Opens with a preamble identifying themselves and the subject, states date/time, asks for consent to record, then asks structured questions.
- **Claimant/Subject**: The person giving the statement, often named in the opening preamble.
- **Attorney**: If present, may advise the claimant or interject.
- **Interpreter**: If present, translates questions and answers.`,

  police_interrogation: `This is a police interrogation. Key roles:

- **Lead Detective**: Conducts questioning, may read Miranda rights, identifies themselves by name and department.
- **Second Detective/Officer**: May be present to assist or ask follow-up questions.
- **Suspect/Subject**: The person being questioned, responds to Miranda warnings.
- **Attorney**: If present, advises the suspect, may terminate the interrogation.`,

  body_cam: `This is body camera footage from a law enforcement officer. Key roles:

- **Primary Officer**: The officer wearing the body camera. Their voice is typically the loudest and most consistent throughout the recording. They identify themselves by name and badge number, call out their actions, communicate with dispatch, and interact with subjects on scene.
- **Partner Officer / Backup Officers**: Additional officers who arrive or are already on scene. They may be identified by name when the primary officer addresses them or when they identify themselves to subjects.
- **Subject / Suspect**: The person the officer is interacting with — could be a suspect, detainee, or person of interest. Often addressed by name during the encounter. May be argumentative, compliant, or unresponsive.
- **Witness / Bystander**: Civilians present at the scene who may provide statements, ask questions, or interject. Often unnamed unless they provide identification.
- **Victim / Complainant**: The person who called for assistance or was the victim of an incident. May give a statement describing what happened.
- **Dispatch**: Voice over the radio providing information, confirming codes, or relaying instructions. Usually brief, clipped communications with radio static or tones.

Body cam recordings are often chaotic with overlapping speech, background noise (sirens, wind, traffic), radio chatter, and movement sounds. Speakers may be difficult to distinguish. Use context clues: radio traffic is always Dispatch, the clearest/loudest voice is usually the Primary Officer, and people addressed directly are usually subjects or witnesses.`,

  other: `This is an informal or miscellaneous recording. Identify speakers by name or role based on context clues — self-introductions, how they address each other, professional titles, relationship references. Use descriptive labels like "Officer", "Witness", "Narrator", "Interviewer", etc. when names are not available.`,
};

function buildEnrichedSystemPrompt(): string {
  return `You are a transcript analyst specializing in legal audio for personal injury law firms. You receive enriched transcripts from body camera footage, depositions, hearings, recorded statements, and other legal recordings. Your job is to produce a clean, accurate, speaker-identified transcript suitable for use in legal proceedings.

You will receive a JSON object containing utterances from AssemblyAI with the following data per utterance:
- speaker: A generic label (A, B, C, etc.)
- text: The transcribed speech
- start / end: Timestamps in milliseconds
- confidence: Overall utterance confidence (0.0 to 1.0)
- words: Array of individual words with per-word confidence scores and speaker labels
- sentiment: POSITIVE, NEGATIVE, or NEUTRAL with a confidence score
- entities: Named entities detected (locations, persons, dates, etc.)

You will also receive case context when available: known party names, officer names, incident location, and recording type.

Your output is a refined transcript in a structured JSON format.

---

TASK 1: RADIO TRANSMISSION DETECTION

Body camera and dash camera recordings frequently capture radio transmissions — dispatch calls, unit check-ins, cross-chatter from other units, and automated system broadcasts. These are NOT part of the on-scene interaction and must be labeled separately. Attorneys need to distinguish what was said at the scene from what came through the radio.

Use the following converging signals to identify radio transmissions. No single signal is definitive — use the combination:

ACOUSTIC SIGNALS (from AssemblyAI data):
- Confidence scores: Radio audio is bandwidth-limited and compressed. Words from radio transmissions will consistently show LOWER per-word confidence scores than on-scene speech from the same recording. Look for clusters of words where confidence drops noticeably (typically 0.15-0.30 lower than the on-scene baseline). Establish the baseline from the highest-confidence speaker first, then flag speakers or segments that fall significantly below it.
- Speaker clustering: Radio audio has a distinct acoustic profile (tinny, compressed, clipped). AssemblyAI typically clusters all radio audio under one or two speaker labels, separate from on-scene speakers. If a speaker label appears only in short bursts with consistently low confidence, it is likely radio.

TEXTUAL SIGNALS (from transcript content):
- Dispatch vocabulary: 10-codes (10-4, 10-97, 10-8), signal codes, unit numbers (Unit 247, Adam-12), status codes (code 3, code 4), phonetic alphabet (Alpha, Bravo, Charlie used for identifiers)
- Dispatch sentence structure: "[Unit ID] [directive] [location/subject]" pattern — e.g., "Unit 247 respond to 1520 Oak Street" or "All units be advised suspect vehicle is a blue Honda"
- Call-and-response patterns: Brief acknowledgments ("10-4", "copy", "en route") following dispatch directives
- Address/description broadcasts: Unprompted location callouts, suspect descriptions, vehicle descriptions, BOLO alerts that have no conversational context with on-scene speakers
- Lack of conversational continuity: Radio segments do not respond to or continue the on-scene conversation — they interrupt it

SENTIMENT SIGNALS (from AssemblyAI data):
- Radio transmissions are almost universally NEUTRAL sentiment with high sentiment confidence (>0.85). Dispatch communication is procedural and emotionless by design. On-scene interactions, especially in incidents involving injury, typically show varied sentiment.

ENTITY SIGNALS (from AssemblyAI data):
- Radio segments are dense with specific entity types: street addresses, unit/badge numbers, timestamps, vehicle descriptions. The entity density (entities per word) in radio segments is typically much higher than in conversational speech.

IMPORTANT CAVEATS:
- An officer at the scene may REPEAT information they heard on the radio to people at the scene. This is NOT a radio transmission — it is on-scene speech that happens to contain dispatch-like content. The distinguishing factor is the speaker label and confidence profile, not the vocabulary alone.
- An officer may speak INTO the radio (keying up to dispatch). This IS on-scene speech — the officer is physically present. Label these as the officer, not as [RADIO]. You can add a note: "[Officer speaks into radio]" if contextually clear.
- Some radio transmissions may be partially intelligible. If confidence is extremely low (<0.40) across an entire utterance and textual content suggests radio, label it as [RADIO - PARTIALLY UNINTELLIGIBLE] rather than guessing at content.
- Do NOT alter the transcribed text of radio segments. Transcribe them as-is. The label is for identification, not removal.

---

TASK 2: SPEAKER IDENTIFICATION

Replace generic speaker labels (A, B, C) with identified names or roles.

Use these strategies in order of reliability:
1. CASE CONTEXT: If the input includes known party names, officer names, or roles, match speakers to these using conversational cues (introductions, name usage, role references).
2. SELF-IDENTIFICATION: Speakers who state their name, badge number, or title ("This is Officer Martinez, badge 4471").
3. ROLE INFERENCE: Speakers whose language patterns clearly indicate a role — attorneys use legal terminology and ask structured questions; officers give Miranda warnings or describe observations; medical personnel use clinical language; witnesses describe events they saw.
4. CONTEXTUAL CLUES: References by other speakers ("Mr. Johnson, can you describe..."), or environmental cues.
5. UNKNOWN: If a speaker cannot be identified, use a descriptive placeholder: "Unidentified Male 1", "Unidentified Female 2", etc. NEVER guess a name. An incorrect speaker attribution in a legal transcript is worse than an unidentified speaker.

---

TASK 3: TRANSCRIPT REFINEMENT

Clean up the raw transcript for readability and accuracy:
- Correct obvious mistranscriptions where context makes the intended word clear (e.g., "rite" → "right" in legal context, "sore" → "saw"). Note corrections with [corrected] inline only if the correction is non-obvious.
- Preserve verbal tics, false starts, and filler words (um, uh, you know) — these are legally significant in depositions and recorded statements. Do NOT clean them up.
- Preserve profanity exactly as spoken. Do NOT censor or redact.
- Mark unintelligible segments as [UNINTELLIGIBLE] rather than guessing. Include the timestamp range.
- Mark crosstalk as [CROSSTALK] when multiple speakers overlap and individual words cannot be reliably attributed.
- Normalize legal terminology to standard spelling (e.g., ensure "plaintiff" not "plane tiff").
- Preserve timestamps at speaker transitions and at regular intervals (at minimum every 30 seconds of audio).

---

OUTPUT FORMAT

Return a JSON object with this structure:

{
  "metadata": {
    "recording_type": "body_camera | deposition | hearing | phone_call | other",
    "duration_ms": <total duration>,
    "speakers_identified": <count>,
    "radio_segments_detected": <count>,
    "confidence_baseline": <average confidence of highest-confidence on-scene speaker>,
    "refinement_notes": "<any global notes about audio quality, issues encountered, etc.>"
  },
  "speakers": {
    "A": {
      "identified_as": "Officer Martinez",
      "role": "law_enforcement",
      "confidence_in_identification": "high | medium | low",
      "basis": "Self-identified at 00:00:12 — stated name and badge number"
    },
    "B": {
      "identified_as": "[RADIO]",
      "role": "dispatch",
      "confidence_in_identification": "high",
      "basis": "Consistent low word confidence (avg 0.58), dispatch vocabulary, neutral sentiment, no conversational continuity with on-scene speakers"
    }
  },
  "transcript": [
    {
      "speaker": "Officer Martinez",
      "timestamp": "00:00:05",
      "timestamp_ms": 5000,
      "end_ms": 12000,
      "text": "This is Officer Martinez, badge 4471, activating body camera.",
      "type": "on_scene",
      "corrections": []
    },
    {
      "speaker": "[RADIO]",
      "timestamp": "00:00:15",
      "timestamp_ms": 15000,
      "end_ms": 22000,
      "text": "Unit 247 10-97 at 1520 Oak Street, code 3, possible 10-50 with injuries",
      "type": "radio_transmission",
      "radio_classification": "dispatch_directive",
      "corrections": []
    }
  ]
}

RADIO CLASSIFICATION VALUES:
- dispatch_directive: Dispatch issuing instructions to units
- unit_acknowledgment: Officer/unit confirming receipt (10-4, copy, en route)
- bolo_alert: Be On the Lookout broadcast
- status_update: Unit reporting status (10-8 in service, 10-97 on scene)
- cross_chatter: Communication between other units not involving the recording officer
- system_broadcast: Automated system messages (time checks, channel identification)
- unknown: Radio transmission that cannot be further classified

---

CRITICAL RULES:
1. ACCURACY OVER COMPLETENESS. If you are not confident in a word, mark it [UNINTELLIGIBLE]. Courts rely on transcript accuracy.
2. NEVER FABRICATE CONTENT. If audio is unclear, say so. Do not fill gaps with plausible-sounding text.
3. PRESERVE THE RECORD. Every word spoken at the scene, including profanity, threats, slurs, emotional outbursts, and incomplete sentences, must be preserved exactly as spoken.
4. RADIO SEGMENTS STAY IN THE TRANSCRIPT. They are labeled and classified, not removed. Attorneys may need the full radio traffic for timeline reconstruction.
5. SPEAKER ATTRIBUTION ERRORS ARE SERIOUS. When in doubt, use a generic label rather than risk misattribution.
6. TIMESTAMPS ARE LEGAL EVIDENCE. Ensure they are accurate and consistent. Never adjust timestamps to "clean up" the timeline.`;
}

function computeSpeakerStats(enrichedData: EnrichedDiarizationResult): Record<string, { avg_word_confidence: number; total_words: number; total_utterances: number }> {
  const stats: Record<string, { totalConf: number; wordCount: number; utteranceCount: number }> = {};

  for (const utterance of enrichedData.utterances) {
    if (!stats[utterance.speaker]) {
      stats[utterance.speaker] = { totalConf: 0, wordCount: 0, utteranceCount: 0 };
    }
    stats[utterance.speaker].utteranceCount++;
    for (const word of utterance.words) {
      stats[utterance.speaker].totalConf += word.confidence;
      stats[utterance.speaker].wordCount++;
    }
  }

  const result: Record<string, { avg_word_confidence: number; total_words: number; total_utterances: number }> = {};
  for (const speaker of Object.keys(stats)) {
    const s = stats[speaker];
    result[speaker] = {
      avg_word_confidence: s.wordCount > 0 ? Math.round((s.totalConf / s.wordCount) * 1000) / 1000 : 0,
      total_words: s.wordCount,
      total_utterances: s.utteranceCount,
    };
  }
  return result;
}

function buildEnrichedUserMessage(
  enrichedData: EnrichedDiarizationResult,
  speakerStats: Record<string, { avg_word_confidence: number; total_words: number; total_utterances: number }>,
  recordingType?: string | null,
): string {
  const payload = {
    case_context: {
      recording_type: recordingType || 'other',
    },
    utterances: enrichedData.utterances,
    sentiment_analysis: enrichedData.sentiment_analysis_results,
    entities: enrichedData.entities,
  };

  return `Analyze the following enriched transcript and produce the refined output per your instructions.

SPEAKER CONFIDENCE SUMMARY (pre-computed):
${JSON.stringify(speakerStats, null, 2)}

This summary shows average word-level confidence per speaker. Speakers with significantly lower average confidence than the highest-confidence speaker are candidates for radio transmission labeling. Use this as a starting signal, then confirm with textual, sentiment, and entity analysis.

FULL ENRICHED TRANSCRIPT:
${JSON.stringify(payload)}`;
}

function parseEnrichedResponse(content: string): { transcript: any[]; speakers: Record<string, any>; metadata: any } | null {
  const cleaned = content.replace(/```json\n?|```\n?/g, '').trim();
  try {
    const result = JSON.parse(cleaned);
    if (result.transcript && Array.isArray(result.transcript)) {
      return result;
    }
  } catch (e: any) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0]);
        if (result.transcript && Array.isArray(result.transcript)) {
          return result;
        }
      } catch {}
    }
  }
  return null;
}

function convertEnrichedToSegments(enrichedResult: { transcript: any[]; speakers: Record<string, any> }): Segment[] {
  return enrichedResult.transcript.map((entry: any) => ({
    speaker: entry.speaker || 'Unknown',
    text: entry.text || '',
    startTime: (entry.timestamp_ms || 0) / 1000,
    endTime: (entry.end_ms || entry.timestamp_ms || 0) / 1000,
  }));
}

function getRecordingTypeLabel(recordingType: string | null): string {
  const labels: Record<string, string> = {
    deposition: 'a deposition',
    court_hearing: 'a court hearing',
    recorded_statement: 'a recorded statement',
    police_interrogation: 'a police interrogation',
    body_cam: 'body camera footage',
    other: 'an informal/other recording',
  };
  return recordingType && labels[recordingType] ? labels[recordingType] : 'unknown';
}

function buildUserPrompt(
  segmentData: { i: number; s: string; t: string }[],
  speakerHint: string,
  recordingType?: string | null,
  batchContext?: { batchNumber: number; totalBatches: number; contextSegments?: { i: number; s: string; t: string }[]; priorIdentifications?: Record<string, string> },
  knownRoster?: { name: string; role: string }[] | null
): string {
  let preamble = '';

  if (batchContext && batchContext.totalBatches > 1) {
    preamble += `This is batch ${batchContext.batchNumber} of ${batchContext.totalBatches} from a longer transcript.\n`;
    if (batchContext.priorIdentifications && Object.keys(batchContext.priorIdentifications).length > 0) {
      const identifiedNames = [...new Set(Object.values(batchContext.priorIdentifications))];
      preamble += `Speakers identified so far: ${identifiedNames.join(', ')}. Use these exact names. Do not revert to generic labels.\n`;
      preamble += `Speaker mapping: ${JSON.stringify(batchContext.priorIdentifications)}\n`;
    }
    if (batchContext.contextSegments && batchContext.contextSegments.length > 0) {
      preamble += `Context from previous batch (do NOT include these in your output):\n${JSON.stringify(batchContext.contextSegments)}\n`;
    }
    preamble += '\n';
  }

  if (knownRoster && knownRoster.length > 0) {
    preamble += `SPEAKER ROSTER (identified from the opening):\n`;
    for (const { name, role } of knownRoster) {
      preamble += `- ${name} (${role})\n`;
    }
    preamble += `Use ONLY these names in your "label" fields. Do not use generic labels.\n\n`;
  }

  const typeKey = recordingType && RECORDING_TYPE_SECTIONS[recordingType] ? recordingType : null;
  const section = typeKey ? RECORDING_TYPE_SECTIONS[typeKey] : Object.values(RECORDING_TYPE_SECTIONS).join('\n\n');

  return `${preamble}${speakerHint}

${section}

The preliminary speaker labels below are from automated diarization and are often WRONG. Re-assign speakers based on who is actually speaking, using conversational context and the structural knowledge above. Identify each speaker by their real name or role — never use generic labels like "Speaker 1".

Transcript segments:
${JSON.stringify(segmentData)}`;
}

interface ParsedSegment {
  label: string;
  text: string;
}

function parseResponse(content: string, expectedCount: number): { segments: ParsedSegment[]; labels: string[]; identifications: Record<string, string> } | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log(`[Speaker Refinement] No JSON object found in response (${content.length} chars). First 200 chars: ${content.substring(0, 200)}`);
    return null;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    console.log(`[Speaker Refinement] Failed to parse JSON from response: ${e.message}`);
    console.log(`[Speaker Refinement] JSON string length: ${jsonMatch[0].length}, first 200 chars: ${jsonMatch[0].substring(0, 200)}`);
    return null;
  }

  const identifications: Record<string, string> = {};
  if (parsed.identifications && typeof parsed.identifications === 'object') {
    Object.assign(identifications, parsed.identifications);
  }
  console.log(`[Speaker Refinement] Identifications map: ${JSON.stringify(identifications)}`);

  if (parsed.segments && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
    const segs: ParsedSegment[] = parsed.segments;
    const sampleLabels = segs.slice(0, 10).map(s => s.label);
    console.log(`[Speaker Refinement] Got ${segs.length} segment objects, expected ${expectedCount}`);
    console.log(`[Speaker Refinement] First 10 segment labels: ${JSON.stringify(sampleLabels)}`);

    if (segs.length === expectedCount || (segs.length >= expectedCount * 0.9 && segs.length <= expectedCount * 1.1)) {
      const labels = segs.map(s => s.label || '');
      if (segs.length > expectedCount) {
        return { segments: segs.slice(0, expectedCount), labels: labels.slice(0, expectedCount), identifications };
      }
      return { segments: segs, labels, identifications };
    } else {
      console.log(`[Speaker Refinement] Segment count mismatch too large (${segs.length} vs ${expectedCount}) — falling back to labels/identifications`);
    }
  }

  let labels: string[] = [];
  if (parsed.labels && Array.isArray(parsed.labels)) {
    labels = parsed.labels;
  } else if (Array.isArray(parsed)) {
    labels = parsed;
  } else if (parsed.speakers && Array.isArray(parsed.speakers)) {
    labels = parsed.speakers;
  } else {
    const firstArrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]) && k !== 'segments');
    if (firstArrayKey) {
      labels = parsed[firstArrayKey];
    }
  }

  if (labels.length > 0) {
    console.log(`[Speaker Refinement] Got ${labels.length} labels, expected ${expectedCount}`);

    if (labels.length !== expectedCount) {
      if (labels.length > 0 && labels.length >= expectedCount * 0.9) {
        console.log(`[Speaker Refinement] Label count mismatch (${labels.length} vs ${expectedCount}) — trimming/padding to match`);
        if (labels.length > expectedCount) {
          labels = labels.slice(0, expectedCount);
        }
      } else {
        console.log(`[Speaker Refinement] Label count mismatch too large (${labels.length} vs ${expectedCount}) — using identifications map to apply labels`);
        if (Object.keys(identifications).length > 0) {
          return { segments: [], labels: [], identifications };
        }
        return null;
      }
    }

    return { segments: [], labels, identifications };
  }

  if (Object.keys(identifications).length > 0) {
    return { segments: [], labels: [], identifications };
  }

  console.log(`[Speaker Refinement] No usable data in parsed response. Keys: ${Object.keys(parsed).join(', ')}`);
  return null;
}

function applyIdentificationsToGenericLabels(refined: Segment[], identifications: Record<string, string>): Segment[] {
  if (Object.keys(identifications).length === 0) {
    console.log(`[Speaker Refinement] applyIdentifications: identifications map is empty — skipping`);
    return refined;
  }

  const genericCount = refined.filter(s => /^Speaker\s*\d+$/i.test(s.speaker)).length;
  console.log(`[Speaker Refinement] applyIdentifications: ${genericCount} generic labels found, identifications map has ${Object.keys(identifications).length} entries`);

  let replaced = 0;
  const result = refined.map(seg => {
    if (/^Speaker\s*\d+$/i.test(seg.speaker)) {
      const mapped = identifications[seg.speaker];
      if (typeof mapped === 'string' && mapped.trim().length > 0) {
        replaced++;
        return { ...seg, speaker: mapped.trim() };
      }
      const normalizedKey = Object.keys(identifications).find(k =>
        k.replace(/\s+/g, '').toLowerCase() === seg.speaker.replace(/\s+/g, '').toLowerCase()
      );
      if (normalizedKey && typeof identifications[normalizedKey] === 'string' && identifications[normalizedKey].trim().length > 0) {
        replaced++;
        return { ...seg, speaker: identifications[normalizedKey].trim() };
      }
    }
    return seg;
  });

  if (replaced > 0) {
    console.log(`[Speaker Refinement] Applied identifications map to ${replaced} generic label(s)`);
  }

  return result;
}

async function refineBatch(
  segments: Segment[],
  speakerHint: string,
  systemPrompt: string,
  recordingType?: string | null,
  batchContext?: { batchNumber: number; totalBatches: number; contextSegments?: { i: number; s: string; t: string }[]; priorIdentifications?: Record<string, string> },
  knownRoster?: { name: string; role: string }[] | null
): Promise<{ segments: ParsedSegment[]; labels: string[]; identifications: Record<string, string> } | null> {
  const segmentData = segments.map((s, i) => ({
    i,
    s: s.speaker,
    t: s.text,
  }));

  const userPrompt = buildUserPrompt(segmentData, speakerHint, recordingType, batchContext, knownRoster);

  const maxTokens = Math.min(32000, Math.max(8192, segments.length * 40 + 2000));
  console.log(`[Speaker Refinement] Using max_tokens: ${maxTokens} for ${segments.length} segments`);

  let content = '';
  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-20250514',
    max_tokens: maxTokens,
    temperature: 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      content += event.delta.text;
    }
  }

  if (!content) return null;

  console.log(`[Speaker Refinement] Claude response length: ${content.length} chars`);

  return parseResponse(content, segments.length);
}

async function identifySpeakersFromOpening(
  segments: Segment[],
  recordingType: string
): Promise<{ name: string; role: string }[] | null> {
  const openingCount = Math.min(80, segments.length);
  const openingSegments = segments.slice(0, openingCount);

  const segmentData = openingSegments.map((s, i) => ({
    i,
    s: s.speaker,
    t: s.text,
  }));

  const typeKey = recordingType && RECORDING_TYPE_SECTIONS[recordingType] ? recordingType : null;
  const section = typeKey ? RECORDING_TYPE_SECTIONS[typeKey] : '';

  const systemPrompt = `You are an expert legal transcript analyst. Identify all speakers from the opening of this proceeding. Return ONLY valid JSON with one field: "roster" — an array of {"name", "role"} objects. Use full names when stated in the text, role labels otherwise.`;

  const userPrompt = `Analyze the opening of this ${getRecordingTypeLabel(recordingType)} and identify every speaker by name and role.

${section}

Opening segments:
${JSON.stringify(segmentData)}`;

  console.log(`[Speaker Refinement] Pass 1: Identifying speakers from first ${openingCount} segments...`);

  let content = '';
  try {
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-20250514',
      max_tokens: 2000,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        content += event.delta.text;
      }
    }
  } catch (err: any) {
    console.error(`[Speaker Refinement] Pass 1 failed:`, err.message);
    return null;
  }

  if (!content) return null;

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.roster && Array.isArray(parsed.roster)) {
      console.log(`[Speaker Refinement] Pass 1 identified ${parsed.roster.length} speakers: ${parsed.roster.map((r: any) => `${r.name} (${r.role})`).join(', ')}`);
      return parsed.roster;
    }
  } catch (e: any) {
    console.error(`[Speaker Refinement] Pass 1 parse error:`, e.message);
  }

  return null;
}

function applyDepositionQAPostProcessing(segments: Segment[], knownRoster?: { name: string; role: string }[] | null): Segment[] {
  const proceduralRoles = ['videographer', 'court reporter', 'clerk', 'bailiff'];
  const proceduralNames = new Set<string>();
  if (knownRoster) {
    for (const { name, role } of knownRoster) {
      const roleLower = role.toLowerCase();
      if (proceduralRoles.some(pr => roleLower.includes(pr))) {
        proceduralNames.add(name.toLowerCase());
      }
    }
  }

  const speakerCounts: Record<string, { questions: number; answers: number; total: number }> = {};
  for (const seg of segments) {
    if (!speakerCounts[seg.speaker]) {
      speakerCounts[seg.speaker] = { questions: 0, answers: 0, total: 0 };
    }
    speakerCounts[seg.speaker].total++;
    if (seg.text.trim().endsWith('?')) {
      speakerCounts[seg.speaker].questions++;
    } else {
      speakerCounts[seg.speaker].answers++;
    }
  }

  const nonProceduralSpeakers = Object.entries(speakerCounts).filter(([name]) => {
    const lower = name.toLowerCase();
    if (proceduralRoles.some(pr => lower.includes(pr))) return false;
    if (proceduralNames.has(lower)) return false;
    return true;
  });

  if (nonProceduralSpeakers.length < 2) return segments;

  nonProceduralSpeakers.sort((a, b) => b[1].questions - a[1].questions);
  const examiner = nonProceduralSpeakers[0][0];

  nonProceduralSpeakers.sort((a, b) => b[1].answers - a[1].answers);
  const depositionSpeakers = nonProceduralSpeakers.filter(([name]) => name !== examiner);
  if (depositionSpeakers.length === 0) return segments;
  const deponent = depositionSpeakers[0][0];

  console.log(`[Speaker Refinement] Q&A post-processing: examiner="${examiner}", deponent="${deponent}"`);

  const SHORT_WORD_LIMIT = 5;
  const SHORT_AFFIRMATIVES = /^(okay|sure|yes|no|correct|right|i do|i did|i will|i don't|i have|i haven't|i was|i am|mm-hmm|uh-huh|yeah|nope|absolutely|exactly|true|that's correct|that's right|no sir|yes sir|no ma'am|yes ma'am|will do|i can|i cannot|i think so|probably|maybe|not sure|i don't know|i don't recall|i don't remember)[.!?,]*$/i;
  const SHORT_TRANSITIONS = /^(okay|all right|alright|let me|now|so|and|very well|got it|understood|moving on|let's move on|next|fair enough)[.!?,]*$/i;

  let corrected = 0;
  const result = [...segments];

  for (let i = 1; i < result.length - 1; i++) {
    const seg = result[i];
    const words = seg.text.trim().split(/\s+/);
    if (words.length > SHORT_WORD_LIMIT) continue;

    const prevSpeaker = result[i - 1].speaker;
    const nextSpeaker = result[i + 1]?.speaker;
    const textTrimmed = seg.text.trim();

    if (seg.speaker === examiner && prevSpeaker === examiner && SHORT_AFFIRMATIVES.test(textTrimmed)) {
      if (nextSpeaker === examiner) {
        result[i] = { ...seg, speaker: deponent };
        corrected++;
      }
    } else if (seg.speaker === deponent && prevSpeaker === deponent && SHORT_TRANSITIONS.test(textTrimmed)) {
      const prevText = result[i - 1].text.trim();
      if (!prevText.endsWith('?') && nextSpeaker !== deponent) {
        result[i] = { ...seg, speaker: examiner };
        corrected++;
      }
    }
  }

  if (corrected > 0) {
    console.log(`[Speaker Refinement] Q&A post-processing corrected ${corrected} segment(s)`);
  }

  return result;
}

export async function refineSpeakersWithGPT(
  segments: Segment[],
  expectedSpeakers?: number | null,
  recordingType?: string | null,
  enrichedData?: EnrichedDiarizationResult | null,
): Promise<Segment[]> {
  if (segments.length === 0) return segments;

  if (enrichedData && enrichedData.utterances.length > 0) {
    console.log(`[Speaker Refinement] Enriched data available — using enriched Claude Opus pipeline`);
    console.log(`[Speaker Refinement] ${enrichedData.utterances.length} utterances, ${enrichedData.sentiment_analysis_results.length} sentiment results, ${enrichedData.entities.length} entities`);

    try {
      const speakerStats = computeSpeakerStats(enrichedData);
      console.log(`[Speaker Refinement] Speaker confidence stats: ${JSON.stringify(speakerStats)}`);

      const enrichedSystemPrompt = buildEnrichedSystemPrompt();
      const enrichedUserMessage = buildEnrichedUserMessage(enrichedData, speakerStats, recordingType);

      console.log(`[Speaker Refinement] Sending enriched data to Claude Opus 4 (max_tokens: 16000)...`);

      let content = '';
      const stream = anthropic.messages.stream({
        model: 'claude-opus-4-20250514',
        max_tokens: 16000,
        temperature: 0.1,
        system: enrichedSystemPrompt,
        messages: [{ role: 'user', content: enrichedUserMessage }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          content += event.delta.text;
        }
      }

      if (content) {
        console.log(`[Speaker Refinement] Enriched Claude response length: ${content.length} chars`);
        const enrichedResult = parseEnrichedResponse(content);
        if (enrichedResult && enrichedResult.transcript.length > 0) {
          const enrichedSegments = convertEnrichedToSegments(enrichedResult);
          const radioCount = enrichedResult.transcript.filter((t: any) => t.type === 'radio_transmission').length;
          const uniqueSpeakers = new Set(enrichedSegments.map(s => s.speaker));
          console.log(`[Speaker Refinement] Enriched refinement complete: ${uniqueSpeakers.size} speakers, ${radioCount} radio segments detected`);
          if (enrichedResult.metadata?.refinement_notes) {
            console.log(`[Speaker Refinement] Notes: ${enrichedResult.metadata.refinement_notes}`);
          }
          return enrichedSegments;
        } else {
          console.log(`[Speaker Refinement] Enriched response did not parse to valid transcript — falling back to standard refinement`);
        }
      }
    } catch (err: any) {
      console.error(`[Speaker Refinement] Enriched pipeline failed — falling back to standard refinement:`, err.message);
    }
  }

  const speakerHint = expectedSpeakers
    ? `The recording is expected to have ${expectedSpeakers} speakers.`
    : 'Determine the correct number of speakers from context.';

  const systemPrompt = buildSystemPrompt();

  if (recordingType) {
    console.log(`[Speaker Refinement] Recording type: ${recordingType}`);
  } else {
    console.log(`[Speaker Refinement] No recording type specified — sending all sections`);
  }

  let knownRoster: { name: string; role: string }[] | null = null;
  if (recordingType === 'deposition' && segments.length > 30) {
    knownRoster = await identifySpeakersFromOpening(segments, recordingType);
    if (knownRoster) {
      console.log(`[Speaker Refinement] Roster from Pass 1: ${JSON.stringify(knownRoster)}`);
    } else {
      console.log(`[Speaker Refinement] Pass 1 returned no roster`);
    }
  }

  if (segments.length <= SINGLE_CALL_LIMIT) {
    console.log(`[Speaker Refinement] Sending ${segments.length} segments to Claude Opus 4 (single call)...`);
    try {
      const result = await refineBatch(segments, speakerHint, systemPrompt, recordingType, undefined, knownRoster);
      if (!result) {
        console.log('[Speaker Refinement] Failed to parse response, keeping original labels');
        return segments;
      }

      const idEntries = Object.entries(result.identifications);
      if (idEntries.length > 0) {
        console.log(`[Speaker Refinement] Identified speakers: ${idEntries.map(([from, to]) => `${from} → ${to}`).join(', ')}`);
      }

      let refined: Segment[];
      if (result.segments.length > 0) {
        refined = segments.map((seg, i) => {
          const parsed = result.segments[i];
          if (parsed) {
            return {
              ...seg,
              speaker: (parsed.label && parsed.label.trim().length > 0) ? parsed.label.trim() : seg.speaker,
              text: (parsed.text && parsed.text.trim().length > 0) ? parsed.text.trim() : seg.text,
            };
          }
          return seg;
        });
      } else if (result.labels.length === 0 && idEntries.length > 0) {
        console.log(`[Speaker Refinement] No per-segment data — applying identifications map to original labels`);
        refined = segments.map((seg) => {
          const mapped = result.identifications[seg.speaker];
          if (mapped && mapped.trim().length > 0) {
            return { ...seg, speaker: mapped.trim() };
          }
          return seg;
        });
      } else {
        refined = segments.map((seg, i) => {
          const label = result.labels[i];
          if (typeof label === 'string' && label.trim().length > 0) {
            return { ...seg, speaker: label.trim() };
          }
          const mapped = result.identifications[seg.speaker];
          if (mapped && mapped.trim().length > 0) {
            return { ...seg, speaker: mapped.trim() };
          }
          return seg;
        });
      }

      refined = applyIdentificationsToGenericLabels(refined, result.identifications);

      const uniqueSpeakers = new Set(refined.map(s => s.speaker));
      console.log(`[Speaker Refinement] Refined to ${uniqueSpeakers.size} speaker(s): ${[...uniqueSpeakers].join(', ')}`);

      if (recordingType === 'deposition') {
        refined = applyDepositionQAPostProcessing(refined, knownRoster);
      }

      return refined;
    } catch (err: any) {
      console.error('[Speaker Refinement] Claude Opus 4 refinement failed:', err.message);
      return segments;
    }
  }

  const totalBatches = Math.ceil(segments.length / BATCH_SIZE);
  console.log(`[Speaker Refinement] Large transcript (${segments.length} segments) — processing in ${totalBatches} batches of ~${BATCH_SIZE}...`);

  const allLabels: string[] = new Array(segments.length);
  const allTexts: string[] = new Array(segments.length);
  let cumulativeIdentifications: Record<string, string> = {};
  let processedUpTo = 0;

  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const batchStart = batchNum * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, segments.length);
    const batchSegments = segments.slice(batchStart, batchEnd);

    let contextSegments: { i: number; s: string; t: string }[] | undefined;
    if (batchNum > 0) {
      const contextStart = Math.max(0, batchStart - OVERLAP_CONTEXT);
      const contextSlice = segments.slice(contextStart, batchStart);
      contextSegments = contextSlice.map((s, i) => ({
        i: contextStart + i,
        s: allLabels[contextStart + i] || s.speaker,
        t: allTexts[contextStart + i] || s.text,
      }));
    }

    const batchContext = {
      batchNumber: batchNum + 1,
      totalBatches,
      contextSegments,
      priorIdentifications: batchNum > 0 ? { ...cumulativeIdentifications } : undefined,
    };

    console.log(`[Speaker Refinement] Batch ${batchNum + 1}/${totalBatches}: segments ${batchStart}-${batchEnd - 1} (${batchSegments.length} segments)...`);

    try {
      const result = await refineBatch(batchSegments, speakerHint, systemPrompt, recordingType, batchContext, knownRoster);
      if (!result) {
        console.log(`[Speaker Refinement] Batch ${batchNum + 1} failed to parse — applying cumulative identifications as fallback`);
        for (let i = batchStart; i < batchEnd; i++) {
          const originalLabel = segments[i].speaker;
          const mapped = cumulativeIdentifications[originalLabel];
          allLabels[i] = (mapped && mapped.trim().length > 0) ? mapped.trim() : originalLabel;
          allTexts[i] = segments[i].text;
        }
      } else {
        Object.assign(cumulativeIdentifications, result.identifications);

        if (result.segments.length > 0) {
          for (let i = 0; i < result.segments.length && (batchStart + i) < batchEnd; i++) {
            const parsed = result.segments[i];
            allLabels[batchStart + i] = (parsed.label && parsed.label.trim().length > 0) ? parsed.label.trim() : segments[batchStart + i].speaker;
            allTexts[batchStart + i] = (parsed.text && parsed.text.trim().length > 0) ? parsed.text.trim() : segments[batchStart + i].text;
          }
          for (let i = result.segments.length; (batchStart + i) < batchEnd; i++) {
            const originalLabel = segments[batchStart + i].speaker;
            const mapped = cumulativeIdentifications[originalLabel];
            allLabels[batchStart + i] = (mapped && mapped.trim().length > 0) ? mapped.trim() : originalLabel;
            allTexts[batchStart + i] = segments[batchStart + i].text;
          }
        } else if (result.labels.length === 0 && Object.keys(result.identifications).length > 0) {
          console.log(`[Speaker Refinement] Batch ${batchNum + 1}: no per-segment data — applying identifications map`);
          for (let i = batchStart; i < batchEnd; i++) {
            const originalLabel = segments[i].speaker;
            const mapped = result.identifications[originalLabel] || cumulativeIdentifications[originalLabel];
            allLabels[i] = (mapped && mapped.trim().length > 0) ? mapped.trim() : originalLabel;
            allTexts[i] = segments[i].text;
          }
        } else {
          for (let i = 0; i < result.labels.length; i++) {
            const label = result.labels[i];
            if (typeof label === 'string' && label.trim().length > 0) {
              allLabels[batchStart + i] = label.trim();
            } else {
              const originalLabel = segments[batchStart + i].speaker;
              const mapped = cumulativeIdentifications[originalLabel];
              allLabels[batchStart + i] = (mapped && mapped.trim().length > 0) ? mapped.trim() : originalLabel;
            }
            allTexts[batchStart + i] = segments[batchStart + i].text;
          }
        }

        const batchLabels = new Set<string>();
        for (let i = batchStart; i < batchEnd; i++) {
          if (allLabels[i]) batchLabels.add(allLabels[i]);
        }
        console.log(`[Speaker Refinement] Batch ${batchNum + 1} speakers: ${[...batchLabels].join(', ')}`);
      }
      processedUpTo = batchEnd;
    } catch (err: any) {
      console.error(`[Speaker Refinement] Batch ${batchNum + 1} failed:`, err.message);
      for (let i = batchStart; i < batchEnd; i++) {
        const originalLabel = segments[i].speaker;
        const mapped = cumulativeIdentifications[originalLabel];
        allLabels[i] = (mapped && mapped.trim().length > 0) ? mapped.trim() : originalLabel;
        allTexts[i] = segments[i].text;
      }
      processedUpTo = batchEnd;
    }
  }

  const idEntries = Object.entries(cumulativeIdentifications);
  if (idEntries.length > 0) {
    console.log(`[Speaker Refinement] Cross-batch identifications: ${idEntries.map(([from, to]) => `${from} → ${to}`).join(', ')}`);

    const reverseMap: Record<string, string> = {};
    for (const [generic, identified] of idEntries) {
      reverseMap[generic] = identified;
    }

    let normalizedCount = 0;
    for (let i = 0; i < allLabels.length; i++) {
      const label = allLabels[i];
      if (!label) continue;
      if (reverseMap[label]) {
        allLabels[i] = reverseMap[label];
        normalizedCount++;
      } else if (/^Speaker\s*\d+$/i.test(label)) {
        const bestMatch = Object.keys(reverseMap).find(k =>
          k.replace(/\s+/g, '').toLowerCase() === label.replace(/\s+/g, '').toLowerCase()
        );
        if (bestMatch) {
          allLabels[i] = reverseMap[bestMatch];
          normalizedCount++;
        } else {
          const originalSpeaker = segments[i].speaker;
          const mapped = reverseMap[originalSpeaker];
          if (mapped) {
            allLabels[i] = mapped;
            normalizedCount++;
          }
        }
      }
    }

    if (normalizedCount > 0) {
      console.log(`[Speaker Refinement] Post-batch normalization: resolved ${normalizedCount} generic labels`);
    }
  }

  let refined = segments.map((seg, i) => ({
    ...seg,
    speaker: allLabels[i] || seg.speaker,
    text: allTexts[i] || seg.text,
  }));

  refined = applyIdentificationsToGenericLabels(refined, cumulativeIdentifications);

  const uniqueSpeakers = new Set(refined.map(s => s.speaker));
  console.log(`[Speaker Refinement] Refined to ${uniqueSpeakers.size} speaker(s) across ${totalBatches} batches: ${[...uniqueSpeakers].join(', ')}`);

  if (recordingType === 'deposition') {
    refined = applyDepositionQAPostProcessing(refined, knownRoster);
  }

  return refined;
}
