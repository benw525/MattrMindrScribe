export interface PipelineStepLog {
  status: 'pending' | 'success' | 'error' | 'skipped';
  error?: string;
  reason?: string;
  segments?: number;
  chunks?: number;
  utterances?: number;
  speakersDetected?: number;
  speakersAfterRefinement?: number;
}

export interface PipelineLog {
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

export interface Folder {
  id: string;
  name: string;
  caseNumber: string;
  parentId: string | null;
}

export interface UploadEntry {
  id: string;
  filename: string;
  progress: number;
  status: 'uploading' | 'complete' | 'error';
  errorMessage?: string;
}