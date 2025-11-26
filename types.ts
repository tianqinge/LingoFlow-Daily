
export enum CEFRLevel {
  A1 = 'A1 (Beginner)',
  A2 = 'A2 (Elementary)',
  B1 = 'B1 (Intermediate)',
  B2 = 'B2 (Upper Intermediate)',
  C1 = 'C1 (Advanced)',
  C2 = 'C2 (Proficiency)',
}

export type ArticleStatus = 'reading' | 'dictation' | 'recitation' | 'completed';

export interface ArticleSegment {
  en: string;
  zh: string;
}

export interface Article {
  id: string;
  title: string;
  // content can be string (legacy) or segments (new)
  content: string | ArticleSegment[]; 
  summary: string;
  date: string; // ISO date string YYYY-MM-DD
  topic: string;
  level: CEFRLevel;
  source?: string;
  status: ArticleStatus; // Track current learning stage
}

export interface VocabularyItem {
  id: string;
  word: string;
  context: string; // The sentence where it was found
  addedAt: number;
  definition?: string;
  phonetic?: string;
  lookupFailed?: boolean;
  isUpdating?: boolean;
}

export interface UserPreferences {
  level: CEFRLevel | null;
  topics: string[];
  isSetupComplete: boolean;
  checkInHistory: string[]; // List of ISO date strings
}

export interface Story {
  id: string;
  content: string;
  createdAt: number;
  wordsUsed: string[];
}

export interface AnalysisResult {
  en: string;
  zh: string;
}

export interface DictationCorrection {
  original: string;
  userInput: string;
  diffHtml: string; // HTML string with <span class="correct/incorrect">
  corrections: { wrong: string; right: string }[];
  feedback?: string; // Specific AI advice on errors
}

export interface RecitationFeedback {
  score: number; // 0-100
  feedback: string;
  mispronouncedWords: string[];
}

export interface SpeakingEvaluation {
  score: number;
  diffHtml: string;
  feedback: string;
}
