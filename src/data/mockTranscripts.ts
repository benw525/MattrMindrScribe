import { Transcript, Folder } from '../types/transcript';

export const mockFolders: Folder[] = [
{
  id: 'f1',
  name: 'Smith v. Johnson',
  caseNumber: '2024-1234',
  parentId: null
},
{
  id: 'f2',
  name: 'Martinez Estate',
  caseNumber: '2024-5678',
  parentId: null
},
{ id: 'f3', name: 'General', caseNumber: 'GEN-0000', parentId: null }];


const now = new Date();
const twoDaysAgo = new Date(
  now.getTime() - 2 * 24 * 60 * 60 * 1000
).toISOString();
const oneWeekAgo = new Date(
  now.getTime() - 7 * 24 * 60 * 60 * 1000
).toISOString();

export const mockTranscripts: Transcript[] = [
{
  id: 't1',
  filename: 'Deposition - Smith v. Johnson',
  description:
  'Initial deposition of the primary witness regarding the events of October 12th.',
  status: 'completed',
  type: 'video',
  duration: 2700, // 45 min
  fileSize: 1024 * 1024 * 450, // 450 MB
  fileUrl: '/mock-video.mp4',
  createdAt: oneWeekAgo,
  updatedAt: oneWeekAgo,
  folderId: 'f1',
  versions: [
  {
    id: 'v1',
    createdAt: oneWeekAgo,
    changeDescription: 'Original AI Transcription',
    segments: [] // Omitted for brevity in mock, usually holds the original state
  }],

  segments: [
  {
    id: 's1',
    startTime: 0,
    endTime: 15,
    speaker: 'ATTORNEY WILLIAMS',
    text: 'Please state your full name for the record.'
  },
  {
    id: 's2',
    startTime: 16,
    endTime: 20,
    speaker: 'WITNESS SMITH',
    text: 'Johnathan Edward Smith.'
  },
  {
    id: 's3',
    startTime: 21,
    endTime: 35,
    speaker: 'ATTORNEY WILLIAMS',
    text: 'Mr. Smith, can you describe your whereabouts on the evening of October 12th, approximately 8:00 PM?'
  },
  {
    id: 's4',
    startTime: 36,
    endTime: 55,
    speaker: 'WITNESS SMITH',
    text: 'I was at home. I had just finished dinner and was watching television in the living room.'
  },
  {
    id: 's5',
    startTime: 56,
    endTime: 70,
    speaker: 'ATTORNEY WILLIAMS',
    text: 'Did anyone else come to the house that evening?'
  },
  {
    id: 's6',
    startTime: 71,
    endTime: 85,
    speaker: 'WITNESS SMITH',
    text: 'No, I was alone the entire night.'
  }]

},
{
  id: 't2',
  filename: 'Voicemail from Client',
  description: 'Client asking about the upcoming hearing schedule.',
  status: 'completed',
  type: 'audio',
  duration: 120, // 2 min
  fileSize: 1024 * 1024 * 2, // 2 MB
  fileUrl: '/mock-audio.mp3',
  createdAt: twoDaysAgo,
  updatedAt: twoDaysAgo,
  folderId: 'f3',
  versions: [],
  segments: [
  {
    id: 's1',
    startTime: 0,
    endTime: 15,
    speaker: 'UNKNOWN CALLER',
    text: 'Hi, this is Sarah. I am just calling to confirm the time for the hearing next Tuesday.'
  },
  {
    id: 's2',
    startTime: 16,
    endTime: 30,
    speaker: 'UNKNOWN CALLER',
    text: 'Please call me back when you get a chance. My number is 555-0192. Thanks.'
  }]

},
{
  id: 't3',
  filename: 'Witness Interview - Martinez',
  description: 'Field interview with neighbor.',
  status: 'processing',
  type: 'audio',
  duration: 900, // 15 min
  fileSize: 1024 * 1024 * 15, // 15 MB
  fileUrl: '/mock-audio.mp3',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  folderId: 'f2',
  versions: [],
  segments: []
},
{
  id: 't4',
  filename: 'Court Hearing Recording',
  description: 'Motion to dismiss hearing.',
  status: 'completed',
  type: 'video',
  duration: 4800, // 1hr 20min
  fileSize: 1024 * 1024 * 850, // 850 MB
  fileUrl: '/mock-video.mp4',
  createdAt: oneWeekAgo,
  updatedAt: oneWeekAgo,
  folderId: 'f1',
  versions: [],
  segments: [
  {
    id: 's1',
    startTime: 0,
    endTime: 25,
    speaker: 'THE COURT',
    text: 'Court is now in session. We are here for the motion to dismiss in Smith v. Johnson. Counsel, are you ready to proceed?'
  },
  {
    id: 's2',
    startTime: 26,
    endTime: 40,
    speaker: 'ATTORNEY DAVIS',
    text: 'Yes, Your Honor. The defense is ready.'
  },
  {
    id: 's3',
    startTime: 41,
    endTime: 50,
    speaker: 'ATTORNEY WILLIAMS',
    text: 'The plaintiff is ready, Your Honor.'
  },
  {
    id: 's4',
    startTime: 51,
    endTime: 120,
    speaker: 'THE COURT',
    text: 'Very well. Mr. Davis, you may begin your argument.'
  }]

},
{
  id: 't5',
  filename: 'Expert Testimony - Dr. Chen',
  description: 'Medical expert analysis.',
  status: 'pending',
  type: 'audio',
  duration: 3600, // 1 hr
  fileSize: 1024 * 1024 * 45, // 45 MB
  fileUrl: '/mock-audio.mp3',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  folderId: 'f1',
  versions: [],
  segments: []
},
{
  id: 't6',
  filename: 'Settlement Conference Call',
  description: 'Negotiation call with opposing counsel.',
  status: 'completed',
  type: 'audio',
  duration: 2100, // 35 min
  fileSize: 1024 * 1024 * 25, // 25 MB
  fileUrl: '/mock-audio.mp3',
  createdAt: twoDaysAgo,
  updatedAt: twoDaysAgo,
  folderId: 'f1',
  versions: [],
  segments: [
  {
    id: 's1',
    startTime: 0,
    endTime: 30,
    speaker: 'ATTORNEY WILLIAMS',
    text: "We received your initial offer, but frankly, it does not cover our client's medical expenses."
  },
  {
    id: 's2',
    startTime: 31,
    endTime: 60,
    speaker: 'ATTORNEY DAVIS',
    text: 'We believe the offer is fair given the shared liability established in the police report.'
  }]

},
{
  id: 't7',
  filename: 'Police Body Cam Footage',
  description: 'Arrest footage.',
  status: 'error',
  type: 'video',
  duration: 600, // 10 min
  fileSize: 1024 * 1024 * 120, // 120 MB
  fileUrl: '/mock-video.mp4',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  folderId: 'f2',
  versions: [],
  segments: []
},
{
  id: 't8',
  filename: 'Client Meeting Notes',
  description: 'Dictation of meeting notes.',
  status: 'completed',
  type: 'audio',
  duration: 900, // 15 min
  fileSize: 1024 * 1024 * 10, // 10 MB
  fileUrl: '/mock-audio.mp3',
  createdAt: oneWeekAgo,
  updatedAt: oneWeekAgo,
  folderId: 'f3',
  versions: [],
  segments: [
  {
    id: 's1',
    startTime: 0,
    endTime: 45,
    speaker: 'ATTORNEY WILLIAMS',
    text: 'Meeting with Mr. Martinez. He provided the requested financial documents. Need to review the tax returns from 2022 before the next filing.'
  }]

}];