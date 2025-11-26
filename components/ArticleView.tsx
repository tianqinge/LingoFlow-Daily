import React, { useState, useEffect, useRef } from 'react';
import { Article, ArticleSegment, ArticleStatus, SpeakingEvaluation } from '../types';
import { generateSpeech, analyzeSegment, evaluateSpeakingSegment, lookupVocabulary } from '../services/geminiService';
import { Play, Pause, RefreshCw, Plus, Mic, Square, Eye, EyeOff, Languages, Sparkles, Loader2, X, ChevronDown, PenTool, BookOpen, Lock, CheckCircle2, Stethoscope, AlertCircle, Volume2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { DictationView } from './DictationView';
import { RecitationView } from './RecitationView';
import { ToastType } from './Toast';

interface ArticleViewProps {
  article: Article;
  onAddWord: (word: string, context: string) => void;
  onCheckIn: () => void;
  hasCheckedIn: boolean;
  onUpdateStatus: (id: string, status: ArticleStatus) => void;
  showToast: (msg: string, type?: ToastType) => void;
}

const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const ArticleView: React.FC<ArticleViewProps> = ({ article, onAddWord, onCheckIn, hasCheckedIn, onUpdateStatus, showToast }) => {
  const getModeFromStatus = (status: ArticleStatus) => {
      if (status === 'dictation') return 'dictation';
      if (status === 'recitation' || status === 'completed') return 'recitation';
      return 'read';
  };

  const [mode, setMode] = useState<'read' | 'dictation' | 'recitation'>(getModeFromStatus(article.status || 'reading'));

  useEffect(() => {
     setMode(getModeFromStatus(article.status || 'reading'));
  }, [article.id, article.status]);

  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const activeSourceStartTimeRef = useRef<number>(0); 
  const playedBufferDurationRef = useRef<number>(0);
  const segmentTimingsRef = useRef<{start: number, end: number}[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const isDraggingProgressRef = useRef(false);

  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [recitationMode, setRecitationMode] = useState(false); 
  const [visibleTranslations, setVisibleTranslations] = useState<Record<number, boolean>>({});
  
  const [analyses, setAnalyses] = useState<Record<number, string | object>>({});
  const [isAnalyzing, setIsAnalyzing] = useState<Record<number, boolean>>({});

  const [recordingSegmentIndex, setRecordingSegmentIndex] = useState<number | null>(null);
  const [segmentRecordings, setSegmentRecordings] = useState<Record<number, { url: string, blob: Blob }>>({});
  const [evaluations, setEvaluations] = useState<Record<number, SpeakingEvaluation>>({});
  const [isEvaluating, setIsEvaluating] = useState<Record<number, boolean>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [selectionMenu, setSelectionMenu] = useState<{ 
    x: number; 
    y: number; 
    word: string; 
    context: string;
    loading: boolean;
    data?: { definition: string, phonetic: string };
  } | null>(null);

  useEffect(() => {
    stopAudio();
    setAudioBuffer(null);
    setSelectionMenu(null);
    playedBufferDurationRef.current = 0;
    setPlaybackRate(1.0);
    setProgress(0);
    setCurrentTime(0);
    setTotalDuration(0);
    setActiveSegmentIndex(null);
    setRecitationMode(false);
    setVisibleTranslations({});
    setAnalyses({});
    setIsAnalyzing({});
    setSegmentRecordings({});
    setEvaluations({});
    setIsEvaluating({});
    setRecordingSegmentIndex(null);
    segmentTimingsRef.current = [];
  }, [article.id]);

  useEffect(() => {
    if (audioBuffer && Array.isArray(article.content)) {
        setTotalDuration(audioBuffer.duration);
        const titleLen = article.title.length + 2; 
        const contentLens = article.content.map(s => s.en.length + 1);
        const totalLen = titleLen + contentLens.reduce((a, b) => a + b, 0);
        const duration = audioBuffer.duration;
        
        let accumulatedLen = titleLen;
        const timings = contentLens.map(len => {
            const start = (accumulatedLen / totalLen) * duration;
            accumulatedLen += len;
            const end = (accumulatedLen / totalLen) * duration;
            return { start, end };
        });
        segmentTimingsRef.current = timings;
    }
  }, [audioBuffer, article]);

  useEffect(() => {
    const update = () => {
      if (isPlaying && audioContextRef.current && sourceNodeRef.current && audioBuffer) {
        const currentTimeCtx = audioContextRef.current.currentTime;
        const elapsedRealTime = currentTimeCtx - activeSourceStartTimeRef.current;
        const elapsedBufferTime = playedBufferDurationRef.current + (elapsedRealTime * playbackRate);
        const duration = audioBuffer.duration;
        
        setCurrentTime(Math.min(elapsedBufferTime, duration));

        if (!isDraggingProgressRef.current) {
             const p = Math.min((elapsedBufferTime / duration) * 100, 100);
             setProgress(p);
        }

        if (segmentTimingsRef.current.length > 0) {
            const currentIdx = segmentTimingsRef.current.findIndex(t => elapsedBufferTime >= t.start && elapsedBufferTime < t.end);
            
            if (currentIdx !== -1 && currentIdx !== activeSegmentIndex) {
                setActiveSegmentIndex(currentIdx);
                const el = segmentRefs.current.get(currentIdx);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else if (currentIdx === -1 && elapsedBufferTime < segmentTimingsRef.current[0].start) {
                setActiveSegmentIndex(null);
            }
        }
        
        if (elapsedBufferTime < duration) {
           animationFrameRef.current = requestAnimationFrame(update);
        }
      }
    };

    if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(update);
    } else {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }

    return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, playbackRate, audioBuffer, activeSegmentIndex]);

  const handlePlayPause = async () => {
    if (isPlaying) {
      pauseAudio();
    } else {
      if (!audioBuffer) {
        await fetchAndPlayAudio();
      } else {
        resumeAudio();
      }
    }
  };

  const fetchAndPlayAudio = async () => {
    setIsLoadingAudio(true);
    try {
      let textToRead = "";
      if (Array.isArray(article.content)) {
         textToRead = article.title + ". " + article.content.map(s => s.en).join(" ");
      } else {
         textToRead = `${article.title}. ${article.content}`; 
      }
      
      const buffer = await generateSpeech(textToRead);
      setAudioBuffer(buffer);
      playBuffer(buffer);
    } catch (e) {
      console.error("Error generating speech", e);
      showToast("Failed to generate narration.", "error");
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const playBuffer = (buffer: AudioBuffer, offset: number = 0) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    if(ctx.state === 'suspended') ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.connect(ctx.destination);
    source.start(0, offset);
    
    sourceNodeRef.current = source;
    activeSourceStartTimeRef.current = ctx.currentTime;
    playedBufferDurationRef.current = offset;
    
    source.onended = () => {
       if (sourceNodeRef.current === source) {
           setIsPlaying(false);
           playedBufferDurationRef.current = 0;
           sourceNodeRef.current = null;
           setProgress(0);
           setCurrentTime(0);
           setActiveSegmentIndex(null);
       }
    };

    setIsPlaying(true);
  };

  const pauseAudio = () => {
    const ctx = audioContextRef.current;
    const source = sourceNodeRef.current;
    if (source && ctx) {
      const elapsedRealTime = ctx.currentTime - activeSourceStartTimeRef.current;
      playedBufferDurationRef.current += (elapsedRealTime * playbackRate);
      sourceNodeRef.current = null;
      source.stop();
      setIsPlaying(false);
    }
  };

  const resumeAudio = () => {
    if (audioBuffer) playBuffer(audioBuffer, playedBufferDurationRef.current);
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      const src = sourceNodeRef.current;
      sourceNodeRef.current = null;
      src.stop();
    }
    setIsPlaying(false);
    playedBufferDurationRef.current = 0;
    setProgress(0);
    setCurrentTime(0);
    setActiveSegmentIndex(null);
  };

  const handleSpeedChange = (newRate: number) => {
    if (isPlaying && sourceNodeRef.current && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        // Calculate played duration at the *current/old* rate
        playedBufferDurationRef.current += (now - activeSourceStartTimeRef.current) * playbackRate;
        // Reset anchor to now
        activeSourceStartTimeRef.current = now;
        // Apply new rate immediately
        sourceNodeRef.current.playbackRate.value = newRate;
    }
    setPlaybackRate(newRate);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setProgress(val);
      if(audioBuffer) setCurrentTime((val/100) * audioBuffer.duration);
      isDraggingProgressRef.current = true;
  };

  const handleSeekStart = () => { isDraggingProgressRef.current = true; };

  const handleSeekEnd = () => {
      isDraggingProgressRef.current = false;
      if (audioBuffer) {
          const seekTime = (progress / 100) * audioBuffer.duration;
          if (sourceNodeRef.current) {
              sourceNodeRef.current.stop();
              sourceNodeRef.current = null;
          }
          playBuffer(audioBuffer, seekTime);
      }
  };

  const handleSegmentDoubleClick = (index: number) => {
     if (!audioBuffer) {
         fetchAndPlayAudio(); 
         return;
     }
     const timings = segmentTimingsRef.current;
     if (timings && timings[index]) {
         const startTime = timings[index].start;
         if (sourceNodeRef.current) {
             sourceNodeRef.current.stop();
             sourceNodeRef.current = null;
         }
         playBuffer(audioBuffer, startTime);
     }
  };

  const toggleSegmentRecording = async (index: number) => {
    if (recordingSegmentIndex !== null && recordingSegmentIndex !== index) stopRecording();
    if (recordingSegmentIndex === index) stopRecording();
    else await startRecording(index);
  };

  const startRecording = async (index: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream);
      } catch (e) {
         if (MediaRecorder.isTypeSupported('audio/webm')) recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
         else recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => chunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setSegmentRecordings(prev => ({ ...prev, [index]: { url, blob } }));
        setRecordingSegmentIndex(null);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setRecordingSegmentIndex(index);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      showToast("Microphone access denied. Check permissions.", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };
  
  const handleEvaluateSegment = async (index: number, referenceText: string) => {
      const rec = segmentRecordings[index];
      if (!rec) return;
      setIsEvaluating(prev => ({ ...prev, [index]: true }));
      try {
          const reader = new FileReader();
          reader.readAsDataURL(rec.blob);
          reader.onloadend = async () => {
              const base64 = (reader.result as string).split(',')[1];
              const result = await evaluateSpeakingSegment(base64, rec.blob.type, referenceText);
              setEvaluations(prev => ({ ...prev, [index]: result }));
              setIsEvaluating(prev => ({ ...prev, [index]: false }));
          };
      } catch (e) {
          console.error(e);
          showToast("Evaluation failed", "error");
          setIsEvaluating(prev => ({ ...prev, [index]: false }));
      }
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionMenu(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length > 0 && text.split(' ').length <= 3) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      let context = selection.anchorNode?.parentElement?.textContent || "";
      if (context.length > 100) context = context.substring(0, 100) + "...";

      const initialMenu = {
        x: rect.left + rect.width / 2,
        y: rect.top - 15,
        word: text,
        context: context,
        loading: true
      };
      setSelectionMenu(initialMenu);

      try {
          const result = await lookupVocabulary(text, context);
          setSelectionMenu(prev => {
              if (prev && prev.word === text) return { ...prev, loading: false, data: result };
              return prev;
          });
      } catch (e) {
          console.error("Quick lookup failed", e);
          setSelectionMenu(prev => prev && prev.word === text ? { ...prev, loading: false } : prev);
      }
    } else {
      setSelectionMenu(null);
    }
  };
  
  const handleTTS = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  const addToVocab = () => {
    if (selectionMenu) {
      onAddWord(selectionMenu.word, selectionMenu.context);
      setSelectionMenu(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const toggleTranslation = (index: number) => {
    setVisibleTranslations(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleAnalysis = async (index: number, text: string) => {
    if (analyses[index]) {
      setAnalyses(prev => { const next = { ...prev }; delete next[index]; return next; });
      return;
    }
    setIsAnalyzing(prev => ({ ...prev, [index]: true }));
    try {
      const jsonStr = await analyzeSegment(text);
      const result = JSON.parse(jsonStr);
      setAnalyses(prev => ({ ...prev, [index]: result }));
    } catch (e) {
      console.error("Analysis failed", e);
      showToast("Could not analyze text.", "error");
    } finally {
      setIsAnalyzing(prev => ({ ...prev, [index]: false }));
    }
  };

  const [analysisLang, setAnalysisLang] = useState<'en' | 'zh'>('en');

  const handleStartDictation = () => {
    if (article.status === 'reading') {
        onUpdateStatus(article.id, 'dictation');
    }
    setMode('dictation');
  };

  const handleFinishDictation = () => {
      onUpdateStatus(article.id, 'recitation');
      setMode('recitation');
  };

  const WorkflowStepper = () => {
    const steps = [
        { id: 'reading', label: 'Read', icon: BookOpen },
        { id: 'dictation', label: 'Dictate', icon: PenTool },
        { id: 'recitation', label: 'Recite', icon: Mic },
    ];
    const currentStatus = article.status || 'reading';
    const statusOrder = ['reading', 'dictation', 'recitation', 'completed'];
    const currentIndex = statusOrder.indexOf(currentStatus);

    return (
        <div className="flex items-center gap-1 md:gap-2">
            {steps.map((step, idx) => {
                const isCompleted = currentIndex > idx;
                const isActive = step.id === currentStatus || (currentStatus === 'completed' && idx === 2);
                return (
                    <div key={step.id} className="flex items-center gap-1">
                        <div className={`
                            flex items-center justify-center w-6 h-6 md:w-auto md:px-3 md:py-1 rounded-full text-[10px] font-bold uppercase transition-all
                            ${isCompleted 
                                ? 'bg-emerald-100 text-emerald-700' 
                                : isActive 
                                    ? 'bg-primary text-white shadow-md' 
                                    : 'bg-stone-100 text-stone-400'
                            }
                        `}>
                            {isCompleted ? <CheckCircle2 size={12}/> : <step.icon size={12} />}
                            <span className="hidden md:inline ml-1">{step.label}</span>
                        </div>
                        {idx < steps.length - 1 && (
                            <div className={`h-0.5 w-2 md:w-4 rounded-full ${isCompleted ? 'bg-emerald-200' : 'bg-stone-100'}`}></div>
                        )}
                    </div>
                );
            })}
        </div>
    );
  };

  if (mode === 'dictation') return <DictationView article={article} onAddWord={onAddWord} onFinish={() => { onUpdateStatus(article.id, 'recitation'); setMode('recitation'); }} onBack={() => setMode('read')} showToast={showToast} />;
  if (mode === 'recitation') return <RecitationView article={article} onAddWord={onAddWord} onBack={() => setMode('read')} onCheckIn={() => { onUpdateStatus(article.id, 'completed'); onCheckIn(); }} hasCheckedIn={article.status === 'completed'} showToast={showToast} />;

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center p-2 md:p-6" onMouseUp={handleMouseUp}>
      {/* Main Card */}
      <div className="w-full max-w-3xl bg-white/80 backdrop-blur-xl shadow-glass border border-white/60 rounded-[32px] flex flex-col h-full overflow-hidden relative transition-all duration-300">
        
        {/* Sticky Header */}
        <div className="flex-none p-5 md:p-8 pb-4 border-b border-stone-100/80 bg-white/70 backdrop-blur-md z-20 sticky top-0">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
             <div>
                <div className="flex items-center gap-2 mb-2 opacity-80">
                    <span className="text-[9px] font-bold tracking-wider uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full">{article.topic}</span>
                    <span className="text-[9px] font-bold tracking-wider uppercase bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">{article.date}</span>
                </div>
                <h1 className="text-xl md:text-2xl font-serif font-bold text-stone-800 leading-tight tracking-tight">
                    {article.title}
                </h1>
                {article.source && (
                  <p className="text-[10px] font-serif italic text-stone-400 mt-1">Source: {article.source}</p>
                )}
             </div>
             <WorkflowStepper />
          </div>

          {/* Compact Control Bar */}
          <div className="flex items-center gap-2 bg-stone-50/90 p-1.5 rounded-2xl border border-stone-100 relative shadow-inner-light">
             <button onClick={handlePlayPause} disabled={isLoadingAudio} className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primaryDark transition-all active:scale-95 shadow-sm z-10">
                {isLoadingAudio ? <RefreshCw className="animate-spin" size={16}/> : isPlaying ? <Pause size={18}/> : <Play size={18} className="ml-0.5"/>}
             </button>

             <div className="px-3 text-xs font-mono font-medium text-stone-500 z-10 tabular-nums">
                {formatTime(currentTime)} / {formatTime(totalDuration)}
             </div>

             <div className="h-5 w-px bg-stone-200 mx-1 z-10"></div>

             <div className="flex items-center gap-1 px-1 z-10">
                 <div className="relative group">
                    <button className="text-xs font-bold text-stone-700 bg-white px-2 py-1.5 rounded-lg border border-stone-200 shadow-sm flex items-center gap-1 hover:border-primary/30 transition-colors">
                        {playbackRate}x <ChevronDown size={10} className="opacity-50" />
                    </button>
                    <div className="absolute top-full left-0 mt-1 w-20 bg-white rounded-xl shadow-float border border-stone-100 py-1 hidden group-hover:block z-50 overflow-hidden animate-scale-in origin-top-left">
                        {[0.8, 1.0, 1.2].map(rate => (
                            <button key={rate} onClick={() => handleSpeedChange(rate)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50 text-stone-600 transition-colors">
                                {rate}x
                            </button>
                        ))}
                    </div>
                 </div>
             </div>

             <div className="flex-1"></div>

             <button onClick={() => setRecitationMode(!recitationMode)} className={`h-10 px-3 rounded-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 z-10 ${recitationMode ? 'bg-primary/10 text-primary' : 'text-stone-500 hover:bg-stone-100'}`}>
                {recitationMode ? <EyeOff size={16}/> : <Eye size={16}/>}
                <span className="hidden sm:inline">Recite Mode</span>
             </button>
          </div>
          
          {/* Draggable Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 group cursor-pointer">
             <input type="range" min="0" max="100" step="0.1" value={progress} onChange={handleSeekChange} onMouseDown={handleSeekStart} onMouseUp={handleSeekEnd} onTouchStart={handleSeekStart} onTouchEnd={handleSeekEnd} disabled={!audioBuffer} className="absolute inset-0 w-full h-4 -top-2 opacity-0 cursor-pointer z-20" />
             <div className="absolute inset-0 bg-stone-100 transition-colors group-hover:bg-stone-200"></div>
             <div className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-primary to-accent transition-all duration-75 ease-out" style={{ width: `${progress}%` }}></div>
             <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-primary rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ left: `calc(${progress}% - 6px)` }}></div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 font-serif leading-loose text-stone-700 text-lg md:text-xl no-scrollbar">
          {Array.isArray(article.content) ? (
            <div className="space-y-6 pb-20">
              {article.content.map((segment: ArticleSegment, idx: number) => {
                const isActive = activeSegmentIndex === idx;
                
                return (
                  <div key={idx} ref={(el) => { if(el) segmentRefs.current.set(idx, el); }} onDoubleClick={() => handleSegmentDoubleClick(idx)}
                    className={`relative p-4 md:px-6 -mx-4 md:-mx-6 rounded-2xl transition-all duration-500 cursor-text select-text border border-transparent ${isActive ? 'bg-stone-50/80 border-l-4 border-l-primary shadow-sm' : 'hover:bg-stone-50/50'}`}
                  >
                    <p className={`transition-all duration-500 ${recitationMode ? 'blur-md select-none opacity-40 hover:blur-none hover:opacity-100 cursor-pointer' : ''} ${isActive && !recitationMode ? 'text-stone-900 font-medium' : ''}`}>
                      {segment.en}
                    </p>
                    
                    {/* Floating Tools */}
                    <div className={`flex items-center gap-2 mt-3 transition-opacity duration-300 ${visibleTranslations[idx] || analyses[idx] || isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                       <button onClick={() => toggleTranslation(idx)} className={`h-7 px-2.5 rounded-lg text-[10px] font-sans font-bold uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 ${visibleTranslations[idx] ? 'bg-primary text-white shadow-sm' : 'bg-white border border-stone-200 text-stone-500 hover:border-primary/30'}`}>
                         <Languages size={12} /> {visibleTranslations[idx] ? 'Hide' : 'Translate'}
                       </button>
                       <button onClick={() => toggleAnalysis(idx, segment.en)} disabled={isAnalyzing[idx]} className={`h-7 px-2.5 rounded-lg text-[10px] font-sans font-bold uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 ${analyses[idx] ? 'bg-violet-100 text-violet-700 border border-violet-200' : 'bg-white border border-stone-200 text-stone-500 hover:border-primary/30'}`}>
                         {isAnalyzing[idx] ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12} />} {analyses[idx] ? 'Done' : 'Insight'}
                       </button>
                       <button onClick={() => toggleSegmentRecording(idx)} className={`h-7 px-2.5 rounded-lg text-[10px] font-sans font-bold uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 ${recordingSegmentIndex === idx ? 'bg-accent text-white animate-pulse' : 'bg-white border border-stone-200 text-stone-500 hover:border-primary/30'}`}>
                          {recordingSegmentIndex === idx ? <Square size={12} fill="currentColor"/> : <Mic size={12}/>}
                       </button>
                    </div>

                    {segmentRecordings[idx] && recordingSegmentIndex !== idx && (
                       <div className="mt-3 flex flex-col gap-2 animate-fade-in bg-white border border-stone-100 p-2 rounded-xl shadow-sm w-full md:w-3/4">
                          <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-[8px]">ME</div>
                              <audio controls src={segmentRecordings[idx].url} className="h-6 flex-1" />
                              <button onClick={() => setSegmentRecordings(prev => { const n = {...prev}; delete n[idx]; return n; })} className="text-stone-400 hover:text-accent p-0.5"><X size={14} /></button>
                          </div>
                          {!evaluations[idx] && (
                              <button onClick={() => handleEvaluateSegment(idx, segment.en)} disabled={isEvaluating[idx]} className="w-full py-1.5 bg-stone-50 hover:bg-primary/5 text-stone-600 hover:text-primary text-xs font-bold rounded-lg border border-stone-200 hover:border-primary/20 transition-all flex items-center justify-center gap-1">
                                {isEvaluating[idx] ? <Loader2 size={12} className="animate-spin"/> : <Stethoscope size={12} />} Analyze Pronunciation
                              </button>
                          )}
                          {evaluations[idx] && (
                              <div className="bg-stone-50 rounded-lg p-3 text-sm">
                                  <div className="flex items-center justify-between mb-2">
                                      <span className={`text-xs font-bold uppercase ${evaluations[idx].score >= 80 ? 'text-emerald-600' : 'text-orange-500'}`}>Score: {evaluations[idx].score}</span>
                                      <button onClick={() => setEvaluations(prev => { const n = {...prev}; delete n[idx]; return n; })} className="text-[10px] text-stone-400 underline">Clear</button>
                                  </div>
                                  <div className="font-serif leading-relaxed mb-2 text-stone-700" dangerouslySetInnerHTML={{ __html: evaluations[idx].diffHtml }} />
                                  <div className="flex items-start gap-1.5 text-xs text-stone-500 bg-white p-2 rounded border border-stone-100">
                                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0 text-primary" /> {evaluations[idx].feedback}
                                  </div>
                              </div>
                          )}
                       </div>
                    )}

                    {visibleTranslations[idx] && (
                      <div className="mt-3 text-base text-stone-600 font-sans leading-relaxed pl-4 border-l-2 border-primary/30 animate-fade-in bg-stone-50/50 p-3 rounded-r-lg">
                        {segment.zh}
                      </div>
                    )}
                    
                    {analyses[idx] && (
                       <div className="mt-3 p-4 bg-white rounded-xl border border-violet-100 shadow-soft text-sm text-stone-700 font-sans animate-fade-in relative">
                          <div className="flex justify-between items-center mb-2">
                             <h4 className="font-bold flex items-center gap-2 text-primary uppercase tracking-widest text-[10px]"><Sparkles size={12} /> AI Analysis</h4>
                             <button onClick={() => setAnalysisLang(l => l === 'en' ? 'zh' : 'en')} className="text-[10px] font-bold bg-stone-100 px-2 py-1 rounded hover:bg-stone-200 transition-colors">{analysisLang === 'en' ? 'English' : '中文'}</button>
                          </div>
                          <div className="leading-relaxed prose prose-sm prose-violet max-w-none"><ReactMarkdown>{(analyses[idx] as any)[analysisLang] || "No analysis available."}</ReactMarkdown></div>
                       </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <ReactMarkdown>{article.content as string}</ReactMarkdown>
          )}

           <div className="mt-10 p-6 bg-stone-50/80 rounded-2xl border border-stone-100 flex flex-col md:flex-row gap-4 items-center justify-center backdrop-blur-sm">
             <button onClick={handleStartDictation} className={`flex items-center gap-2 px-6 py-3 rounded-xl border font-bold transition-all shadow-sm w-full md:w-auto justify-center active:scale-95 ${article.status === 'dictation' || article.status === 'recitation' || article.status === 'completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100 hover:border-stone-300'}`}>
               <PenTool size={18} /> {article.status === 'reading' ? 'Start Dictation' : 'Review Dictation'}
             </button>
             <div className="hidden md:block h-8 w-px bg-stone-200"></div>
             <button onClick={() => { if (article.status === 'dictation') handleFinishDictation(); else setMode('recitation'); }} disabled={article.status === 'reading'} className={`flex items-center gap-2 px-6 py-3 rounded-xl border font-bold transition-all shadow-sm w-full md:w-auto justify-center active:scale-95 ${article.status === 'reading' ? 'bg-stone-100 border-stone-100 text-stone-400 cursor-not-allowed' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100 hover:border-stone-300'}`}>
               {article.status === 'completed' ? <BookOpen size={18} /> : <Lock size={16} />} {article.status === 'completed' ? 'Review Recitation' : 'Recitation Challenge'}
             </button>
           </div>
        </div>
      </div>

      {selectionMenu && (
        <div className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-3 bg-white/95 backdrop-blur-xl rounded-2xl shadow-float border border-white/50 cursor-default animate-scale-in w-72 overflow-hidden" style={{ top: selectionMenu.y, left: selectionMenu.x }} onClick={(e) => e.stopPropagation()}>
           <div className="px-4 py-3 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between">
              <div>
                  <h4 className="font-serif font-bold text-stone-800 text-lg">{selectionMenu.word}</h4>
                  {selectionMenu.data?.phonetic && <span className="text-xs font-mono text-stone-400">{selectionMenu.data.phonetic}</span>}
              </div>
              <button onClick={() => handleTTS(selectionMenu.word)} className="p-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors active:scale-90"><Volume2 size={16}/></button>
           </div>
           <div className="p-4 text-sm text-stone-600 font-medium leading-relaxed bg-white/50">
               {selectionMenu.loading ? <div className="flex items-center justify-center gap-2 py-2 text-stone-400"><Loader2 size={16} className="animate-spin" /> Looking up...</div> : selectionMenu.data?.definition || "Definition not found."}
           </div>
           <div className="p-2 border-t border-stone-100 bg-stone-50/50">
               <button onClick={addToVocab} className="w-full py-2 bg-stone-800 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all active:scale-95 flex items-center justify-center gap-2"><Plus size={14} /> Add to Notebook</button>
           </div>
           <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full border-8 border-transparent border-t-white drop-shadow-sm"></div>
        </div>
      )}
    </div>
  );
};