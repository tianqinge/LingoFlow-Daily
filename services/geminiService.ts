
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { CEFRLevel, Article, ArticleSegment, DictationCorrection, RecitationFeedback, SpeakingEvaluation } from '../types';
import { decodeBase64, decodeAudioData } from './audioUtils';

// Initialize the Gemini Client
// API Key must be provided via process.env.API_KEY in the build environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const ARTICLE_MODEL = 'gemini-2.5-flash';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const STORY_MODEL = 'gemini-2.5-flash';
const AUDIO_MODEL = 'gemini-2.5-flash'; // For analyzing audio input

/**
 * Generates a daily news article based on topic and level.
 */
export const generateDailyArticle = async (topic: string, level: CEFRLevel, dateStr: string): Promise<Article> => {
  const prompt = `
    You are an expert journalist and English teacher.
    Write a news article or report about "${topic}" suitable for CEFR Level ${level}.
    
    Requirements:
    1. **Structure**: Break the article into logical paragraphs (segments).
    2. **Bilingual**: For each segment, provide the English text and its Chinese translation.
    3. **Source**: Cite a plausible fictional or real source (e.g., "Global Tech Wire", "Nature Daily").
    4. **Length**: 300-400 words total.
    5. **Content**: Engaging, informative, news-style.
    
    Output MUST be valid JSON matching this specific schema:
    {
      "title": "English Title",
      "source": "Source Name",
      "summary": "One sentence summary in English",
      "segments": [
        { "en": "English paragraph text...", "zh": "Chinese translation..." }
      ]
    }
  `;

  const response = await ai.models.generateContent({
    model: ARTICLE_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          source: { type: Type.STRING },
          summary: { type: Type.STRING },
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                en: { type: Type.STRING },
                zh: { type: Type.STRING }
              },
              required: ["en", "zh"]
            }
          }
        },
        required: ["title", "source", "summary", "segments"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No content generated");

  const data = JSON.parse(text);

  return {
    id: Date.now().toString(),
    date: dateStr,
    topic,
    level,
    title: data.title,
    content: data.segments, // Store as array of segments
    summary: data.summary,
    source: data.source || "LingoFlow AI News",
    status: 'reading' // Initialize status
  };
};

/**
 * Generates audio for the given text using Gemini TTS.
 */
export const generateSpeech = async (text: string): Promise<AudioBuffer> => {
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Fenrir' }, 
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("No audio data returned");
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const audioBuffer = await decodeAudioData(
    decodeBase64(base64Audio),
    audioContext,
    24000,
    1
  );

  return audioBuffer;
};

/**
 * Generates a short story using a list of vocabulary words.
 */
export const generateVocabularyStory = async (words: string[]): Promise<string> => {
  const wordList = words.join(", ");
  const prompt = `
    Create a short, creative, and coherent story (approx 150-200 words) that incorporates the following vocabulary words: ${wordList}.
    Highlight the used words in the text by wrapping them in **bold markdown**.
    The story should help a learner understand the context of these words.
  `;

  const response = await ai.models.generateContent({
    model: STORY_MODEL,
    contents: prompt,
  });

  return response.text || "Could not generate story.";
};

/**
 * Analyzes a specific text segment for grammar and vocabulary breakdown.
 */
export const analyzeSegment = async (text: string): Promise<string> => {
  const prompt = `
    Analyze the following English text for an ESL learner:
    "${text}"
    
    Provide a brief, concise explanation covering:
    1. **Key Grammar**: Explain 1-2 complex sentence structures or grammar points found in the text.
    2. **Key Vocabulary**: Define 1-2 difficult words in this specific context.
    
    Output Format: JSON with "en" (English explanation) and "zh" (Chinese explanation).
  `;

  const response = await ai.models.generateContent({
    model: ARTICLE_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          en: { type: Type.STRING },
          zh: { type: Type.STRING }
        },
        required: ["en", "zh"]
      }
    }
  });

  return response.text || "{}";
};

/**
 * Look up vocabulary definition and phonetic.
 */
export const lookupVocabulary = async (word: string, context: string): Promise<{ definition: string, phonetic: string }> => {
  const prompt = `
    Provide a concise definition in Simplified Chinese and IPA phonetic transcription for the word "${word}"${context ? ` as used in this context: "${context}"` : ''}.
    
    Output JSON schema:
    {
      "definition": "string (concise definition in Simplified Chinese)",
      "phonetic": "string (IPA)"
    }
  `;

  const response = await ai.models.generateContent({
    model: ARTICLE_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          definition: { type: Type.STRING },
          phonetic: { type: Type.STRING }
        },
        required: ["definition", "phonetic"]
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    definition: data.definition || "",
    phonetic: data.phonetic || ""
  };
};

/**
 * Checks the user's dictation against the original text.
 */
export const checkDictation = async (original: string, userInput: string): Promise<DictationCorrection> => {
  const prompt = `
    Compare the User Input with the Original Text. 
    1. Identify missing words, wrong words, and extra words.
    2. Generate an HTML string representing the diff. Use <span class='text-green-600 font-bold'>word</span> for correct/added corrections and <span class='text-red-500 line-through'>word</span> for mistakes.
    3. List specific corrections (wrong word -> right word).
    4. Provide specific feedback on 1-2 common errors found (e.g. spelling, similar sounding words, grammar).

    Original: "${original}"
    User Input: "${userInput}"
    
    Output JSON schema:
    {
      "diffHtml": "string",
      "corrections": [{ "wrong": "string", "right": "string" }],
      "feedback": "string (concise advice on errors)"
    }
  `;

  const response = await ai.models.generateContent({
    model: ARTICLE_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          diffHtml: { type: Type.STRING },
          corrections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                wrong: { type: Type.STRING },
                right: { type: Type.STRING }
              }
            }
          },
          feedback: { type: Type.STRING }
        }
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    original,
    userInput,
    diffHtml: data.diffHtml || userInput,
    corrections: data.corrections || [],
    feedback: data.feedback
  };
};

/**
 * Evaluates the user's recitation audio against the reference text.
 */
export const evaluateRecitation = async (audioBase64: string, mimeType: string, referenceText: string): Promise<RecitationFeedback> => {
  const prompt = `
    Listen to this audio recording of a student reading the following text:
    "${referenceText}"
    
    Evaluate the pronunciation, fluency, and accuracy.
    1. Give a score from 0 to 100.
    2. Provide encouraging but constructive feedback in English.
    3. List specific words that were mispronounced or skipped.
    
    Output JSON.
  `;

  const audioPart = {
    inlineData: {
      mimeType: mimeType, 
      data: audioBase64
    }
  };

  const response = await ai.models.generateContent({
    model: AUDIO_MODEL,
    contents: {
      parts: [
        audioPart,
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          mispronouncedWords: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING } 
          }
        }
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    score: data.score || 0,
    feedback: data.feedback || "Unable to evaluate audio.",
    mispronouncedWords: data.mispronouncedWords || []
  };
};

/**
 * Evaluates a specific speaking segment.
 */
export const evaluateSpeakingSegment = async (audioBase64: string, mimeType: string, referenceText: string): Promise<SpeakingEvaluation> => {
  const prompt = `
    You are evaluating a student's pronunciation of a single sentence.
    Reference Text: "${referenceText}"
    
    1. Transcribe what you hear in the audio.
    2. Compare it to the reference text.
    3. Generate an HTML diff string where:
       - Matched words are <span class='text-green-600'>word</span>
       - Mispronounced/Wrong/Missing words are <span class='text-red-500 line-through'>word</span>
    4. Give a Score (0-100).
    5. Give very brief feedback (1 sentence).

    Output JSON.
  `;

  const audioPart = {
    inlineData: {
      mimeType: mimeType, 
      data: audioBase64
    }
  };

  const response = await ai.models.generateContent({
    model: AUDIO_MODEL,
    contents: {
      parts: [
        audioPart,
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          diffHtml: { type: Type.STRING },
          feedback: { type: Type.STRING }
        }
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    score: data.score || 0,
    diffHtml: data.diffHtml || "",
    feedback: data.feedback || ""
  };
};
