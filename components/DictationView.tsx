import React, { useState, useRef, useEffect } from 'react';
import { Article, DictationCorrection } from '../types';
import { checkDictation, generateSpeech } from '../services/geminiService';
import { Play, Pause, CheckCircle, ArrowRight, Loader2, RotateCcw, Plus, RefreshCw, Lightbulb, X } from 'lucide-react';
import { ToastType } from './Toast';

interface SegmentPlayerProps {
  text: string;
  index: number;
  label: string;
  audioContext: AudioContext | null;
  isActive: boolean;
  onActivate: () => void;
}

const SegmentPlayer: React.FC<SegmentPlayerProps> = ({ text, index, label, audioContext, isActive, onActivate }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // Refs for playback control
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeSourceStartTimeRef = useRef(0);
  const playedBufferDurationRef = useRef(0);
  const rafRef = useRef<number>();
  const isDraggingRef = useRef(false);

  // Stop playback if another segment activates
  useEffect(() => {
    if (!isActive && isPlaying) {
      pauseAudio();
    }
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const fetchAudio = async () => {
    if (audioBuffer) return audioBuffer;
    setIsLoading(true);
    try {
      const buffer = await generateSpeech(text);
      setAudioBuffer(buffer);
      setDuration(buffer.duration);
      return buffer;
    } catch (e) {
      console.error("Failed to generate speech", e);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = async () => {
    if (!audioContext) return;
    onActivate(); // Notify parent to stop others

    const buffer = await fetchAudio();
    if (!buffer) return;

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.connect(audioContext.destination);
    
    // Start playing from stored buffer offset
    const offset = playedBufferDurationRef.current % buffer.duration;
    source.start(0, offset);
    
    sourceRef.current = source;
    activeSourceStartTimeRef.current = audioContext.currentTime;
    setIsPlaying(true);

    source.onended = () => {
      // Only reset if it finished naturally (not stopped by code)
      if (sourceRef.current === source) {
         setIsPlaying(false);
         playedBufferDurationRef.current = 0;
         setProgress(0);
      }
    };

    // Start Animation Loop
    const updateProgress = () => {
      if (sourceRef.current && !isDraggingRef.current && audioContext) {
        const now = audioContext.currentTime;
        const elapsedReal = now - activeSourceStartTimeRef.current;
        const elapsedBuffer = playedBufferDurationRef.current + (elapsedReal * playbackRate);
        
        const p = Math.min((elapsedBuffer / buffer.duration) * 100, 100);
        setProgress(p);
        
        if (elapsedBuffer < buffer.duration) {
          rafRef.current = requestAnimationFrame(updateProgress);
        }
      }
    };
    rafRef.current = requestAnimationFrame(updateProgress);
  };

  const pauseAudio = () => {
    if (sourceRef.current && audioContext) {
      const now = audioContext.currentTime;
      const elapsedReal = now - activeSourceStartTimeRef.current;
      playedBufferDurationRef.current += (elapsedReal * playbackRate);
      
      sourceRef.current.stop();
      sourceRef.current = null;
      setIsPlaying(false);
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const stopAudio = () => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    setIsPlaying(false);
    playedBufferDurationRef.current = 0;
    setProgress(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const togglePlay = () => {
    if (isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  };

  const cycleSpeed = () => {
    const rates = [0.5, 0.8, 1.0];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const newRate = rates[nextIdx];
    
    // Apply speed change on the fly
    if (isPlaying && sourceRef.current && audioContext) {
        const now = audioContext.currentTime;
        const elapsedReal = now - activeSourceStartTimeRef.current;
        playedBufferDurationRef.current += (elapsedReal * playbackRate); // Commit processed duration
        activeSourceStartTimeRef.current = now; // Reset start time
        sourceRef.current.playbackRate.setValueAtTime(newRate, now);
    }
    
    setPlaybackRate(newRate);
  };

  // Seek Logic
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newProgress = parseFloat(e.target.value);
    setProgress(newProgress);
    if (duration > 0) {
        playedBufferDurationRef.current = (newProgress / 100) * duration;
    }
  };

  const handleSeekStart = () => {
    isDraggingRef.current = true;
    if (isPlaying) {
        // Just pause logically
        if (sourceRef.current) {
            sourceRef.current.stop();
            sourceRef.current = null;
        }
        setIsPlaying(false); 
    }
  };

  const handleSeekEnd = () => {
    isDraggingRef.current = false;
    // Resume if was active
    if (isActive) {
        playAudio();
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
        <div className="flex items-center gap-3">
             <button
                onClick={togglePlay}
                disabled={isLoading}
                className={`flex-none w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${
                    isPlaying 
                    ? 'bg-primary text-white' 
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {isLoading ? <RefreshCw size={16} className="animate-spin" /> : isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
              </button>
              
              <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">{label}</span>
                      <div className="flex items-center gap-3">
                          {/* Speed Toggle */}
                          <button 
                            onClick={cycleSpeed}
                            className="text-[10px] font-bold bg-stone-100 px-1.5 py-0.5 rounded hover:bg-stone-200 text-stone-600 w-8 text-center"
                          >
                             {playbackRate}x
                          </button>
                          
                          {duration > 0 && (
                            <span className="text-[10px] font-mono text-stone-400">
                                {formatTime(Math.min(playedBufferDurationRef.current, duration))} / {formatTime(duration)}
                            </span>
                          )}
                      </div>
                  </div>
                  {/* Progress Bar */}
                  <div className="relative h-4 flex items-center">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        value={progress}
                        onChange={handleSeekChange}
                        onMouseDown={handleSeekStart}
                        onMouseUp={handleSeekEnd}
                        onTouchStart={handleSeekStart}
                        onTouchEnd={handleSeekEnd}
                        disabled={!audioBuffer}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                    />
                    <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div 
                           className="h-full bg-primary transition-all duration-100 ease-out"
                           style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                    {/* Thumb (Visual Only) */}
                    <div 
                        className="absolute h-3 w-3 bg-white border-2 border-primary rounded-full shadow-sm pointer-events-none transition-all duration-100 ease-out"
                        style={{ left: `calc(${progress}% - 6px)` }}
                    ></div>
                  </div>
              </div>
        </div>
    </div>
  );
};

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

interface DictationViewProps {
  article: Article;
  onAddWord: (word: string, context: string) => void;
  onFinish: () => void; // Proceed to Recitation
  onBack: () => void;
  showToast: (msg: string, type?: ToastType) => void;
}

export const DictationView: React.FC<DictationViewProps> = ({ article, onAddWord, onFinish, onBack, showToast }) => {
  const segments = Array.isArray(article.content) ? article.content : [{ en: article.content as string, zh: '' }];
  const [inputs, setInputs] = useState<string[]>(new Array(segments.length).fill(''));
  const [results, setResults] = useState<DictationCorrection[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  
  // Shared AudioContext - Use State to trigger re-render and ensure non-null
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);

  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    setAudioCtx(ctx);
    return () => {
        ctx.close();
    };
  }, []);

  const handleCheck = async () => {
    setIsChecking(true);
    // Stop any playing audio
    setActiveSegmentIndex(null);
    try {
      const correctionPromises = segments.map((seg, idx) => 
        checkDictation(seg.en, inputs[idx])
      );
      const data = await Promise.all(correctionPromises);
      setResults(data);
      showToast("Proofreading complete!", "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to check dictation. Please try again.", "error");
    } finally {
      setIsChecking(false);
    }
  };

  const handleInputChange = (index: number, val: string) => {
    const newInputs = [...inputs];
    newInputs[index] = val;
    setInputs(newInputs);
  };

  return (
    <div className="flex flex-col h-full bg-stone-50/50 backdrop-blur-md rounded-[32px] overflow-hidden shadow-glass border border-white/60">
      <div className="flex-none p-6 border-b border-stone-100 flex justify-between items-center bg-white/60">
        <h2 className="text-2xl font-serif font-bold text-stone-800">Dictation Practice</h2>
        <button onClick={onBack} className="text-sm font-bold text-stone-500 hover:text-stone-800">Close</button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
        <p className="text-stone-500 text-sm mb-4">Listen to each segment and type exactly what you hear.</p>

        {segments.map((seg, idx) => (
          <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
            <div className="mb-4">
               <span className="w-6 h-6 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center font-bold text-[10px] mb-2">{idx + 1}</span>
               
               <SegmentPlayer 
                  text={seg.en} 
                  index={idx}
                  label={`Segment ${idx + 1}`}
                  audioContext={audioCtx} // Now passed from state
                  isActive={activeSegmentIndex === idx}
                  onActivate={() => setActiveSegmentIndex(idx)}
               />
            </div>

            {results ? (
              <div className="space-y-4 animate-fade-in">
                {/* Visual Diff */}
                <div className="p-4 bg-stone-50 rounded-xl font-serif leading-loose text-lg"
                     dangerouslySetInnerHTML={{ __html: results[idx].diffHtml }}
                />
                
                {/* Specific Feedback Box */}
                {results[idx].feedback && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex gap-3 text-sm text-amber-900">
                     <Lightbulb className="flex-shrink-0 text-amber-500" size={18} />
                     <p className="leading-relaxed"><span className="font-bold block text-xs uppercase tracking-wide text-amber-500 mb-1">AI Feedback</span>{results[idx].feedback}</p>
                  </div>
                )}

                {/* Corrections List for adding to vocab */}
                {results[idx].corrections.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {results[idx].corrections.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => onAddWord(c.right, seg.en)}
                        className="flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 text-xs rounded-full border border-red-100 hover:bg-red-100 transition-colors"
                        title="Add to Notebook"
                      >
                        <span className="line-through opacity-60">{c.wrong}</span>
                        <ArrowRight size={10} />
                        <span className="font-bold">{c.right}</span>
                        <Plus size={10} className="ml-1" />
                      </button>
                    ))}
                  </div>
                )}
                
                {results[idx].corrections.length === 0 && (
                  <div className="text-emerald-600 text-xs font-bold flex items-center gap-1">
                    <CheckCircle size={14} /> Perfect Match
                  </div>
                )}
              </div>
            ) : (
              <textarea
                value={inputs[idx]}
                onChange={(e) => handleInputChange(idx, e.target.value)}
                placeholder="Type what you hear..."
                className="w-full p-4 rounded-xl border border-stone-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-serif resize-none bg-stone-50/50"
                rows={3}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex-none p-6 border-t border-stone-100 bg-white/60 backdrop-blur-md flex justify-end gap-3">
        {!results ? (
          <button
            onClick={handleCheck}
            disabled={isChecking}
            className="px-6 py-3 rounded-xl bg-primary text-white font-bold shadow-lg hover:shadow-primary/30 transform hover:-translate-y-0.5 transition-all flex items-center gap-2"
          >
            {isChecking ? <Loader2 className="animate-spin" /> : <CheckCircle size={20} />}
            Proofread
          </button>
        ) : (
          <>
            <button
              onClick={() => { setResults(null); }}
              className="px-6 py-3 rounded-xl text-stone-600 font-bold hover:bg-stone-100 transition-all flex items-center gap-2"
            >
              <RotateCcw size={18} /> Retry
            </button>
            <button
              onClick={onFinish}
              className="px-6 py-3 rounded-xl bg-stone-900 text-white font-bold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all flex items-center gap-2"
            >
              Next: Recitation <ArrowRight size={20} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};