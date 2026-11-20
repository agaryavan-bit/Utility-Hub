import { findLanguageByCode } from '../data/interpreterLanguages';

export interface FastTranslationResult {
  detectedLanguage: string;
  sourceText: string;
  translatedText: string;
  transliteration: string;
  cached: boolean;
  provider: 'cache' | 'gtx' | 'mymemory' | 'server';
}

interface CachedTranslationEntry {
  detectedLanguage: string;
  translatedText: string;
  transliteration: string;
  ts: number;
}

const CACHE_STORAGE_KEY = 'tooly_interpreter_phrase_cache_v1';
const MAX_CACHE_ENTRIES = 400;

const memoryCache = new Map<string, CachedTranslationEntry>();
let cacheHydrated = false;

function hydrateCache(): void {
  if (cacheHydrated || typeof window === 'undefined') return;
  cacheHydrated = true;
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CachedTranslationEntry>;
    if (!parsed || typeof parsed !== 'object') return;
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.translatedText === 'string') {
        memoryCache.set(k, v);
      }
    }
  } catch {
    // Ignore storage parse/quota issues
  }
}

function persistCache(): void {
  if (typeof window === 'undefined') return;
  try {
    if (memoryCache.size > MAX_CACHE_ENTRIES) {
      const sorted = Array.from(memoryCache.entries()).sort((a, b) => a[1].ts - b[1].ts);
      const excess = memoryCache.size - MAX_CACHE_ENTRIES;
      for (let i = 0; i < excess; i++) {
        memoryCache.delete(sorted[i][0]);
      }
    }
    const obj: Record<string, CachedTranslationEntry> = {};
    memoryCache.forEach((v, k) => {
      obj[k] = v;
    });
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Ignore storage quota issues
  }
}

function buildCacheKey(sourceCode: string, targetCode: string, text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${sourceCode.toLowerCase()}|${targetCode.toLowerCase()}|${normalized}`;
}

export function getCachedTranslation(
  sourceCode: string,
  targetCode: string,
  text: string
): FastTranslationResult | null {
  hydrateCache();
  const clean = text.trim();
  if (!clean) return null;
  const key = buildCacheKey(sourceCode, targetCode, clean);
  const hit = memoryCache.get(key);
  if (!hit) return null;
  hit.ts = Date.now();
  return {
    detectedLanguage: hit.detectedLanguage,
    sourceText: clean,
    translatedText: hit.translatedText,
    transliteration: hit.transliteration,
    cached: true,
    provider: 'cache',
  };
}

function storeCachedTranslation(
  sourceCode: string,
  targetCode: string,
  text: string,
  entry: Omit<CachedTranslationEntry, 'ts'>
): void {
  if (!entry.translatedText.trim()) return;
  hydrateCache();
  const key = buildCacheKey(sourceCode, targetCode, text);
  memoryCache.set(key, { ...entry, ts: Date.now() });
  persistCache();
}

function toGtxCode(code: string): string {
  if (code === 'auto') return 'auto';
  const lang = findLanguageByCode(code);
  return lang?.gtxCode || lang?.code || code;
}

function resolveLanguageName(code: string | undefined, fallbackName: string): string {
  if (!code) return fallbackName;
  const found = findLanguageByCode(code) || findLanguageByCode(code.split('-')[0]);
  return found?.name || fallbackName;
}

async function translateViaGoogleGtx(
  text: string,
  sourceCode: string,
  sourceName: string,
  targetCode: string,
  signal?: AbortSignal
): Promise<Omit<FastTranslationResult, 'cached' | 'provider'>> {
  const sl = toGtxCode(sourceCode);
  const tl = toGtxCode(targetCode);
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${encodeURIComponent(sl)}` +
    `&tl=${encodeURIComponent(tl)}` +
    `&dt=t&dt=rm&q=${encodeURIComponent(text)}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`GTX HTTP ${res.status}`);
  }
  const data = (await res.json()) as unknown[];
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Unexpected GTX response shape');
  }

  const segments = data[0] as unknown[];
  const translatedParts: string[] = [];
  const romanizationParts: string[] = [];

  for (const seg of segments) {
    if (!Array.isArray(seg)) continue;
    if (typeof seg[0] === 'string') {
      translatedParts.push(seg[0]);
    } else if (seg[0] === null && typeof seg[2] === 'string' && seg[2].trim()) {
      romanizationParts.push(seg[2].trim());
    }
  }

  const translatedText = translatedParts.join('').trim();
  if (!translatedText) {
    throw new Error('Empty GTX translation');
  }

  const detectedCode = typeof data[2] === 'string' ? data[2] : undefined;
  const detectedLanguage =
    sourceCode === 'auto'
      ? resolveLanguageName(detectedCode, 'Detected')
      : sourceName;

  const transliteration = romanizationParts.join(' ').trim();
  // Avoid duplicating Latin-script translations as pronunciation
  const cleanTransliteration =
    transliteration && transliteration.toLowerCase() !== translatedText.toLowerCase()
      ? transliteration
      : '';

  return {
    detectedLanguage,
    sourceText: text,
    translatedText,
    transliteration: cleanTransliteration,
  };
}

async function translateViaMyMemory(
  text: string,
  sourceCode: string,
  sourceName: string,
  targetCode: string,
  signal?: AbortSignal
): Promise<Omit<FastTranslationResult, 'cached' | 'provider'>> {
  const sl = sourceCode === 'auto' ? 'autodetect' : sourceCode;
  const tl = targetCode;
  const url =
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
    `&langpair=${encodeURIComponent(`${sl}|${tl}`)}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`MyMemory HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    responseStatus?: number | string;
    responseData?: {
      translatedText?: string;
      detectedLanguage?: string;
    };
  };

  const statusNum = Number(data.responseStatus);
  const translatedText = (data.responseData?.translatedText || '').trim();
  if (
    !translatedText ||
    (statusNum && statusNum !== 200) ||
    translatedText.toUpperCase().includes('INVALID TARGET LANGUAGE') ||
    translatedText.toUpperCase().includes('INVALID SOURCE LANGUAGE') ||
    translatedText.toUpperCase().includes('MYMEMORY WARNING')
  ) {
    throw new Error('MyMemory could not translate this pair');
  }

  const detectedLanguage =
    sourceCode === 'auto'
      ? resolveLanguageName(data.responseData?.detectedLanguage, 'Detected')
      : sourceName;

  return {
    detectedLanguage,
    sourceText: text,
    translatedText,
    transliteration: '',
  };
}

async function translateViaServerFallback(
  text: string,
  sourceName: string,
  targetName: string,
  signal?: AbortSignal
): Promise<Omit<FastTranslationResult, 'cached' | 'provider'>> {
  const res = await fetch('/api/interpreter/translate-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      sourceLanguageName: sourceName,
      targetLanguageName: targetName,
    }),
    signal,
  });
  const data = (await res.json()) as {
    detectedLanguage?: string;
    sourceText?: string;
    translatedText?: string;
    transliteration?: string;
    error?: string;
  };
  if (!res.ok || !data.translatedText) {
    throw new Error(data.error || 'Translation unavailable');
  }
  return {
    detectedLanguage: data.detectedLanguage || sourceName,
    sourceText: data.sourceText || text,
    translatedText: data.translatedText,
    transliteration: data.transliteration || '',
  };
}

export async function translateFast(params: {
  text: string;
  sourceCode: string;
  sourceName: string;
  targetCode: string;
  targetName: string;
  signal?: AbortSignal;
}): Promise<FastTranslationResult> {
  const clean = params.text.trim();
  if (!clean) {
    return {
      detectedLanguage: params.sourceName,
      sourceText: '',
      translatedText: '',
      transliteration: '',
      cached: false,
      provider: 'cache',
    };
  }

  // Same language short-circuit
  if (params.sourceCode !== 'auto' && params.sourceCode === params.targetCode) {
    return {
      detectedLanguage: params.sourceName,
      sourceText: clean,
      translatedText: clean,
      transliteration: '',
      cached: true,
      provider: 'cache',
    };
  }

  // 1. Instant memory / localStorage cache lookup
  const cached = getCachedTranslation(params.sourceCode, params.targetCode, clean);
  if (cached) return cached;

  // 2. Primary fast endpoint: Google Translate translate_a/single
  try {
    const gtx = await translateViaGoogleGtx(
      clean,
      params.sourceCode,
      params.sourceName,
      params.targetCode,
      params.signal
    );
    storeCachedTranslation(params.sourceCode, params.targetCode, clean, {
      detectedLanguage: gtx.detectedLanguage,
      translatedText: gtx.translatedText,
      transliteration: gtx.transliteration,
    });
    return { ...gtx, cached: false, provider: 'gtx' };
  } catch (err) {
    if (params.signal?.aborted) throw err;
  }

  // 3. Automatic fallback: MyMemory API
  try {
    const mm = await translateViaMyMemory(
      clean,
      params.sourceCode,
      params.sourceName,
      params.targetCode,
      params.signal
    );
    storeCachedTranslation(params.sourceCode, params.targetCode, clean, {
      detectedLanguage: mm.detectedLanguage,
      translatedText: mm.translatedText,
      transliteration: mm.transliteration,
    });
    return { ...mm, cached: false, provider: 'mymemory' };
  } catch (err) {
    if (params.signal?.aborted) throw err;
  }

  // 4. Final fallback: Server endpoint (handles rare regional languages like Tulu if external endpoints reject them)
  const srv = await translateViaServerFallback(
    clean,
    params.sourceName,
    params.targetName,
    params.signal
  );
  storeCachedTranslation(params.sourceCode, params.targetCode, clean, {
    detectedLanguage: srv.detectedLanguage,
    translatedText: srv.translatedText,
    transliteration: srv.transliteration,
  });
  return { ...srv, cached: false, provider: 'server' };
}
