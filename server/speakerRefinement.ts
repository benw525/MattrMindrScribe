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

const SINGLE_CALL_LIMIT = 2000;
const BATCH_SIZE = 1500;
const OVERLAP_CONTEXT = 20;

function buildSystemPrompt(): string {
  return `You are an expert legal transcript analyst with deep expertise in speaker identification across all types of legal recordings — depositions, court hearings, recorded statements, police interrogations, and informal recordings. You understand the structure, roles, and conversational patterns unique to each type of legal proceeding.

Your response must be valid JSON with two fields:
- "labels": an array of speaker labels (one per segment, in order)
- "identifications": an object mapping generic labels to identified names/roles (only for 75%+ confidence identifications)`;
}

function buildUserPrompt(
  segmentData: { i: number; s: string; t: string }[],
  speakerHint: string,
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

  return `${batchPreamble}Below is a transcript with preliminary speaker labels. You have two tasks:

**Task 1: Correct speaker labels**
Review the conversational flow and correct any speaker misattributions. ${speakerHint}
- Preserve the original speaker label if it seems correct
- Look for conversational cues: questions followed by answers likely indicate speaker changes
- Do NOT merge speakers that are clearly different people
- Do NOT split a single speaker into multiple speakers unless there's strong evidence

**Task 2: Identify speaker names and roles**
First, determine what type of recording this is from contextual clues, then use the appropriate section below to identify speakers. If the type is unclear, consider all sections.

==============================
SECTION A: DEPOSITION
==============================
Depositions typically have a formal opening/closing by a videographer and/or court reporter, with structured Q&A between attorneys and a witness.

**Potential speakers & identification patterns:**

**Videographer:**
- Opens with "This begins the video deposition of [deponent name]..." or "We are now on the record..."
- Closes with "This concludes the video deposition of [deponent name]..." or "We are now off the record..."
- Announces time, date, and location at the start
- May call for breaks: "Going off the record at [time]"
- Label as "Videographer" or by name if identifiable

**Court Reporter:**
- Administers the oath: "Do you solemnly swear..." or "Do you, [name], swear to tell the truth..."
- Asks about "usual stipulations" or "standard stipulations"
- May ask speakers to slow down or speak up for the record
- May request spelling of names or technical terms
- Label as "Court Reporter" or by name if identifiable

**Examining Attorney (Questioning Attorney):**
- Asks most of the questions during the deposition
- May introduce themselves: "My name is..." or "[Name] on behalf of [party]..."
- Directs the witness: "Could you state your name for the record?"
- Uses formal question patterns: "Isn't it true that...", "Would you agree that..."
- Label by name if identifiable (e.g. "Attorney Smith"), otherwise "Examining Attorney"

**Deponent/Witness:**
- The person being questioned — provides answers
- Often named in the videographer's opening: "video deposition of [name]"
- Named during the oath: "Do you, [name], swear to..."
- Answers tend to be responsive to questions
- Label by name if identifiable (e.g. "Barry Porter"), otherwise "The Witness"

**Defending Attorney:**
- Makes objections: "Objection", "Objection, form", "Objection, leading", "Objection, asked and answered"
- May instruct the witness not to answer
- May introduce themselves: "on behalf of the defendant" or "representing [party]"
- Speaks less frequently, primarily during objections or cross-examination
- Label by name if identifiable, otherwise "Defending Attorney"

**Other Attorneys:**
- Additional counsel may be present for other parties
- May state appearances at the beginning
- May make their own objections
- Label by name and party if identifiable

==============================
SECTION B: COURT HEARING
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
- Label as "Court Reporter"

==============================
SECTION C: RECORDED STATEMENT
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
- Label as "Interpreter"

==============================
SECTION D: POLICE INTERROGATION
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
- Label as "Interpreter"

==============================
SECTION E: OTHER RECORDINGS
==============================
This section covers informal or situational recordings that don't fit neatly into the above categories. These may include witness statements, settlement negotiations, client communications, body camera footage, scene recordings, voice memos, and other field recordings. The structure may be loose or nonexistent.

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
- Environmental cues (radio chatter = law enforcement, medical terminology = healthcare setting)

==============================
GENERAL RULES (ALL RECORDING TYPES)
==============================

**Name assignment rules:**
- Only assign a name when you are at least 75% confident in the identification
- If you cannot confidently identify a speaker, keep their generic label (e.g. "Speaker 1")
- Use the most formal/complete version of the name when possible (e.g. "Barry Porter" not just "Barry")
- For roles without names, use the role (e.g. "Court Reporter", "Videographer", "Detective")
- It is perfectly fine to leave some or all speakers unnamed — only name those you are confident about
- For multiple unidentified speakers of the same type, number them (e.g. "Bystander 1", "Bystander 2")

**Cross-type identification cues:**
- Self-introductions: "My name is...", "I'm...", "This is..."
- Direct address: "Mr. Smith", "Ms. Johnson", "Your Honor", "Detective", "Officer"
- Role references: "counsel for the plaintiff", "the witness", "my client"
- Institutional phrases: "for the record", "let the record reflect", "on the record"

**Example response:**
{
  "labels": ["Videographer", "Court Reporter", "Attorney Smith", "Barry Porter", "Attorney Smith", "Barry Porter"],
  "identifications": {"Speaker 1": "Videographer", "Speaker 2": "Court Reporter", "Speaker 3": "Attorney Smith", "Speaker 4": "Barry Porter"}
}

Transcript segments:
${JSON.stringify(segmentData)}`;
}

function parseResponse(content: string, expectedCount: number): { labels: string[]; identifications: Record<string, string> } | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    console.log('[Speaker Refinement] Failed to parse JSON from response');
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
      return null;
    }
  }

  if (labels.length !== expectedCount) return null;

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
  batchContext?: { batchNumber: number; totalBatches: number; contextSegments?: { i: number; s: string; t: string }[]; priorIdentifications?: Record<string, string> }
): Promise<{ labels: string[]; identifications: Record<string, string> } | null> {
  const segmentData = segments.map((s, i) => ({
    i,
    s: s.speaker,
    t: s.text,
  }));

  const userPrompt = buildUserPrompt(segmentData, speakerHint, batchContext);

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-20250514',
    max_tokens: 8192,
    temperature: 0.1,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const content = textBlock?.text;
  if (!content) return null;

  return parseResponse(content, segments.length);
}

export async function refineSpeakersWithGPT(
  segments: Segment[],
  expectedSpeakers?: number | null
): Promise<Segment[]> {
  if (segments.length === 0) return segments;

  const speakerHint = expectedSpeakers
    ? `The recording is expected to have ${expectedSpeakers} speakers.`
    : 'Determine the correct number of speakers from context.';

  const systemPrompt = buildSystemPrompt();

  if (segments.length <= SINGLE_CALL_LIMIT) {
    console.log(`[Speaker Refinement] Sending ${segments.length} segments to Claude Opus 4.6 (single call)...`);
    try {
      const result = await refineBatch(segments, speakerHint, systemPrompt);
      if (!result) {
        console.log('[Speaker Refinement] Failed to parse response, keeping original labels');
        return segments;
      }

      const idEntries = Object.entries(result.identifications);
      if (idEntries.length > 0) {
        console.log(`[Speaker Refinement] Identified speakers: ${idEntries.map(([from, to]) => `${from} → ${to}`).join(', ')}`);
      } else {
        console.log('[Speaker Refinement] No speakers could be confidently identified by name');
      }

      const refined = segments.map((seg, i) => {
        const label = result.labels[i];
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
      const result = await refineBatch(batchSegments, speakerHint, systemPrompt, batchContext);
      if (!result) {
        console.log(`[Speaker Refinement] Batch ${batchNum + 1} failed to parse, keeping original labels for this batch`);
        for (let i = batchStart; i < batchEnd; i++) {
          allLabels[i] = segments[i].speaker;
        }
      } else {
        for (let i = 0; i < result.labels.length; i++) {
          const label = result.labels[i];
          allLabels[batchStart + i] = (typeof label === 'string' && label.trim().length > 0) ? label.trim() : segments[batchStart + i].speaker;
        }
        Object.assign(cumulativeIdentifications, result.identifications);

        const batchSpeakers = new Set(result.labels.map(l => l.trim()).filter(l => l.length > 0));
        console.log(`[Speaker Refinement] Batch ${batchNum + 1} speakers: ${[...batchSpeakers].join(', ')}`);
      }
      processedUpTo = batchEnd;
    } catch (err: any) {
      console.error(`[Speaker Refinement] Batch ${batchNum + 1} failed:`, err.message);
      for (let i = batchStart; i < batchEnd; i++) {
        allLabels[i] = segments[i].speaker;
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
