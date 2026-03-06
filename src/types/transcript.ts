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