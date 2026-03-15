import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

const recordingTypes = ['deposition', 'court_hearing', 'recorded_statement', 'police_interrogation', 'other'] as const;
const practiceAreas = ['personal_injury', 'family_law', 'criminal_defense', 'workers_comp', 'insurance_defense', 'employment_law', 'medical_malpractice', 'real_estate', 'immigration', 'general_litigation'] as const;

export const presignedUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  contentType: z.string().min(1, 'Content type is required'),
  fileSize: z.coerce.number().positive().optional(),
});

export const confirmUploadSchema = z.object({
  uploadToken: z.string().min(1, 'Upload token is required'),
  description: z.string().optional().default(''),
  folderId: z.string().optional().nullable(),
  expectedSpeakers: z.coerce.number().int().min(2).max(10).optional().nullable(),
  recordingType: z.enum(recordingTypes).optional().nullable(),
  practiceArea: z.enum(practiceAreas).optional().nullable(),
});

export const initiateMultipartSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  contentType: z.string().min(1, 'Content type is required'),
  fileSize: z.coerce.number().positive('File size must be positive'),
});

export const presignPartSchema = z.object({
  uploadToken: z.string().min(1, 'Upload token is required'),
  partNumber: z.coerce.number().int().min(1).max(10000),
});

export const presignBatchSchema = z.object({
  uploadToken: z.string().min(1, 'Upload token is required'),
  partNumbers: z.array(z.coerce.number().int().min(1).max(10000)).min(1),
});

export const completeMultipartSchema = z.object({
  uploadToken: z.string().min(1, 'Upload token is required'),
  parts: z.array(z.object({
    PartNumber: z.coerce.number().int().min(1),
    ETag: z.string().min(1),
  })).min(1),
});

export const abortMultipartSchema = z.object({
  uploadToken: z.string().min(1, 'Upload token is required'),
});

export const updateTranscriptSchema = z.object({
  filename: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  folderId: z.string().optional().nullable(),
  segments: z.array(z.object({
    startTime: z.coerce.number(),
    endTime: z.coerce.number(),
    speaker: z.string(),
    text: z.string(),
  })).optional(),
  speakers: z.record(z.string(), z.string()).optional(),
});

export const deleteTranscriptsSchema = z.object({
  ids: z.array(z.string()).min(1, 'At least one transcript ID is required'),
});

export const summarizeSchema = z.object({
  agentType: z.string().min(1, 'Agent type is required'),
  subType: z.string().optional(),
  customDescription: z.string().optional(),
});

export const mergeSpeakerSchema = z.object({
  fromSpeaker: z.string().min(1, 'From speaker is required'),
  toSpeaker: z.string().min(1, 'To speaker is required'),
});

export const createVersionSchema = z.object({
  changeDescription: z.string().optional().default(''),
});

export const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required'),
  caseNumber: z.string().optional().nullable(),
  parentId: z.string().uuid('Invalid parent folder ID').optional().nullable(),
  mattrmindrCaseId: z.string().optional().nullable(),
  mattrmindrCaseName: z.string().optional().nullable(),
});

export const updateFolderSchema = z.object({
  name: z.string().min(1).optional(),
  caseNumber: z.string().optional().nullable(),
});

export const moveTranscriptsSchema = z.object({
  transcriptIds: z.array(z.string().uuid('Invalid transcript ID')).min(1, 'At least one transcript ID is required'),
  folderId: z.string().uuid('Invalid folder ID').nullable(),
});

export const mattrmindrConnectSchema = z.object({
  baseUrl: z.string().min(1, 'Base URL is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const mattrmindrSendConfirmSchema = z.object({
  replaceFileIds: z.record(z.string(), z.string()).optional(),
});

export const mattrmindrSendTranscriptSchema = z.object({
  caseId: z.string().min(1, 'Case ID is required'),
  caseName: z.string().optional(),
});

export const externalAuthSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const externalReceiveSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  fileUrl: z.string().url('Invalid file URL'),
  contentType: z.string().optional(),
  fileSize: z.coerce.number().positive().optional(),
  description: z.string().optional(),
  caseId: z.string().optional(),
  caseName: z.string().optional(),
  expectedSpeakers: z.coerce.number().int().min(2).max(10).optional(),
});

export const mediaTokenSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
});

export const legacyUploadMetadataSchema = z.object({
  description: z.string().optional().default(''),
  folderId: z.string().optional().nullable(),
  expectedSpeakers: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(2).max(10)).optional().nullable(),
  recordingType: z.enum(recordingTypes).optional().nullable(),
  practiceArea: z.enum(practiceAreas).optional().nullable(),
}).passthrough();

export const mattrmindrCasesQuerySchema = z.object({
  q: z.string().optional().default(''),
});

export const transcriptListQuerySchema = z.object({
  folderId: z.string().uuid('Invalid folder ID').optional(),
  status: z.string().optional(),
});
