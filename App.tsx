import React, { useState, useEffect } from 'react';
import { Setup } from './components/Setup';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { ArticleView } from './components/ArticleView';
import { ToastContainer, ToastData, ToastType, useToastAutoDismiss } from './components/Toast';
import { UserPreferences, Article, VocabularyItem, ArticleStatus } from './types';
import { generateDailyArticle, lookupVocabulary } from './services/geminiService';
import { Menu, Loader2, BookOpen, X } from 'lucide-react';

const STORAGE_KEY_PREFS = 'lingoflow_prefs';
const STORAGE_KEY_HISTORY = 'lingoflow_history';
const STORAGE_KEY_VOCAB = 'lingoflow_vocab';

const App: React.FC = () => {
  // State
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [history, setHistory] = useState<Article[]>([]);
  const [vocab, setVocab] = useState<VocabularyItem[]>([]);
  const [currentArticle, setCurrentArticle] = useState<Article | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  
  // Navigation State
  const [showSetup, setShowSetup] = useState(false);
  
  // Data Loaded Flag
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  // Mobile toggles
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);

  // Toast Logic
  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };
  useToastAutoDismiss(toasts, removeToast);

  // Load from LocalStorage
  useEffect(() => {
    const savedPrefs = localStorage.getItem(STORAGE_KEY_PREFS);
    const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    const savedVocab = localStorage.getItem(STORAGE_KEY_VOCAB);

    if (savedPrefs) {
        const parsedPrefs = JSON.parse(savedPrefs);
        if (!parsedPrefs.checkInHistory) parsedPrefs.checkInHistory = [];
        setPrefs(parsedPrefs);
    }
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    if (savedVocab) setVocab(JSON.parse(savedVocab));
    
    setIsDataLoaded(true);
  }, []);

  // Persist changes
  useEffect(() => { if (isDataLoaded && prefs) localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs)); }, [prefs, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history)); }, [history, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) localStorage.setItem(STORAGE_KEY_VOCAB, JSON.stringify(vocab)); }, [vocab, isDataLoaded]);

  // Initial Article Check (Only on load)
  useEffect(() => {
    if (!isDataLoaded || !prefs?.isSetupComplete || showSetup) return;

    // Only try to find/generate if we don't have a current article and aren't in setup mode
    if (!currentArticle) {
        const todayStr = new Date().toISOString().split('T')[0];
        const todayArticle = history.find(a => a.date === todayStr);

        if (todayArticle) {
          setCurrentArticle(todayArticle);
        } else {
          // If no article for today exists in history, generate one automatically
          // unless we are currently manually going back to setup
          generateArticle(false);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDataLoaded, prefs?.isSetupComplete]); 

  // --- Vocabulary Fetching Logic ---
  const fetchWordDetails = async (id: string, word: string, context: string) => {
    setVocab(prev => prev.map(v => v.id === id ? { ...v, isUpdating: true, lookupFailed: false } : v));
    try {
      const details = await lookupVocabulary(word, context);
      setVocab(prev => prev.map(v => v.id === id ? { ...v, ...details, isUpdating: false, lookupFailed: false } : v));
    } catch (e) {
      console.error("Failed to lookup word details", e);
      setVocab(prev => prev.map(v => v.id === id ? { ...v, isUpdating: false, lookupFailed: true } : v));
      showToast(`Could not define "${word}"`, "error");
    }
  };

  useEffect(() => {
    if (isDataLoaded) {
      const itemsToUpdate = vocab.filter(v => !v.definition && !v.lookupFailed && !v.isUpdating);
      itemsToUpdate.forEach(item => fetchWordDetails(item.id, item.word, item.context));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDataLoaded]);

  const handleRetryLookup = (id: string) => {
    const item = vocab.find(v => v.id === id);
    if (item) fetchWordDetails(id, item.word, item.context);
  };

  // Generate Article Logic
  const generateArticle = async (forceNew: boolean) => {
    if (!prefs) return;
    
    // Safety check: if not forcing new, and one exists, use it (double check)
    const todayStr = new Date().toISOString().split('T')[0];
    if (!forceNew) {
        const existing = history.find(a => a.date === todayStr);
        if (existing) {
            setCurrentArticle(existing);
            return;
        }
    }

    setLoadingArticle(true);
    try {
      const randomTopic = prefs.topics[Math.floor(Math.random() * prefs.topics.length)];
      const newArticle = await generateDailyArticle(randomTopic, prefs.level!, todayStr);
      
      setHistory(prev => [newArticle, ...prev]); // Add new to top
      setCurrentArticle(newArticle);
    } catch (error) {
      console.error("Failed to generate article", error);
      showToast("Failed to generate new article. Please try refreshing.", "error");
    } finally {
      setLoadingArticle(false);
    }
  };

  const handleSetupComplete = (newPrefs: UserPreferences) => {
    // Merge new prefs, keep history
    setPrefs(prev => ({ 
        ...newPrefs, 
        checkInHistory: prev?.checkInHistory || [] 
    }));
    
    setShowSetup(false);
    showToast("Preferences updated! Generating new article...", "success");
    
    // Explicitly generate a NEW article based on new choices
    generateArticle(true);
  };

  const handleAddWord = async (word: string, context: string) => {
    const id = Date.now().toString();
    const newItem: VocabularyItem = {
      id, word, context, addedAt: Date.now(), isUpdating: true
    };

    if (!vocab.find(v => v.word.toLowerCase() === word.toLowerCase())) {
      setVocab(prev => [newItem, ...prev]);
      showToast(`Saved "${word}" to Notebook`, "success");
      setShowRightSidebar(true);
      fetchWordDetails(id, word, context);
    } else {
      showToast(`"${word}" is already in your notebook`, "info");
      setShowRightSidebar(true);
    }
  };

  const handleRemoveWord = (id: string) => setVocab(prev => prev.filter(v => v.id !== id));

  const handleUpdateArticleStatus = (id: string, status: ArticleStatus) => {
      setHistory(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      if (currentArticle?.id === id) {
          setCurrentArticle(prev => prev ? { ...prev, status } : null);
      }
  };

  const handleCheckIn = () => {
    if (!prefs || !currentArticle) return;
    const today = new Date().toISOString().split('T')[0];
    if (!prefs.checkInHistory.includes(today)) {
        setPrefs(prev => {
            if (!prev) return null;
            return { ...prev, checkInHistory: [...prev.checkInHistory, today] };
        });
    }
    handleUpdateArticleStatus(currentArticle.id, 'completed');
  };

  const isCheckedInToday = () => {
      if (!prefs) return false;
      const today = new Date().toISOString().split('T')[0];
      return prefs.checkInHistory.includes(today);
  };
  
  const handleReturnHome = () => {
      // Go back to Setup screen to allow re-selection
      setCurrentArticle(null);
      setShowSetup(true);
      setShowLeftSidebar(false);
  };

  // Determine what to render
  const renderContent = () => {
      if (!prefs || !prefs.isSetupComplete || showSetup) {
          return <Setup onComplete={handleSetupComplete} />;
      }

      return (
        <div className="flex h-screen overflow-hidden relative text-stone-800 font-sans">
          <ToastContainer toasts={toasts} removeToast={removeToast} />
          
          {/* Mobile Header */}
          <div className="md:hidden absolute top-0 left-0 right-0 z-20 h-16 glass-panel flex items-center justify-between px-4 shadow-sm">
              <button onClick={() => setShowLeftSidebar(true)} className="p-2 text-stone-500 hover:bg-white/50 rounded-full transition-colors">
                <Menu size={24} />
              </button>
              <div className="flex items-center gap-2 text-primary font-serif font-bold text-lg select-none cursor-pointer" onDoubleClick={handleReturnHome} title="Double tap to go Home">
                <BookOpen size={20} className="text-primary" />
                <span>LingoFlow</span>
              </div>
              <button onClick={() => setShowRightSidebar(true)} className="p-2 text-stone-500 hover:bg-white/50 rounded-full transition-colors relative">
                <Menu size={24} />
                {vocab.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full"></span>}
              </button>
          </div>

          {/* Left Sidebar */}
          <div className={`fixed md:relative z-40 inset-y-0 left-0 w-72 glass-panel border-r border-white/40 shadow-xl md:shadow-none transform transition-transform duration-300 ease-out ${showLeftSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
            <div className="md:hidden absolute right-2 top-2 z-50">
               <button onClick={() => setShowLeftSidebar(false)} className="p-2 text-stone-400"><X size={20}/></button>
            </div>
            <SidebarLeft history={history} checkInHistory={prefs.checkInHistory} onSelectArticle={(a) => { setCurrentArticle(a); setShowLeftSidebar(false); }} currentArticleId={currentArticle?.id} onReturnHome={handleReturnHome}/>
          </div>

          {/* Main Content */}
          <main className="flex-1 flex flex-col h-full w-full relative pt-16 md:pt-0">
            {loadingArticle && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/60 backdrop-blur-md animate-fade-in">
                <div className="bg-white/90 p-8 rounded-3xl shadow-float flex flex-col items-center text-center max-w-sm mx-4 border border-white/50">
                    <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse"></div>
                        <Loader2 className="animate-spin text-primary relative z-10" size={48} />
                    </div>
                    <h2 className="text-xl font-serif font-bold text-stone-800 mt-6">Crafting your daily read</h2>
                    <p className="text-stone-500 mt-2 text-sm">Focusing on {prefs.topics.join(' & ')}...</p>
                </div>
              </div>
            )}

            {currentArticle ? (
              <ArticleView article={currentArticle} onAddWord={handleAddWord} onCheckIn={handleCheckIn} hasCheckedIn={isCheckedInToday()} onUpdateStatus={handleUpdateArticleStatus} showToast={showToast}/>
            ) : (
               !loadingArticle && <div className="flex-1 flex items-center justify-center text-stone-400 font-serif italic">Select an article from history</div>
            )}
          </main>

          {/* Right Sidebar */}
          <div className={`fixed md:relative z-40 inset-y-0 right-0 w-80 glass-panel border-l border-white/40 shadow-xl md:shadow-none transform transition-transform duration-300 ease-out ${showRightSidebar ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
            <div className="md:hidden absolute left-2 top-2 z-50">
               <button onClick={() => setShowRightSidebar(false)} className="p-2 text-stone-400"><X size={20}/></button>
            </div>
            <SidebarRight vocabulary={vocab} onRemoveWord={handleRemoveWord} onRetryLookup={handleRetryLookup} showToast={showToast} onAddWord={handleAddWord}/>
          </div>

          {(showLeftSidebar || showRightSidebar) && (
            <div className="fixed inset-0 bg-stone-900/10 backdrop-blur-sm z-30 md:hidden animate-fade-in" onClick={() => { setShowLeftSidebar(false); setShowRightSidebar(false); }}></div>
          )}
        </div>
      );
  };
  
  return renderContent();
};

export default App;