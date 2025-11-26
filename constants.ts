import { CEFRLevel } from './types';

export const AVAILABLE_TOPICS = [
  "Technology & AI",
  "Business & Economy",
  "Science & Environment",
  "Culture & Arts",
  "Health & Wellness",
  "Travel & Lifestyle",
  "Sports",
  "Global Politics"
];

export const CEFR_LEVELS = Object.values(CEFRLevel);

export const SAMPLE_TOPICS_ICONS: Record<string, string> = {
  "Technology & AI": "💻",
  "Business & Economy": "📈",
  "Science & Environment": "🌍",
  "Culture & Arts": "🎨",
  "Health & Wellness": "🧘",
  "Travel & Lifestyle": "✈️",
  "Sports": "⚽",
  "Global Politics": "⚖️"
};