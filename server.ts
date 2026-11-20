import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Add it in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientOverload(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('high demand') ||
    raw.includes('overloaded')
  );
}

function extractApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return { status: 500, message: raw };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message: 'API key rejected. Please check your Gemini API key in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'Rate limit reached. Please wait a moment and try again.',
    };
  }
  if (isTransientOverload(err)) {
    return {
      status: 503,
      message: 'Translation service is temporarily busy. Please tap again in a moment.',
    };
  }
  return { status: 500, message: raw || 'Translation service error' };
}

const TRANSLATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedLanguage: {
      type: Type.STRING,
      description: 'The exact name of the language spoken or written in the input.',
    },
    sourceText: {
      type: Type.STRING,
      description: 'Accurate verbatim transcription of the input speech or text in its native script.',
    },
    translatedText: {
      type: Type.STRING,
      description: 'Natural, idiomatic translation in the target language using its standard native script.',
    },
    transliteration: {
      type: Type.STRING,
      description:
        'Clear Latin-script phonetic pronunciation guide for the translated text (empty string if target language already uses Latin script cleanly).',
    },
  },
  required: ['detectedLanguage', 'sourceText', 'translatedText', 'transliteration'],
};

async function generateTranslationWithFallback(
  ai: GoogleGenAI,
  contents: Parameters<GoogleGenAI['models']['generateContent']>[0]['contents'],
  systemInstruction: string
) {
  try {
    return await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: TRANSLATION_SCHEMA,
      },
    });
  } catch (err) {
    if (!isTransientOverload(err)) {
      throw err;
    }
    return await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: TRANSLATION_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // 1. Voice Audio -> Transcribe & Translate
  app.post('/api/interpreter/translate-audio', async (req, res) => {
    try {
      const { audioBase64, mimeType, sourceLanguageName, targetLanguageName } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        sourceLanguageName?: string;
        targetLanguageName?: string;
      };

      if (!audioBase64 || !targetLanguageName) {
        res.status(400).json({ error: 'Missing audio recording or target language.' });
        return;
      }

      const ai = getAiClient();
      const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
      const sourceHint =
        sourceLanguageName && sourceLanguageName !== 'Auto-Detect'
          ? `The speaker is expected to be speaking ${sourceLanguageName}.`
          : 'Automatically detect the spoken language.';

      const response = await generateTranslationWithFallback(
        ai,
        {
          parts: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: audioBase64,
              },
            },
            {
              text:
                `${sourceHint} Transcribe the spoken audio accurately, then translate it naturally and accurately into ${targetLanguageName}. ` +
                `For Indian regional languages such as Tulu, Marathi, Telugu, Hindi, Kannada, Tamil, Malayalam, Konkani, etc., use authentic everyday spoken vocabulary and standard script (e.g. Kannada script for Tulu, Devanagari for Hindi/Marathi/Konkani, Telugu script for Telugu, Simplified Chinese for Mandarin) plus an easy-to-read Latin transliteration. ` +
                `If the audio is silent or contains no intelligible speech, set sourceText and translatedText to empty strings.`,
            },
          ],
        },
        'You are a precision real-time multilingual interpreter fluent in 50+ world and Indian regional languages including Tulu, Marathi, Telugu, Hindi, Mandarin Chinese, and more. Return strictly valid JSON matching the schema.'
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as {
        detectedLanguage?: string;
        sourceText?: string;
        translatedText?: string;
        transliteration?: string;
      };

      res.json({
        detectedLanguage: parsed.detectedLanguage || sourceLanguageName || 'Detected',
        sourceText: (parsed.sourceText || '').trim(),
        translatedText: (parsed.translatedText || '').trim(),
        transliteration: (parsed.transliteration || '').trim(),
      });
    } catch (err) {
      const { status, message } = extractApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 2. Text -> Translate
  app.post('/api/interpreter/translate-text', async (req, res) => {
    try {
      const { text, sourceLanguageName, targetLanguageName } = req.body as {
        text?: string;
        sourceLanguageName?: string;
        targetLanguageName?: string;
      };

      if (!text?.trim() || !targetLanguageName) {
        res.status(400).json({ error: 'Missing text or target language.' });
        return;
      }

      const ai = getAiClient();
      const sourceHint =
        sourceLanguageName && sourceLanguageName !== 'Auto-Detect'
          ? `Source language: ${sourceLanguageName}.`
          : 'Detect the source language automatically.';

      const response = await generateTranslationWithFallback(
        ai,
        `${sourceHint}\nTarget language: ${targetLanguageName}.\n` +
          `Translate naturally using authentic everyday vocabulary and standard native script (for Tulu use Kannada script; for Hindi/Marathi/Konkani use Devanagari; for Mandarin use Simplified Chinese), and provide a clean Latin phonetic pronunciation guide in transliteration.\n\nText:\n${text.trim()}`,
        'You are a precision multilingual interpreter supporting 50+ world and Indian regional languages including Tulu, Marathi, Telugu, Hindi, and Mandarin Chinese. Return strictly valid JSON matching the schema.'
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as {
        detectedLanguage?: string;
        sourceText?: string;
        translatedText?: string;
        transliteration?: string;
      };

      res.json({
        detectedLanguage: parsed.detectedLanguage || sourceLanguageName || 'Detected',
        sourceText: (parsed.sourceText || text).trim(),
        translatedText: (parsed.translatedText || '').trim(),
        transliteration: (parsed.transliteration || '').trim(),
      });
    } catch (err) {
      const { status, message } = extractApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 3. Translated Text -> Natural Speech Audio (Gemini TTS)
  app.post('/api/interpreter/speak', async (req, res) => {
    try {
      const { text, languageName } = req.body as {
        text?: string;
        languageName?: string;
      };

      if (!text?.trim()) {
        res.status(400).json({ error: 'Missing text to speak.' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured. Add it in Settings > Secrets.');
      }
      const ai = new GoogleGenAI({
        apiKey,
        apiVersion: 'v1beta',
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.trim(),
                speechMetadata: {
                  style: `Clear, natural native ${languageName || ''} speaker at a comfortable conversational pace`,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const base64Audio = inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'No speech audio returned by TTS model.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: inlineData?.mimeType || 'audio/wav',
      });
    } catch (err) {
      const { status, message } = extractApiError(err);
      res.status(status).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tooly server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
