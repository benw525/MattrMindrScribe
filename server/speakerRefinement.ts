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

const SINGLE_CALL_LIMIT = 500;
const BATCH_SIZE = 400;
const OVERLAP_CONTEXT = 20;

function buildSystemPrompt(): string {
  return `You are an expert legal transcript analyst with deep expertise in speaker identification across all types of legal recordings — depositions, court hearings, recorded statements, police interrogations, and informal recordings. You understand the structure, roles, and conversational patterns unique to each type of legal proceeding.

IMPORTANT: Your response must contain ONLY valid JSON and nothing else. No explanations, no commentary, no markdown — just raw JSON.

The JSON must have exactly two fields:
- "labels": an array of speaker labels (one per segment, in order, exactly matching the number of input segments)
- "identifications": an object mapping generic labels to identified names/roles

Do NOT include any text before or after the JSON object.`;
}

const RECORDING_TYPE_SECTIONS: Record<string, string> = {
  deposition: `==============================
DEPOSITION
==============================
Depositions have structured Q&A between attorneys and a witness, with an oath administered by a court reporter. Some depositions also have a videographer who opens/closes the record — but not all depositions are videotaped.

**How to tell if a Videographer is present:**
A videographer is present ONLY if there is an opening like "This begins the video deposition of [name]", "in the matter of [case name]", "the time is [time]", "would counsel please state their names for the record" — or similar language. The exact wording varies but always follows this pattern of announcing the video deposition, identifying the case, stating the time/date, and asking attorneys to identify themselves. If no such opening exists, there is no videographer — do NOT create a Videographer label.

**CRITICAL: Extract names from the transcript text itself.**
Search the transcript for these name-revealing patterns:
- Videographer's opening (if present): "This begins the video deposition of [DEPONENT NAME]" — this names the witness/deponent
- Attorney appearances: "[NAME], here for the plaintiff" or "[NAME], for defendant" or "[NAME] on behalf of [party]" — these name the attorneys
- The deponent stating their name: "I'm [NAME]" or "My name is [NAME]" or "State your full name" followed by "[NAME]"
- Direct address by name: "Mr./Ms. [NAME]", "[First name], have you ever..."
Map these discovered names back to the correct speaker labels. Do NOT leave speakers as "Speaker 1", "Speaker 2", etc. when names are clearly stated in the text.

**Typical speaker order in video depositions (when a videographer is present):**
1. **Videographer** opens the record: "This begins the video deposition of..."
2. **Videographer** asks counsel to identify themselves: "Would counsel please identify yourself..."
3. **Attorneys** state their appearances in response (each is a different speaker)
4. **Court Reporter** administers the oath — this is ALWAYS a DIFFERENT speaker from the Videographer. The oath-giver is never the same person who opened the record. Look for "raise your right hand", "Do you swear or affirm..."
5. **Examining Attorney** begins Q&A with the **Deponent**

**Typical speaker order in non-video depositions (no videographer):**
1. **Examining Attorney** or **Court Reporter** opens the record
2. **Attorneys** may state appearances
3. **Court Reporter** administers the oath
4. **Examining Attorney** begins Q&A with the **Deponent**

**Minimum distinct roles when present in the transcript:** Court Reporter, at least one Attorney, and the Deponent are always present. Videographer is only present when the opening announces a video deposition. When these roles appear, they are ALWAYS separate people — never merge any two into the same speaker label.

**Potential speakers & identification patterns:**

**Videographer (only present in video depositions — see detection rules above):**
- Opens with "This begins the video deposition of [deponent name]..." or "We are now on the record..." or similar
- Closes with "This concludes the video deposition of [deponent name]..." or "We are now off the record..."
- Announces time, date, and location at the start
- May call for breaks: "Going off the record at [time]"
- Often asks counsel to identify themselves and state whom they represent
- Does NOT administer the oath — that is the Court Reporter's role (a different person)
- Only label a speaker as "Videographer" if the video deposition opening pattern is present
- Label as "Videographer" or by name if identifiable

**Court Reporter:**
- ALWAYS a different person/speaker from the Videographer — never the same label
- Administers the oath: "Do you solemnly swear...", "Do you swear or affirm...", "Do you, [name], swear to tell the truth..."
- Often begins with "Would you raise your right hand?" or "Raise your right hand, please" before the oath
- Speaks AFTER attorneys state appearances and BEFORE the examining attorney begins questioning
- May ask about "usual stipulations" or "standard stipulations"
- May interject during testimony: "Could you spell that?", "I'm sorry, could you repeat that?", "One at a time, please", "Can you speak up?"
- May request spelling of names or technical terms during testimony
- If you see a speaker administer an oath, that speaker MUST be labeled "Court Reporter" (not Videographer, not an attorney)
- Label as "Court Reporter" or by name if identifiable

**Examining Attorney (Questioning Attorney):**
- Asks most of the questions during the deposition
- States appearance early: "[Name], here for the plaintiff" or similar
- Directs the witness: "Could you state your name for the record?"
- Uses formal question patterns: "Isn't it true that...", "Would you agree that..."
- Label by full name (e.g. "Alexander Kirkland"), or "Examining Attorney" if name truly cannot be determined

**Deponent/Witness:**
- The person being questioned — provides answers
- Named in the videographer's opening: "video deposition of [name]"
- States their own name when asked: "I'm [name]" or "My name is [name]"
- Answers tend to be responsive to questions
- Label by full name (e.g. "Barry Porter"), or "The Witness" if name truly cannot be determined

**Defending Attorney:**
- Makes objections: "Objection", "Objection, form", "Objection, leading", "Objection, asked and answered"
- May instruct the witness not to answer
- States appearance: "[Name], for defendant" or "representing [party]"
- Speaks less frequently, primarily during objections or cross-examination
- Label by full name if identifiable, otherwise "Defending Attorney"

**Other Attorneys:**
- Additional counsel may be present for other parties
- May state appearances at the beginning
- May make their own objections
- Label by name and party if identifiable`,

  court_hearing: `==============================
COURT HEARING
==============================
Court hearings have a judge presiding, with attorneys arguing motions or presenting cases. The tone is more formal with judicial authority directing proceedings.

**Potential speakers & identification patterns:**

**Judge:**
- Presides over the hearing — directs proceedings, rules on motions and objections
- Opens with "This court is now in session" or "We're on the record in the matter of..."
- Calls cases: "Calling case number..." or "Next on the docket..."
- Rules: "Sustained", "Overruled", "Motion granted", "Motion denied"
- Addresses attorneys: "Counsel", "Mr./Ms. [Name]"
- Gives jury instructions or addresses the jury
- Label as "Judge [Name]" or "The Court"

**Clerk/Bailiff:**
- Calls the court to order: "All rise", "Court is now in session"
- Calls cases from the docket
- Administers oaths to witnesses
- May announce the judge: "The Honorable [Name] presiding"
- Label as "Clerk" or "Bailiff"

**Plaintiff's Attorney / Prosecutor:**
- Presents arguments on behalf of the plaintiff or the state/people
- "Your Honor, on behalf of the plaintiff...", "The State calls...", "The People submit..."
- Conducts direct examination of their witnesses
- Label by name if identifiable, otherwise "Plaintiff's Attorney" or "Prosecutor"

**Defense Attorney:**
- Represents the defendant
- "Your Honor, on behalf of the defendant...", "My client..."
- Conducts cross-examination, makes objections
- Label by name if identifiable, otherwise "Defense Attorney"

**Witness:**
- Called to testify: "Please state your name for the record"
- Sworn in by clerk or judge
- Provides testimony under direct and cross-examination
- Label by name if identifiable, otherwise "The Witness"

**Defendant:**
- May speak when addressed directly by the judge
- Enters pleas: "Guilty", "Not guilty", "No contest"
- May make allocution statements
- Label by name if identifiable, otherwise "The Defendant"

**Court Reporter:**
- Rarely speaks but may ask for clarification or repetition
- "Could you repeat that?" or "Could counsel speak up?"
- Label as "Court Reporter"`,

  recorded_statement: `==============================
RECORDED STATEMENT
==============================
Recorded statements are typically taken by insurance adjusters, investigators, or attorneys from claimants, witnesses, or parties. They are less formal than depositions but still structured.

**Potential speakers & identification patterns:**

**Adjuster/Investigator (Interviewer):**
- Opens with a recording preamble: "This is a recorded statement of [name]..." or "My name is [name], I'm a claims adjuster with [company]..."
- States the date, time, and purpose of the recording
- Asks the subject to confirm they consent to being recorded
- Asks structured questions about the incident, injuries, or claim
- May reference a claim number or file number
- Label by name and role if identifiable (e.g. "Adjuster Johnson"), otherwise "Interviewer"

**Claimant/Subject:**
- The person giving the statement
- Often named in the interviewer's opening preamble
- Confirms identity and consent to recording
- Provides narrative answers about the incident
- Label by name if identifiable, otherwise "Claimant" or "Subject"

**Attorney (if present):**
- May be present to advise the claimant
- May interject: "I'm going to advise my client not to answer that" or "Can we go off the record?"
- May introduce themselves at the start
- Label by name if identifiable, otherwise "Claimant's Attorney"

**Interpreter:**
- Translates questions and answers
- May introduce themselves and their language
- Label as "Interpreter"`,

  police_interrogation: `==============================
POLICE INTERROGATION
==============================
Police interrogations involve law enforcement questioning a suspect, witness, or person of interest. They have distinctive legal formalities and conversational dynamics.

**Potential speakers & identification patterns:**

**Lead Detective/Interrogator:**
- Conducts primary questioning
- May introduce themselves: "I'm Detective [Name] with the [Department]..."
- Reads Miranda rights: "You have the right to remain silent...", "Do you understand these rights?"
- Uses interrogation techniques: building rapport, confrontation, presenting evidence
- May reference case numbers or incident reports
- Label by name and rank if identifiable (e.g. "Detective Rodriguez"), otherwise "Lead Detective"

**Second Detective/Officer:**
- Often present as a witness or to assist
- May ask follow-up questions or take a different approach
- Sometimes plays a different role in questioning strategy
- Label by name and rank if identifiable, otherwise "Second Detective" or "Officer"

**Suspect/Subject:**
- The person being interrogated
- Responds to Miranda warnings: "Yes, I understand" or invokes rights
- May provide statements, confessions, or denials
- May ask for a lawyer: "I want a lawyer" or "I'm not saying anything without my attorney"
- Label by name if identifiable, otherwise "Suspect" or "Subject"

**Attorney (if present):**
- Defense attorney advising the suspect
- May interject to protect client's rights
- May terminate the interrogation: "This interview is over" or "My client is invoking their right to remain silent"
- Label by name if identifiable, otherwise "Defense Attorney"

**Interpreter:**
- Translates if the subject does not speak English
- Label as "Interpreter"`,

  other: `==============================
OTHER RECORDINGS
==============================
This section covers informal or situational recordings that don't fit neatly into formal legal proceeding categories. These may include witness statements, settlement negotiations, client communications, body camera footage, scene recordings, voice memos, and other field recordings. The structure may be loose or nonexistent.

**Types and identification patterns:**

**Witness Statements (Field):**
- An officer or investigator interviews a witness at or near a scene
- Opens informally: "Can you tell me what you saw?" or "I'm Officer [Name], can you describe what happened?"
- The witness provides a narrative account
- Potential speakers: Officer/Investigator, Witness, Bystanders
- Label by name/role if identifiable

**Settlement Negotiations:**
- Attorneys or parties discuss settlement terms
- May reference demand amounts, policy limits, or offers
- More conversational, back-and-forth discussion
- Potential speakers: Plaintiff's Attorney, Defense Attorney, Mediator, Insurance Representative, Parties
- Label by name/role if identifiable

**Client Communications:**
- Attorney-client conversations about case strategy or facts
- May reference privileged information
- Informal tone, first-name basis common
- Potential speakers: Attorney, Client, Paralegal, Legal Assistant
- Label by name/role if identifiable

**Body Camera / Dash Camera Footage:**
- Law enforcement recordings from the field
- Officer may narrate: "Responding to a call at [location]..."
- Interactions with civilians, suspects, witnesses at the scene
- May include radio communications
- Often chaotic with overlapping speech, background noise, multiple bystanders
- Potential speakers: Officer(s), Suspect, Witness(es), Bystander(s), Dispatch (radio)
- Label by name/role if identifiable; use "Officer 1", "Bystander 1" etc. for unidentified

**Scene / Accident Recordings:**
- Video or audio recorded at the scene of an accident or incident
- May be recorded by a party, witness, or passerby
- Often informal narration: "Oh my God, did you see that?" or describing what they're witnessing
- Potential speakers: Recorder/Narrator, Other Parties, Witnesses, Emergency Responders
- Label by name/role if identifiable; use "Narrator", "Bystander 1" etc. for unidentified

**Voice Memos / Personal Recordings:**
- Someone recording their own thoughts or a moment they deem important
- May be a single speaker narrating events
- Could capture a conversation the recorder is participating in
- Often informal with personal context
- Potential speakers: Recorder, Other Participants
- Label by name if identifiable; use "Narrator" for a solo recorder

**General identification cues for informal recordings:**
- Listen for self-introductions or name usage in conversation
- Badge numbers, ranks, or department names for law enforcement
- Professional titles or company names for business contexts
- Relationship references ("my attorney", "my client", "officer")
- Environmental cues (radio chatter = law enforcement, medical terminology = healthcare setting)`,
};

const GENERAL_RULES = `==============================
GENERAL RULES
==============================

**Name assignment rules:**
- Always identify every speaker — never leave a speaker as a generic label like "Speaker 1" or "Speaker 2"
- Use the speaker's full name when it can be determined from context (e.g. "Barry Porter" not just "Barry")
- When a name is not available, always assign a descriptive role label (e.g. "Videographer", "Court Reporter", "Examining Attorney", "Detective", "Claimant")
- Every speaker must end up with either a name or a role — generic numbered labels are not acceptable output
- For multiple speakers with the same role, number them (e.g. "Bystander 1", "Bystander 2", "Officer 1", "Officer 2")

**Cross-type identification cues:**
- Self-introductions: "My name is...", "I'm...", "This is..."
- Direct address: "Mr. Smith", "Ms. Johnson", "Your Honor", "Detective", "Officer"
- Role references: "counsel for the plaintiff", "the witness", "my client"
- Institutional phrases: "for the record", "let the record reflect", "on the record"

**Example response:**
{
  "labels": ["Videographer", "Court Reporter", "Attorney Smith", "Barry Porter", "Attorney Smith", "Barry Porter"],
  "identifications": {"Speaker 1": "Videographer", "Speaker 2": "Court Reporter", "Speaker 3": "Attorney Smith", "Speaker 4": "Barry Porter"}
}`;

function getRecordingTypeLabel(recordingType: string | null): string {
  const labels: Record<string, string> = {
    deposition: 'a deposition',
    court_hearing: 'a court hearing',
    recorded_statement: 'a recorded statement',
    police_interrogation: 'a police interrogation',
    other: 'an informal/other recording',
  };
  return recordingType && labels[recordingType] ? labels[recordingType] : 'unknown';
}

function buildUserPrompt(
  segmentData: { i: number; s: string; t: string }[],
  speakerHint: string,
  recordingType?: string | null,
  batchContext?: { batchNumber: number; totalBatches: number; contextSegments?: { i: number; s: string; t: string }[]; priorIdentifications?: Record<string, string> }
): string {
  let batchPreamble = '';
  if (batchContext && batchContext.totalBatches > 1) {
    batchPreamble = `**IMPORTANT: This is batch ${batchContext.batchNumber} of ${batchContext.totalBatches} from a longer transcript.**\n`;
    if (batchContext.priorIdentifications && Object.keys(batchContext.priorIdentifications).length > 0) {
      batchPreamble += `Speaker identifications from previous batches (use these to maintain consistency):\n`;
      for (const [generic, identified] of Object.entries(batchContext.priorIdentifications)) {
        batchPreamble += `- ${generic} = ${identified}\n`;
      }
      batchPreamble += `\n`;
    }
    if (batchContext.contextSegments && batchContext.contextSegments.length > 0) {
      batchPreamble += `The following segments are CONTEXT from the end of the previous batch (do NOT include labels for these — only label the segments in the main "Transcript segments" section below):\n`;
      batchPreamble += `${JSON.stringify(batchContext.contextSegments)}\n\n`;
    }
  }

  const typeKey = recordingType && RECORDING_TYPE_SECTIONS[recordingType] ? recordingType : null;
  const section = typeKey ? RECORDING_TYPE_SECTIONS[typeKey] : Object.values(RECORDING_TYPE_SECTIONS).join('\n\n');

  const typeInstruction = typeKey
    ? `The user has identified this recording as **${getRecordingTypeLabel(typeKey)}**. Use the section below to identify speakers.`
    : `Determine what type of recording this is from contextual clues, then use the appropriate section below to identify speakers.`;

  return `${batchPreamble}Below is a transcript with preliminary speaker labels. You have two tasks:

**Task 1: Correct speaker labels**
Review the conversational flow and correct any speaker misattributions. ${speakerHint}
- Preserve the original speaker label if it seems correct
- Look for conversational cues: questions followed by answers likely indicate speaker changes
- Do NOT merge speakers that are clearly different people
- Do NOT split a single speaker into multiple speakers unless there's strong evidence

**Task 2: Identify speaker names and roles**
${typeInstruction}

${section}

${GENERAL_RULES}

Transcript segments:
${JSON.stringify(segmentData)}`;
}

function parseResponse(content: string, expectedCount: number): { labels: string[]; identifications: Record<string, string> } | null {
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
      console.log(`[Speaker Refinement] No labels array found in parsed response. Keys: ${Object.keys(parsed).join(', ')}`);
      return null;
    }
  }

  console.log(`[Speaker Refinement] Got ${labels.length} labels, expected ${expectedCount}`);

  if (labels.length !== expectedCount) {
    if (labels.length > 0 && labels.length >= expectedCount * 0.9) {
      console.log(`[Speaker Refinement] Label count mismatch (${labels.length} vs ${expectedCount}) — trimming/padding to match`);
      if (labels.length > expectedCount) {
        labels = labels.slice(0, expectedCount);
      }
    } else {
      console.log(`[Speaker Refinement] Label count mismatch too large (${labels.length} vs ${expectedCount}) — using identifications map to apply labels`);
      const identifications: Record<string, string> = {};
      if (parsed.identifications && typeof parsed.identifications === 'object') {
        Object.assign(identifications, parsed.identifications);
      }
      if (Object.keys(identifications).length > 0) {
        return { labels: [], identifications };
      }
      return null;
    }
  }

  const identifications: Record<string, string> = {};
  if (parsed.identifications && typeof parsed.identifications === 'object') {
    Object.assign(identifications, parsed.identifications);
  }

  return { labels, identifications };
}

async function refineBatch(
  segments: Segment[],
  speakerHint: string,
  systemPrompt: string,
  recordingType?: string | null,
  batchContext?: { batchNumber: number; totalBatches: number; contextSegments?: { i: number; s: string; t: string }[]; priorIdentifications?: Record<string, string> }
): Promise<{ labels: string[]; identifications: Record<string, string> } | null> {
  const segmentData = segments.map((s, i) => ({
    i,
    s: s.speaker,
    t: s.text,
  }));

  const userPrompt = buildUserPrompt(segmentData, speakerHint, recordingType, batchContext);

  const maxTokens = Math.min(32000, Math.max(8192, segments.length * 20 + 2000));
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

  return parseResponse(content, segments.length);
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
    console.log(`[Speaker Refinement] Recording type: ${recordingType} — sending only ${recordingType} section to Claude`);
  } else {
    console.log(`[Speaker Refinement] No recording type specified — sending all sections to Claude`);
  }

  if (segments.length <= SINGLE_CALL_LIMIT) {
    console.log(`[Speaker Refinement] Sending ${segments.length} segments to Claude Opus 4.6 (single call)...`);
    try {
      const result = await refineBatch(segments, speakerHint, systemPrompt, recordingType);
      if (!result) {
        console.log('[Speaker Refinement] Failed to parse response, keeping original labels');
        return segments;
      }

      const idEntries = Object.entries(result.identifications);
      if (idEntries.length > 0) {
        console.log(`[Speaker Refinement] Identified speakers: ${idEntries.map(([from, to]) => `${from} → ${to}`).join(', ')}`);
      } else {
        console.log('[Speaker Refinement] No name-based identifications returned (role labels may still have been assigned)');
      }

      let refined: Segment[];
      if (result.labels.length === 0 && idEntries.length > 0) {
        console.log(`[Speaker Refinement] No per-segment labels — applying identifications map to original labels`);
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

      const uniqueSpeakers = new Set(refined.map(s => s.speaker));
      console.log(`[Speaker Refinement] Refined to ${uniqueSpeakers.size} speaker(s): ${[...uniqueSpeakers].join(', ')}`);
      return refined;
    } catch (err: any) {
      console.error('[Speaker Refinement] Claude Opus 4.6 refinement failed:', err.message);
      return segments;
    }
  }

  const totalBatches = Math.ceil(segments.length / BATCH_SIZE);
  console.log(`[Speaker Refinement] Large transcript (${segments.length} segments) — processing in ${totalBatches} batches of ~${BATCH_SIZE}...`);

  const allLabels: string[] = new Array(segments.length);
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
        t: s.text,
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
      const result = await refineBatch(batchSegments, speakerHint, systemPrompt, recordingType, batchContext);
      if (!result) {
        console.log(`[Speaker Refinement] Batch ${batchNum + 1} failed to parse — applying cumulative identifications as fallback`);
        for (let i = batchStart; i < batchEnd; i++) {
          const originalLabel = segments[i].speaker;
          const mapped = cumulativeIdentifications[originalLabel];
          allLabels[i] = (mapped && mapped.trim().length > 0) ? mapped.trim() : originalLabel;
        }
      } else {
        Object.assign(cumulativeIdentifications, result.identifications);

        if (result.labels.length === 0 && Object.keys(result.identifications).length > 0) {
          console.log(`[Speaker Refinement] Batch ${batchNum + 1}: no per-segment labels — applying identifications map`);
          for (let i = batchStart; i < batchEnd; i++) {
            const originalLabel = segments[i].speaker;
            const mapped = result.identifications[originalLabel] || cumulativeIdentifications[originalLabel];
            allLabels[i] = (mapped && mapped.trim().length > 0) ? mapped.trim() : originalLabel;
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

    for (let i = 0; i < allLabels.length; i++) {
      if (reverseMap[allLabels[i]]) {
        allLabels[i] = reverseMap[allLabels[i]];
      }
    }
  }

  const refined = segments.map((seg, i) => ({
    ...seg,
    speaker: allLabels[i] || seg.speaker,
  }));

  const uniqueSpeakers = new Set(refined.map(s => s.speaker));
  console.log(`[Speaker Refinement] Refined to ${uniqueSpeakers.size} speaker(s) across ${totalBatches} batches: ${[...uniqueSpeakers].join(', ')}`);

  return refined;
}
