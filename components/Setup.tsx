import React, { useState } from 'react';
import { CEFR_LEVELS, AVAILABLE_TOPICS, SAMPLE_TOPICS_ICONS } from '../constants';
import { CEFRLevel, UserPreferences } from '../types';
import { BookOpen, ArrowRight, CheckCircle2 } from 'lucide-react';

interface SetupProps {
  onComplete: (prefs: UserPreferences) => void;
}

export const Setup: React.FC<SetupProps> = ({ onComplete }) => {
  const [level, setLevel] = useState<CEFRLevel | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const toggleTopic = (topic: string) => {
    if (selectedTopics.includes(topic)) {
      setSelectedTopics([]);
    } else {
      setSelectedTopics([topic]);
    }
  };

  const handleFinish = () => {
    if (level && selectedTopics.length > 0) {
      onComplete({
        level,
        topics: selectedTopics,
        isSetupComplete: true,
        checkInHistory: []
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-50/50 backdrop-blur-3xl p-4 font-sans">
      {/* Main Card Container - Responsive Height */}
      <div className="w-full max-w-5xl h-[90vh] md:h-[80vh] bg-white/80 backdrop-blur-2xl rounded-[32px] shadow-2xl border border-white/60 flex flex-col overflow-hidden animate-scale-in ring-1 ring-white/50">
        
        {/* Header Section - Inline Logo & Title, Centered */}
        <div className="flex-none px-6 py-5 border-b border-stone-100/50 bg-white/40 flex items-center justify-center gap-3">
           <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary to-primaryDark text-white flex items-center justify-center shadow-lg shadow-primary/20 transform hover:rotate-3 transition-transform duration-300">
             <BookOpen size={20} className="md:w-6 md:h-6" />
           </div>
           <h1 className="text-2xl md:text-3xl font-serif font-bold text-stone-800 tracking-tight">LingoFlow</h1>
        </div>

        {/* Content Area - Split Pane */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Panel: Proficiency */}
          <div className="md:w-[35%] flex-none border-b md:border-b-0 md:border-r border-stone-100 flex flex-col bg-stone-50/30 min-h-[150px] md:min-h-0">
             <div className="px-6 py-4 pb-2 flex-none">
                <h2 className="text-xs md:text-sm font-extrabold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                   <span className="w-1 h-4 bg-accent rounded-full"></span>
                   CEFR Level
                </h2>
             </div>
             <div className="flex-1 overflow-y-auto px-6 py-2 no-scrollbar">
                <div className="grid grid-cols-3 gap-3">
                  {CEFR_LEVELS.map((l) => {
                    const shortLabel = l.split(' ')[0]; 
                    return (
                      <button
                        key={l}
                        onClick={() => setLevel(l)}
                        className={`relative group h-12 rounded-xl flex items-center justify-center text-base font-bold transition-all duration-200 border shadow-sm ${
                          level === l
                            ? 'bg-white border-accent text-accent ring-1 ring-accent z-10 scale-105'
                            : 'bg-white border-stone-200 text-stone-400 hover:border-accent/40 hover:text-stone-600'
                        }`}
                      >
                        {shortLabel}
                        {level === l && (
                          <div className="absolute -top-1.5 -right-1.5 bg-white rounded-full text-accent shadow-sm">
                             <CheckCircle2 size={14} fill="white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 p-3 bg-accent/5 rounded-xl border border-accent/10">
                    <p className="text-[10px] text-stone-500 leading-relaxed">
                        <span className="font-bold text-accent">Tip:</span> Choose a level that feels slightly challenging but mostly understandable.
                    </p>
                </div>
             </div>
          </div>

          {/* Right Panel: Topics */}
          <div className="md:w-[65%] flex-1 flex flex-col bg-white/20 min-h-0">
             <div className="px-6 py-4 pb-2 flex-none">
                <h2 className="text-xs md:text-sm font-extrabold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                   <span className="w-1 h-4 bg-primary rounded-full"></span>
                   Topic of Interest
                </h2>
             </div>
             
             <div className="flex-1 overflow-y-auto px-6 py-2 pb-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {AVAILABLE_TOPICS.map((topic) => {
                    const isSelected = selectedTopics.includes(topic);
                    return (
                      <button
                        key={topic}
                        onClick={() => toggleTopic(topic)}
                        className={`group relative flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-200 border h-28 ${
                          isSelected
                            ? 'bg-primary/5 border-primary shadow-md ring-1 ring-primary transform -translate-y-1'
                            : 'bg-white border-stone-100 hover:border-primary/30 hover:shadow-soft hover:-translate-y-0.5'
                        }`}
                      >
                        <span className={`text-3xl mb-2 filter drop-shadow-sm transition-transform duration-300 ${isSelected ? 'scale-110' : 'group-hover:scale-110'}`}>
                            {SAMPLE_TOPICS_ICONS[topic]}
                        </span>
                        <span className={`text-[11px] font-bold text-center leading-tight transition-colors line-clamp-2 ${isSelected ? 'text-primary' : 'text-stone-600'}`}>
                            {topic}
                        </span>
                        
                        {isSelected && (
                             <div className="absolute top-2 right-2 text-primary animate-scale-in">
                                <CheckCircle2 size={16} />
                             </div>
                        )}
                      </button>
                    );
                  })}
                </div>
             </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="flex-none p-4 md:p-6 border-t border-stone-100 bg-white/60 backdrop-blur-md z-10">
           <button
            onClick={handleFinish}
            disabled={!level || selectedTopics.length === 0}
            className="w-full py-4 rounded-2xl bg-stone-900 text-white font-bold text-lg hover:bg-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.99] active:translate-y-0"
           >
            {level && selectedTopics.length > 0 ? (
                <>
                    <span>Begin your <span className="text-primary-300">{level.split(' ')[0]}</span> Journey</span>
                    <ArrowRight size={20} />
                </>
            ) : (
                <span className="text-stone-400">Select a Level and Topic</span>
            )}
           </button>
        </div>

      </div>
    </div>
  );
};