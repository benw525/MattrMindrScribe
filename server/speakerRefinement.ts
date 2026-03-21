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
  recordingType?: string | null
): Promise<Segment[]> {
  if (segments.length === 0) return segments;

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
