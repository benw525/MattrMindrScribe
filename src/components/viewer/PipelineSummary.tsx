import React, { useState } from 'react';
import { CheckCircle2Icon, XCircleIcon, AlertTriangleIcon, ClockIcon, RefreshCwIcon, XIcon, CpuIcon, MicIcon, BrainCircuitIcon, Volume2Icon, LoaderIcon } from 'lucide-react';
import { PipelineLog, PipelineStepLog } from '../../types/transcript';
import { api } from '../../utils/api';
import { toast } from 'sonner';

interface PipelineSummaryProps {
  pipelineLog: PipelineLog | null | undefined;
  transcriptStatus: string;
  errorMessage?: string | null;
  transcriptId: string;
  onClose: () => void;
  onRetranscribeStarted?: () => void;
}

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle2Icon className="h-5 w-5 text-emerald-500 flex-shrink-0" />;
    case 'error':
      return <XCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />;
    case 'skipped':
      return <AlertTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0" />;
    case 'processing':
      return <LoaderIcon className="h-5 w-5 text-indigo-500 flex-shrink-0 animate-spin" />;
    case 'pending':
      return <ClockIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />;
    default:
      return <ClockIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />;
  }
}

function StepCard({ title, icon, step, description }: { title: string; icon: React.ReactNode; step: PipelineStepLog; description: string }) {
  return (
    <div className={`rounded-lg border p-3 ${
      step.status === 'error' ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20' :
      step.status === 'success' ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20' :
      step.status === 'skipped' ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20' :
      step.status === 'processing' ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20' :
      'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50'
    }`}>
      <div className="flex items-start gap-3">
        <StepStatusIcon status={step.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {icon}
            <span className="font-medium text-sm text-slate-900 dark:text-white">{title}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
          {step.status === 'success' && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {step.segments !== undefined && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">{step.segments} segments transcribed</span>
              )}
              {step.chunks !== undefined && step.chunks > 1 && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">{step.chunks} audio chunks</span>
              )}
              {step.utterances !== undefined && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">{step.utterances} utterances detected</span>
              )}
              {step.speakersDetected !== undefined && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">{step.speakersDetected} speakers identified</span>
              )}
              {step.speakersAfterRefinement !== undefined && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">{step.speakersAfterRefinement} speakers confirmed</span>
              )}
              {step.durationSeconds !== undefined && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">{Math.round(step.durationSeconds)}s processing time</span>
              )}
            </div>
          )}
          {step.status === 'error' && step.error && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded px-2 py-1">
              {step.error}
            </p>
          )}
          {step.status === 'skipped' && step.reason && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              {step.reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PipelineSummary({ pipelineLog, transcriptStatus, errorMessage, transcriptId, onClose, onRetranscribeStarted }: PipelineSummaryProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const hasAnyFailure = pipelineLog && (
    pipelineLog.whisper.status === 'error' ||
    pipelineLog.diarization.status === 'error' ||
    pipelineLog.refinement.status === 'error' ||
    pipelineLog.fatalError
  );

  const showRetryButton = transcriptStatus === 'error' || hasAnyFailure;

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await api.transcripts.retranscribe(transcriptId);
      toast.success('Retranscription started');
      onRetranscribeStarted?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to start retranscription');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-md overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Transcription Pipeline
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1">
          {!pipelineLog ? (
            <div className="text-center py-6">
              <ClockIcon className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {transcriptStatus === 'pending' ? 'Transcription has not started yet.' :
                 transcriptStatus === 'processing' ? 'Transcription is currently in progress...' :
                 'No pipeline data available for this transcript.'}
              </p>
            </div>
          ) : (
            <>
              {pipelineLog.auphonic && (
                <StepCard
                  title="Auphonic Audio Cleanup"
                  icon={<Volume2Icon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />}
                  step={pipelineLog.auphonic}
                  description="Noise reduction, leveling & audio enhancement"
                />
              )}

              <StepCard
                title="OpenAI Whisper"
                icon={<CpuIcon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />}
                step={pipelineLog.whisper}
                description="Speech-to-text transcription with timestamps"
              />

              <StepCard
                title="AssemblyAI Diarization"
                icon={<MicIcon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />}
                step={pipelineLog.diarization}
                description="Speaker identification from audio analysis"
              />

              <StepCard
                title="Claude Opus 4.6 Refinement"
                icon={<BrainCircuitIcon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />}
                step={pipelineLog.refinement}
                description="AI-powered speaker identification & label correction"
              />

              {pipelineLog.fatalError && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">Fatal Error</p>
                  <p className="text-xs text-red-600 dark:text-red-400">{pipelineLog.fatalError}</p>
                </div>
              )}

              {pipelineLog.startedAt && pipelineLog.completedAt && (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-1">
                  Processed in {Math.round((new Date(pipelineLog.completedAt).getTime() - new Date(pipelineLog.startedAt).getTime()) / 1000)}s
                </p>
              )}
            </>
          )}

          {transcriptStatus === 'error' && errorMessage && !pipelineLog?.fatalError && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
              <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">Error</p>
              <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
            </div>
          )}
        </div>

        {showRetryButton && (
          <div className="px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 rounded-lg transition-colors shadow-sm">
              <RefreshCwIcon className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Starting...' : 'Retry Transcription'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
