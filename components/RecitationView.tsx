import React, { useState, useRef } from 'react';
import { Article, RecitationFeedback } from '../types';
import { evaluateRecitation } from '../services/geminiService';
import { Mic, Square, Loader2, Sparkles, Plus, AlertCircle, ArrowLeft, RotateCcw, Eye, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ToastType } from './Toast';

interface RecitationViewProps {
  article: Article;
  onAddWord: (word: string, context: string) => void;
  onBack: () => void;
  onCheckIn: () => void;
  hasCheckedIn: boolean;
  showToast: (msg: string, type?: ToastType) => void;
}

export const RecitationView: React.FC<RecitationViewProps> = ({ article, onAddWord, onBack, onCheckIn, hasCheckedIn, showToast }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<RecitationFeedback | null>(null);
  const [isPeeking, setIsPeeking] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const fullText = Array.isArray(article.content) 
    ? article.content.map(s => s.en).join("\n\n") 
    : article.content as string;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Attempt to create MediaRecorder. Safari sometimes requires 'audio/mp4' or specific types if default fails.
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream);
      } catch (e) {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          recorder = new MediaRecorder(stream, { mimeType: 'audio/mp4' });
        } else {
           throw new Error("No supported audio mime type found");
        }
      }

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await processAudio(blob, mimeType);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setFeedback(null);
    } catch (e) {
      console.error(e);
      showToast("Could not access microphone. Please ensure you have granted permission.", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (blob: Blob, mimeType: string) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        const base64Audio = base64String.split(',')[1];
        
        const result = await evaluateRecitation(base64Audio, mimeType, fullText);
        setFeedback(result);
        setIsProcessing(false);
        showToast("Audio analysis complete!", "success");
      };
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
      showToast("Failed to analyze audio. Please try again.", "error");
    }
  };

  const handleCheckInClick = () => {
    onCheckIn();
    showToast("Daily Goal Completed! 🎉", "success");
  };

  return (
    <div className="flex flex-col h-full bg-stone-50/50 backdrop-blur-md rounded-[32px] overflow-hidden shadow-glass border border-white/60">
      <div className="flex-none p-6 border-b border-stone-100 flex justify-between items-center bg-white/60">
        <h2 className="text-2xl font-serif font-bold text-stone-800">Recitation Challenge</h2>
        <button onClick={onBack} className="text-sm font-bold text-stone-500 hover:text-stone-800">Exit</button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col items-center">
        {!feedback ? (
          <>
            <div className="relative w-full max-w-2xl mb-8 flex-1 min-h-[300px] flex flex-col">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                   {isRecording ? "Memorization Mode" : "Review Text"}
                 </h3>
                 {isRecording && (
                   <button 
                    onMouseDown={() => setIsPeeking(true)}
                    onMouseUp={() => setIsPeeking(false)}
                    onTouchStart={() => setIsPeeking(true)}
                    onTouchEnd={() => setIsPeeking(false)}
                    className="flex items-center gap-1 text-[10px] font-bold bg-stone-200 text-stone-600 px-2 py-1 rounded hover:bg-stone-300 transition-colors"
                   >
                     <Eye size={12} /> Hold to Peek
                   </button>
                 )}
               </div>

               <div className="relative bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-stone-100 overflow-y-auto max-h-[50vh] transition-all duration-500">
                  {/* Text Layer */}
                  <div className={`font-serif text-lg md:text-xl leading-loose text-stone-700 transition-all duration-500 ${isRecording && !isPeeking ? 'blur-md opacity-20 select-none' : 'blur-0 opacity-100'}`}>
                     <ReactMarkdown>{fullText}</ReactMarkdown>
                  </div>
                  
                  {/* Overlay Message when Recording */}
                  {isRecording && !isPeeking && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <p className="text-stone-500 font-medium bg-white/80 backdrop-blur-sm px-6 py-3 rounded-full shadow-sm border border-stone-100">
                         Recite from memory...
                      </p>
                    </div>
                  )}
               </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-4 mt-auto mb-10 w-full">
               {isProcessing ? (
                 <div className="flex flex-col items-center animate-pulse">
                    <Loader2 size={48} className="text-primary animate-spin mb-4" />
                    <span className="text-stone-500 font-medium">AI is evaluating your recitation...</span>
                 </div>
               ) : (
                 <>
                   <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl border-4 ${
                      isRecording 
                        ? 'bg-red-500 border-red-200 text-white animate-pulse scale-110' 
                        : 'bg-stone-900 border-stone-700 text-white hover:scale-105 hover:bg-primary hover:border-violet-300'
                    }`}
                   >
                     {isRecording ? <Square size={32} fill="currentColor" /> : <Mic size={40} />}
                   </button>
                   <p className="text-stone-500 font-medium">
                     {isRecording ? "Tap to stop & submit" : "Tap mic to recite"}
                   </p>
                 </>
               )}
            </div>
          </>
        ) : (
          <div className="w-full max-w-2xl animate-fade-in space-y-6 pb-10">
             {/* Score Card */}
             <div className="bg-white rounded-3xl p-8 shadow-float text-center border border-white/50 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-accent"></div>
                <div className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Fluency Score</div>
                <div className="text-6xl font-serif font-bold text-stone-800 mb-2">{feedback.score}</div>
                <div className="flex justify-center">
                   {feedback.score >= 80 ? (
                     <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold flex items-center gap-1"><Sparkles size={14}/> Excellent</span>
                   ) : (
                     <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-bold flex items-center gap-1"><AlertCircle size={14}/> Keep Practicing</span>
                   )}
                </div>
             </div>

             {/* Feedback */}
             <div className="bg-white/60 rounded-2xl p-6 border border-white/50">
               <h4 className="font-bold text-stone-800 mb-3 flex items-center gap-2"><Sparkles size={18} className="text-primary"/> AI Feedback</h4>
               <p className="text-stone-600 leading-relaxed font-serif">{feedback.feedback}</p>
             </div>

             {/* Mispronounced Words */}
             {feedback.mispronouncedWords.length > 0 && (
                <div className="bg-white/60 rounded-2xl p-6 border border-white/50">
                  <h4 className="font-bold text-stone-800 mb-4">Improve Pronunciation</h4>
                  <div className="flex flex-wrap gap-2">
                     {feedback.mispronouncedWords.map((word, i) => (
                       <button
                         key={i}
                         onClick={() => onAddWord(word, "From recitation practice")}
                         className="px-4 py-2 bg-red-50 text-red-600 rounded-xl border border-red-100 hover:bg-red-100 transition-colors flex items-center gap-2 group"
                       >
                         <span className="font-medium">{word}</span>
                         <Plus size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                       </button>
                     ))}
                  </div>
                </div>
             )}
            
            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                 <button 
                   onClick={() => setFeedback(null)}
                   className="py-4 rounded-xl text-stone-600 font-bold bg-white border border-stone-200 hover:bg-stone-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                 >
                   <RotateCcw size={18} /> Retry
                 </button>
                 
                 <button 
                    onClick={handleCheckInClick}
                    disabled={hasCheckedIn}
                    className={`py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg relative overflow-hidden group ${
                        hasCheckedIn 
                        ? 'bg-emerald-100 text-emerald-600 cursor-default' 
                        : 'bg-stone-900 text-white hover:bg-primary'
                    }`}
                 >
                   {hasCheckedIn && <div className="absolute inset-0 bg-white/30 animate-pulse"></div>}
                   <CheckCircle2 size={20} />
                   {hasCheckedIn ? "Checked In Successfully!" : "Check In & Complete"}
                 </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};