import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { XIcon, PlayIcon, PauseIcon } from 'lucide-react';
import { useTranscripts } from '../hooks/useTranscripts';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
export function PresentModePage() {
  const { id } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const { transcripts } = useTranscripts();
  const containerRef = useRef<HTMLDivElement>(null);
  const transcript = transcripts.find((t) => t.id === id);
  const { isPlaying, currentTime, togglePlayPause } = useAudioPlayer(
    transcript?.duration || 0
  );
  // Handle Escape key to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate(`/transcript/${id}`);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [id, navigate]);
  // Auto-scroll logic
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return;
    const activeElement = containerRef.current.querySelector(
      '[data-active="true"]'
    );
    if (activeElement) {
      activeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentTime, isPlaying]);
  if (!transcript) return null;
  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-200 z-50 flex flex-col h-screen overflow-hidden font-sans">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-6 bg-slate-950/80 backdrop-blur-sm absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlayPause}
            className="h-12 w-12 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 transition-colors">

            {isPlaying ?
            <PauseIcon className="h-6 w-6" /> :

            <PlayIcon className="h-6 w-6 ml-1" />
            }
          </button>
          <div>
            <h1 className="text-xl font-semibold text-white">
              {transcript.filename}
            </h1>
            <p className="text-sm text-slate-400">
              Courtroom Presentation Mode
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate(`/transcript/${id}`)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors">

          <XIcon className="h-5 w-5" />
          Exit (Esc)
        </button>
      </div>

      {/* Transcript Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto pt-32 pb-32 px-8 md:px-24 lg:px-48 scroll-smooth">

        <div className="max-w-4xl mx-auto space-y-12">
          {transcript.segments.map((segment) => {
            const isActive =
            currentTime >= segment.startTime && currentTime < segment.endTime;
            return (
              <div
                key={segment.id}
                data-active={isActive}
                className={`transition-all duration-500 ${isActive ? 'opacity-100 scale-100' : 'opacity-40 scale-95'}`}>

                <div className="flex items-baseline gap-4 mb-2">
                  <span
                    className={`text-lg font-bold tracking-wider ${isActive ? 'text-indigo-400' : 'text-slate-500'}`}>

                    {segment.speaker}
                  </span>
                </div>
                <p
                  className={`text-3xl md:text-4xl leading-relaxed font-medium ${isActive ? 'text-white' : 'text-slate-300'}`}>

                  {segment.text}
                </p>
              </div>);

          })}
        </div>
      </div>

      {/* Bottom Gradient for fade effect */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
    </div>);

}