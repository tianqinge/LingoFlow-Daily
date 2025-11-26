
import React, { useState } from 'react';
import { VocabularyItem } from '../types';
import { generateVocabularyStory, lookupVocabulary } from '../services/geminiService';
import { BookA, Sparkles, Trash2, X, Loader2, RotateCcw, Volume2, Search, Plus, ArrowRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ToastType } from './Toast';

interface SidebarRightProps {
  vocabulary: VocabularyItem[];
  onRemoveWord: (id: string) => void;
  onRetryLookup: (id: string) => void;
  showToast: (msg: string, type?: ToastType) => void;
}

// Reuse the AddWord handler logic slightly differently here, 
// since we need to "Add" the searched word to the main list.
// However, SidebarRight receives the list, doesn't directly add.
// We might need to pass onAddWord here too, but for now I'll use a hack or just emit a toast if not passed.
// Wait, SidebarRightProps doesn't have onAddWord. I should just rely on the existing onAddWord from App
// but SidebarRight is connected to App.tsx. I need to update App.tsx to pass onAddWord to SidebarRight?
// NO, I can just accept it as a new prop if I changed App.tsx, but user prompt implies I can just "Add".
// I will just modify the props to accept `onAddWord` if possible, OR I will just show the result.
// Actually, the prompt says "Global Loop... add to notebook button".
// I will need to assume the parent passes a handler, or I'll have to modify App.tsx as well.
// Let's modify App.tsx to pass onAddWord to SidebarRight.

// Wait, I can't modify App.tsx in this file block.
// I'll check if I can modify App.tsx. Yes I can.
// So I will update SidebarRightProps to include onAddWord.

interface SidebarRightPropsExtended extends SidebarRightProps {
    onAddWord?: (word: string, context: string) => void;
}

export const SidebarRight: React.FC<SidebarRightPropsExtended> = ({ vocabulary, onRemoveWord, onRetryLookup, showToast, onAddWord }) => {
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [story, setStory] = useState<string | null>(null);
  const [showStoryModal, setShowStoryModal] = useState(false);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{word: string, definition: string, phonetic: string} | null>(null);

  const handleGenerateStory = async () => {
    if (vocabulary.length === 0) return;
    setIsGeneratingStory(true);
    setShowStoryModal(true);
    setStory(null);
    try {
      const words = vocabulary.map(v => v.word);
      const result = await generateVocabularyStory(words);
      setStory(result);
      showToast("Story woven successfully!", "success");
    } catch (error) {
      console.error("Failed to generate story", error);
      setStory("Sorry, I couldn't generate a story right now.");
      showToast("Failed to generate story.", "error");
    } finally {
      setIsGeneratingStory(false);
    }
  };
  
  const handleRemove = (id: string) => {
      onRemoveWord(id);
      showToast("Word removed from notebook.", "info");
  };

  const handlePlayAudio = (text: string) => {
      if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'en-US';
          window.speechSynthesis.speak(utterance);
      } else {
          showToast("Text-to-speech not supported by browser", "error");
      }
  };

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!searchQuery.trim()) return;
      setIsSearching(true);
      setSearchResult(null);
      
      try {
          const res = await lookupVocabulary(searchQuery, "");
          setSearchResult({
              word: searchQuery,
              definition: res.definition,
              phonetic: res.phonetic
          });
      } catch (e) {
          showToast("Could not find word.", "error");
      } finally {
          setIsSearching(false);
      }
  };
  
  const handleAddSearchResult = () => {
      if (searchResult && onAddWord) {
          onAddWord(searchResult.word, "Added via search");
          setSearchQuery("");
          setSearchResult(null);
      }
  };

  return (
    <>
      <div className="h-full flex flex-col bg-transparent w-full">
        <div className="p-6 pt-8 md:pt-6 border-b border-stone-200/50">
           <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="flex items-center gap-2 font-bold text-stone-800 text-lg font-serif">
                  <BookA size={22} className="text-primary" />
                  <span>Notebook</span>
                </h2>
                <p className="text-xs text-stone-400 mt-1 font-medium">{vocabulary.length} words saved</p>
              </div>
           </div>
           
           {/* Global Search Bar */}
           <form onSubmit={handleSearch} className="relative">
               <input 
                  type="text" 
                  placeholder="Lookup a word..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-stone-100/50 border border-stone-100 text-sm focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
               />
               <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
               {isSearching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary animate-spin" />}
           </form>
           
           {/* Search Result Card */}
           {searchResult && (
               <div className="mt-3 bg-white rounded-xl p-4 shadow-float border border-primary/20 animate-fade-in relative overflow-hidden">
                   <button onClick={() => setSearchResult(null)} className="absolute top-2 right-2 text-stone-300 hover:text-stone-500"><X size={14}/></button>
                   <div className="flex items-center gap-2 mb-1">
                       <h3 className="font-serif font-bold text-lg text-primary">{searchResult.word}</h3>
                       <button onClick={() => handlePlayAudio(searchResult.word)} className="p-1 rounded-full bg-primary/5 text-primary"><Volume2 size={12}/></button>
                   </div>
                   <div className="text-xs text-stone-500 font-mono mb-2 bg-stone-50 inline-block px-1 rounded">{searchResult.phonetic}</div>
                   <p className="text-sm text-stone-700 font-medium mb-3">{searchResult.definition}</p>
                   {onAddWord && (
                       <button 
                         onClick={handleAddSearchResult}
                         className="w-full py-1.5 bg-stone-900 text-white text-xs font-bold rounded-lg hover:bg-primary transition-colors flex items-center justify-center gap-1"
                       >
                           <Plus size={12} /> Add to Notebook
                       </button>
                   )}
               </div>
           )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {vocabulary.length === 0 && !searchResult ? (
            <div className="text-center py-12 text-stone-400 px-4">
              <p className="text-sm italic font-serif">"Words are the building blocks of thought."</p>
              <p className="text-xs mt-2">Highlight text in the article to add words.</p>
            </div>
          ) : (
            vocabulary.map((item) => (
              <div key={item.id} className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group relative animate-fade-in">
                
                {/* Header: Word + Audio + Remove */}
                <div className="flex justify-between items-center mb-2">
                   <div className="flex items-center gap-2">
                       <h4 className="font-serif font-bold text-stone-800 text-lg">{item.word}</h4>
                       <button 
                         onClick={() => handlePlayAudio(item.word)}
                         className="p-1 rounded-full text-stone-400 hover:text-primary hover:bg-primary/10 transition-colors"
                         title="Listen"
                       >
                           <Volume2 size={16} />
                       </button>
                   </div>
                   <button 
                    onClick={() => handleRemove(item.id)}
                    className="text-stone-300 hover:text-accent transition-colors p-1"
                    title="Remove"
                   >
                     <Trash2 size={14} />
                   </button>
                </div>
                
                {/* Phonetic */}
                {item.phonetic && (
                    <div className="mb-2">
                        <span className="text-xs text-stone-400 font-mono tracking-wide bg-stone-50 px-1.5 py-0.5 rounded border border-stone-100">
                            {item.phonetic}
                        </span>
                    </div>
                )}
                
                {/* Definition (Chinese) */}
                {item.definition ? (
                    <p className="text-sm text-stone-700 font-medium mb-3">
                        {item.definition}
                    </p>
                ) : item.lookupFailed ? (
                   <div className="flex items-center justify-between gap-2 mb-2 bg-red-50 p-2 rounded-lg">
                       <span className="text-[10px] text-red-400">Definition failed</span>
                       <button onClick={() => onRetryLookup(item.id)} className="text-[10px] font-bold text-stone-500 hover:text-stone-800 flex items-center gap-1">
                           <RotateCcw size={10} /> Retry
                       </button>
                   </div>
                ) : (
                   <div className="flex items-center gap-1 text-[10px] text-stone-400 mb-2">
                       <Loader2 size={10} className="animate-spin"/> Translating...
                   </div>
                )}

                {/* Context (Example) */}
                <div className="relative pl-3 border-l-2 border-primary/20">
                    <p className="text-xs text-stone-500 italic leading-relaxed">
                      "{item.context}"
                    </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 border-t border-stone-200/50 bg-transparent">
          <button
            onClick={handleGenerateStory}
            disabled={vocabulary.length < 3 || isGeneratingStory}
            className="w-full py-4 bg-gradient-to-r from-primary to-primaryDark text-white rounded-2xl font-bold shadow-lg hover:shadow-primary/30 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all flex items-center justify-center gap-2"
          >
            {isGeneratingStory ? (
               <Loader2 className="animate-spin" size={20}/>
            ) : (
               <Sparkles size={20} />
            )}
            <span>Weave a Story</span>
          </button>
          {vocabulary.length < 3 && (
            <p className="text-[10px] text-center text-stone-400 mt-3">Collect 3+ words to unlock AI stories.</p>
          )}
        </div>
      </div>

      {/* Story Modal */}
      {showStoryModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/20 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-white/50">
             <div className="p-5 border-b border-stone-100 flex justify-between items-center bg-primary/5">
                <h3 className="font-bold text-primary flex items-center gap-2 font-serif text-lg">
                  <Sparkles size={20}/> AI Storyteller
                </h3>
                <button onClick={() => setShowStoryModal(false)} className="text-stone-400 hover:text-stone-700 p-2 rounded-full hover:bg-stone-100 transition-colors">
                  <X size={22} />
                </button>
             </div>
             <div className="p-8 overflow-y-auto font-serif text-lg leading-loose text-stone-700">
                {isGeneratingStory ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                     <Loader2 className="animate-spin text-primary" size={40} />
                     <p className="text-sm text-stone-400 animate-pulse">Creating a magical story...</p>
                  </div>
                ) : (
                   <div className="prose prose-stone prose-lg">
                     <ReactMarkdown>{story || ""}</ReactMarkdown>
                   </div>
                )}
             </div>
          </div>
        </div>
      )}
    </>
  );
};
