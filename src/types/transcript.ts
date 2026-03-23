export interface PipelineStepLog {
  status: 'pending' | 'success' | 'error' | 'skipped' | 'processing';
  error?: string;
  reason?: string;
  segments?: number;
  chunks?: number;
  utterances?: number;
  speakersDetected?: number;
  speakersAfterRefinement?: number;
  productionUuid?: string;
  durationSeconds?: number;
}

export interface PipelineLog {
  auphonic?: PipelineStepLog;
  whisper: PipelineStepLog;
  diarization: PipelineStepLog;
  refinement: PipelineStepLog;
  startedAt?: string;
  completedAt?: string;
  fatalError?: string;
}

export interface Transcript {
  id: string;
  filename: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  type: 'audio' | 'video';
  duration: number; // seconds
  fileSize: number; // bytes
  fileUrl: string;
  createdAt: string;
  updatedAt: string;
  folderId: string | null;
  recordingType?: string | null;
  practiceArea?: string | null;
  segments: TranscriptSegment[];
  versions: TranscriptVersion[];
  pipelineLog?: PipelineLog | null;
}

export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
}

export interface TranscriptVersion {
  id: string;
  createdAt: string;
  segments: TranscriptSegment[];
  changeDescription: string;
}

export interface TranscriptAnnotation {
  id: string;
  type: 'note' | 'bookmark';
  segmentId: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Folder {
  id: string;
  name: string;
  caseNumber: string;
  parentId: string | null;
  mattrmindrCaseId?: string | null;
  mattrmindrCaseName?: string | null;
}

export interface UploadEntry {
  id: string;
  filename: string;
  progress: number;
  status: 'uploading' | 'complete' | 'error';
  errorMessage?: string;
}