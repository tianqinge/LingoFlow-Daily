import React, { useState } from 'react';
import { Article, ArticleStatus } from '../types';
import { CalendarDays, CheckCircle2, History, BookOpen, PenTool, Mic, ChevronLeft, ChevronRight } from 'lucide-react';

interface SidebarLeftProps {
  history: Article[];
  checkInHistory: string[];
  onSelectArticle: (article: Article) => void;
  currentArticleId?: string;
  onReturnHome: () => void;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const SidebarLeft: React.FC<SidebarLeftProps> = ({ history, checkInHistory, onSelectArticle, currentArticleId, onReturnHome }) => {
  const [activeTab, setActiveTab] = useState<ArticleStatus | 'all'>('reading');
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { daysInMonth, firstDay };
  };

  const { daysInMonth, firstDay } = getDaysInMonth(currentDate);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const isCheckedIn = (day: number) => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    return checkInHistory.includes(dateStr);
  };

  const filteredHistory = history
    .filter(a => {
        const status = a.status || 'reading';
        if (activeTab === 'all') return true;
        return status === activeTab;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const TabButton = ({ id, label, icon: Icon }: { id: ArticleStatus, label: string, icon: any }) => (
    <button
        onClick={() => setActiveTab(id)}
        className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all duration-300 ${
            activeTab === id 
            ? 'bg-white shadow-soft text-primary font-bold border border-white/50' 
            : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50/50'
        }`}
    >
        <Icon size={16} className="mb-0.5" strokeWidth={activeTab === id ? 2.5 : 2} />
        <span className="text-[9px] uppercase tracking-wide">{label}</span>
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-transparent w-full">
      {/* App Branding (Desktop Home Button) */}
      <div className="px-6 pt-6 pb-2 hidden md:block">
          <div 
            className="flex items-center gap-2 cursor-pointer select-none group"
            onDoubleClick={onReturnHome}
            title="Double click to go Home"
          >
             <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-inner-light group-hover:bg-primary group-hover:text-white transition-colors">
                <BookOpen size={18} />
             </div>
             <h1 className="text-lg font-serif font-bold text-stone-800 tracking-tight group-hover:text-primary transition-colors">LingoFlow</h1>
          </div>
      </div>

      <div className="p-4 border-b border-stone-200/50">
        <div className="flex items-center justify-between mb-2 px-2">
            <h2 className="flex items-center gap-2 font-bold text-stone-800 text-sm font-serif tracking-tight">
                <CalendarDays size={16} className="text-primary" />
                <span>Journal</span>
            </h2>
            <div className="flex items-center gap-1 text-stone-500 bg-white/40 p-0.5 rounded-lg border border-white/50">
                <button onClick={prevMonth} className="p-0.5 hover:bg-white rounded transition-colors"><ChevronLeft size={12}/></button>
                <span className="text-[10px] font-bold w-14 text-center tabular-nums">
                    {currentDate.toLocaleString('en-US', { month: 'short', year: 'numeric' })}
                </span>
                <button onClick={nextMonth} className="p-0.5 hover:bg-white rounded transition-colors"><ChevronRight size={12}/></button>
            </div>
        </div>
        
        {/* Compact Calendar */}
        <div className="bg-white/40 rounded-xl p-3 border border-white/50 shadow-inner-light mx-2">
            <div className="grid grid-cols-7 mb-2">
                {DAYS.map(d => <div key={d} className="text-[9px] text-center text-stone-400 font-bold">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-y-1 gap-x-0.5">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const checked = isCheckedIn(day);
                    return (
                        <div key={day} className="flex items-center justify-center h-5">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium transition-all duration-300 ${
                                checked 
                                ? 'bg-emerald-400 text-white shadow-sm scale-105' 
                                : 'text-stone-500 hover:bg-white/80'
                            }`}>
                                {day}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>

      <div className="px-4 mt-2 flex gap-1 p-1 bg-stone-100/50 rounded-xl mx-4 mb-2">
         <TabButton id="reading" label="Read" icon={BookOpen} />
         <TabButton id="dictation" label="Write" icon={PenTool} />
         <TabButton id="recitation" label="Speak" icon={Mic} />
         <TabButton id="completed" label="Done" icon={History} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
        {filteredHistory.length === 0 ? (
          <div className="text-center py-8 text-stone-400 flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-stone-100/50 flex items-center justify-center mb-2">
                {activeTab === 'reading' && <BookOpen size={20} className="opacity-30" />}
                {activeTab === 'dictation' && <PenTool size={20} className="opacity-30" />}
                {activeTab === 'recitation' && <Mic size={20} className="opacity-30" />}
                {activeTab === 'completed' && <History size={20} className="opacity-30" />}
            </div>
            <p className="text-[10px] font-medium">No articles found</p>
          </div>
        ) : (
          filteredHistory.map((article) => {
            const isCurrent = currentArticleId === article.id;
            return (
              <div
                key={article.id}
                onClick={() => onSelectArticle(article)}
                className={`group cursor-pointer p-3 rounded-xl border transition-all duration-300 ${
                  isCurrent
                    ? 'bg-white border-primary/20 shadow-soft ring-1 ring-primary/10'
                    : 'bg-white/40 border-transparent hover:bg-white/60 hover:shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <span className="text-[9px] font-mono text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded">{article.date}</span>
                  {article.status === 'completed' && (
                    <CheckCircle2 size={12} className="text-emerald-500" />
                  )}
                </div>
                <h3 className={`text-xs font-semibold line-clamp-2 mb-1.5 font-serif leading-snug ${isCurrent ? 'text-primary' : 'text-stone-700 group-hover:text-stone-900'}`}>
                  {article.title}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] px-1.5 py-0.5 bg-stone-100/50 rounded-md text-stone-500 font-bold uppercase tracking-wide">{article.topic.split(' ')[0]}</span>
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      article.status === 'reading' ? 'bg-blue-50 text-blue-500' :
                      article.status === 'dictation' ? 'bg-orange-50 text-orange-500' :
                      article.status === 'recitation' ? 'bg-purple-50 text-purple-500' :
                      'bg-emerald-50 text-emerald-500'
                  }`}>
                    {article.status || 'reading'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};