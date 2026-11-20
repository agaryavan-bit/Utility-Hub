import 'dotenv/config';
import crypto from 'crypto';
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

  // ==================== TEMP MAIL (Mail.tm Public API — Free, No API Key) ====================
  const MAIL_TM_BASE = 'https://api.mail.tm';

  const extractMailTmList = <T,>(payload: unknown): T[] => {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>)['hydra:member'])) {
      return (payload as Record<string, unknown>)['hydra:member'] as T[];
    }
    return [];
  };

  app.post('/api/tempmail/create', async (req, res) => {
    try {
      const { prefix } = (req.body || {}) as { prefix?: string };

      const domainsRes = await fetch(`${MAIL_TM_BASE}/domains`, {
        headers: { Accept: 'application/json' },
      });
      if (!domainsRes.ok) {
        res.status(502).json({ error: 'Unable to fetch active Temp Mail domains right now.' });
        return;
      }
      const domainsRaw = await domainsRes.json();
      const domains = extractMailTmList<{ domain?: string; isActive?: boolean; isPrivate?: boolean }>(
        domainsRaw
      ).filter((d) => d.domain && d.isActive !== false && !d.isPrivate);

      const chosenDomain = domains[0]?.domain;
      if (!chosenDomain) {
        res.status(502).json({ error: 'No active disposable email domain available right now.' });
        return;
      }

      const cleanPrefix = (prefix || '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 20);

      const makeLocalPart = (forceRandomSuffix: boolean) => {
        const randTag = crypto.randomBytes(3).toString('hex');
        if (cleanPrefix && !forceRandomSuffix) return `${cleanPrefix}.${randTag.slice(0, 4)}`;
        const words = ['swift', 'clear', 'glass', 'nova', 'breeze', 'pulse', 'mint', 'sky', 'echo', 'halo'];
        const word = words[crypto.randomInt(words.length)];
        return `${cleanPrefix || word}.${randTag}`;
      };

      const password = `Tm!${crypto.randomBytes(12).toString('hex')}`;
      let address = `${makeLocalPart(false)}@${chosenDomain}`;

      let accountRes = await fetch(`${MAIL_TM_BASE}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ address, password }),
      });

      // Retry once with extra random suffix if address already exists
      if (accountRes.status === 422) {
        address = `${makeLocalPart(true)}@${chosenDomain}`;
        accountRes = await fetch(`${MAIL_TM_BASE}/accounts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ address, password }),
        });
      }

      if (!accountRes.ok) {
        const errText = await accountRes.text();
        res.status(accountRes.status === 429 ? 429 : 502).json({
          error:
            accountRes.status === 429
              ? 'Temp Mail rate limit reached. Please wait a few seconds and try again.'
              : `Could not create disposable inbox (${accountRes.status}): ${errText.slice(0, 120)}`,
        });
        return;
      }

      const account = (await accountRes.json()) as { id?: string; address?: string; createdAt?: string };

      const tokenRes = await fetch(`${MAIL_TM_BASE}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ address: account.address || address, password }),
      });

      if (!tokenRes.ok) {
        res.status(502).json({ error: 'Inbox created, but session token login failed. Please retry.' });
        return;
      }

      const tokenData = (await tokenRes.json()) as { token?: string; id?: string };
      if (!tokenData.token) {
        res.status(502).json({ error: 'Mail.tm returned an empty auth token.' });
        return;
      }

      res.json({
        id: account.id || tokenData.id || crypto.randomUUID(),
        address: account.address || address,
        token: tokenData.token,
        createdAt: account.createdAt || new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to create temporary email address.',
      });
    }
  });

  app.get('/api/tempmail/messages', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Temp Mail session token.' });
        return;
      }

      const mailRes = await fetch(`${MAIL_TM_BASE}/messages`, {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });

      if (mailRes.status === 401) {
        res.status(401).json({ error: 'This temporary inbox expired. Generate a fresh address.' });
        return;
      }
      if (!mailRes.ok) {
        res.status(mailRes.status === 429 ? 429 : 502).json({
          error:
            mailRes.status === 429
              ? 'Refreshing too quickly. Pausing briefly before next sync.'
              : 'Unable to fetch inbox messages right now.',
        });
        return;
      }

      const raw = await mailRes.json();
      const messages = extractMailTmList<Record<string, unknown>>(raw);
      res.json({ messages });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to refresh Temp Mail inbox.',
      });
    }
  });

  app.get('/api/tempmail/messages/:id', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Temp Mail session token.' });
        return;
      }
      const msgId = encodeURIComponent(req.params.id);

      const mailRes = await fetch(`${MAIL_TM_BASE}/messages/${msgId}`, {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });

      if (!mailRes.ok) {
        res.status(mailRes.status).json({ error: 'Could not load message contents.' });
        return;
      }

      const detail = (await mailRes.json()) as Record<string, unknown>;

      // Best-effort mark message as seen in background
      if (detail.seen === false) {
        fetch(`${MAIL_TM_BASE}/messages/${msgId}`, {
          method: 'PATCH',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/merge-patch+json',
          },
          body: JSON.stringify({ seen: true }),
        }).catch(() => {});
      }

      res.json(detail);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to open email message.',
      });
    }
  });

  app.delete('/api/tempmail/messages/:id', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Temp Mail session token.' });
        return;
      }
      const msgId = encodeURIComponent(req.params.id);
      const delRes = await fetch(`${MAIL_TM_BASE}/messages/${msgId}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      });
      res.status(delRes.ok || delRes.status === 404 ? 200 : delRes.status).json({ ok: true });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to delete message.',
      });
    }
  });

  app.delete('/api/tempmail/account/:id', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Temp Mail session token.' });
        return;
      }
      const accId = encodeURIComponent(req.params.id);
      await fetch(`${MAIL_TM_BASE}/accounts/${accId}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      }).catch(() => {});
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
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
