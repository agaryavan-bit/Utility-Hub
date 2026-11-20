import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Copy,
  Keyboard,
  Languages,
  Layers,
  Loader2,
  Mic,
  NotebookPen,
  QrCode,
  Search,
  Send,
  Square,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import {
  findLanguageByCode,
  INTERPRETER_LANGUAGES,
  InterpreterLanguage,
} from '../../data/interpreterLanguages';
import { InterpreterHistoryItem } from '../../types/hub';
import { autoScrollToElement } from '../../utils/autoScroll';
import { getCachedTranslation, translateFast } from '../../utils/fastTranslator';
import { triggerHaptic } from '../../utils/haptics';

const QUICK_TARGET_CODES = ['zh-CN', 'hi', 'mr', 'tcy', 'te', 'ta', 'kn', 'es', 'ja', 'ar'];

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read recorded audio.'));
        return;
      }
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to encode audio recording.'));
    reader.readAsDataURL(blob);
  });
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const InterpreterModule: React.FC = () => {
  const {
    state,
    addInterpreterHistory,
    deleteInterpreterHistory,
    clearInterpreterHistory,
    createNoteFromPayload,
    openNoteToAnki,
    sendToQr,
    showToast,
  } = useHub();

  const [mode, setMode] = useState<'single' | 'conversation'>('single');
  const [sourceCode, setSourceCode] = useState<string>('en'); // 'auto' or language code
  const [targetCode, setTargetCode] = useState<string>('hi');
  const [autoSpeak, setAutoSpeak] = useState<boolean>(true);
  const [showTextInput, setShowTextInput] = useState<boolean>(false);
  const [typedText, setTypedText] = useState<string>('');

  // Language Picker modal state
  const [pickerSide, setPickerSide] = useState<'source' | 'target' | null>(null);
  const [langSearch, setLangSearch] = useState<string>('');

  // Microphone recording & live streaming transcript state
  const [recordingSide, setRecordingSide] = useState<'a' | 'b' | null>(null);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [audioLevels, setAudioLevels] = useState<number[]>(() => Array(15).fill(14));
  const [translating, setTranslating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active result + audio playback state
  const [latestResult, setLatestResult] = useState<InterpreterHistoryItem | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingTtsId, setLoadingTtsId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Refs for SpeechRecognition, MediaRecorder fallback, Web Audio waveform, debounce, and TTS
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const liveTranscriptRef = useRef<{ finalText: string; interimText: string }>({
    finalText: '',
    interimText: '',
  });
  const speechMetaRef = useRef<{
    srcCode: string;
    srcName: string;
    tgtCode: string;
    tgtName: string;
  } | null>(null);
  const sessionTranslatedRef = useRef<boolean>(false);
  const pulseIntervalRef = useRef<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Map<string, string>>(new Map());
  const textAbortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<number>(0);

  const resultCardRef = useRef<HTMLDivElement | null>(null);
  const textBoxRef = useRef<HTMLFormElement | null>(null);
  const modeStageRef = useRef<HTMLDivElement | null>(null);

  const sourceLang: InterpreterLanguage | null =
    sourceCode === 'auto' ? null : findLanguageByCode(sourceCode) ?? INTERPRETER_LANGUAGES[0];
  const targetLang: InterpreterLanguage =
    findLanguageByCode(targetCode) ?? INTERPRETER_LANGUAGES[2];

  const sourceDisplayName = sourceLang ? sourceLang.name : 'Auto-Detect';
  const sourceNativeName = sourceLang ? sourceLang.nativeName : 'Any of 50 languages';

  // Warm up browser speechSynthesis voices once on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    setSpeakingId(null);
  }, []);

  const cleanupRecording = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = 0;
    }
    if (pulseIntervalRef.current) {
      window.clearInterval(pulseIntervalRef.current);
      pulseIntervalRef.current = 0;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recognitionRef.current = null;
    mediaRecorderRef.current = null;
    setRecordingSide(null);
    setRecordSeconds(0);
    setAudioLevels(Array(15).fill(14));
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      textAbortRef.current?.abort();
      cleanupRecording();
      stopPlayback();
    };
  }, [cleanupRecording, stopPlayback]);

  const speakViaServerTts = useCallback(
    async (item: InterpreterHistoryItem) => {
      const cacheKey = `${item.targetLangCode}:${item.translatedText}`;
      const cachedDataUrl = ttsCacheRef.current.get(cacheKey);

      const playUrl = (dataUrl: string) => {
        const audio = new Audio(dataUrl);
        activeAudioRef.current = audio;
        setSpeakingId(item.id);
        audio.onended = () => {
          setSpeakingId((curr) => (curr === item.id ? null : curr));
          activeAudioRef.current = null;
        };
        audio.onerror = () => {
          setSpeakingId((curr) => (curr === item.id ? null : curr));
          activeAudioRef.current = null;
          showToast({ title: 'Audio playback blocked', description: 'Tap Listen to play again.' });
        };
        audio.play().catch(() => {
          setSpeakingId(null);
          activeAudioRef.current = null;
        });
      };

      if (cachedDataUrl) {
        playUrl(cachedDataUrl);
        return;
      }

      setLoadingTtsId(item.id);
      try {
        const res = await fetch('/api/interpreter/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: item.translatedText,
            languageName: item.targetLangName,
          }),
        });
        const data = (await res.json()) as {
          audioBase64?: string;
          mimeType?: string;
          error?: string;
        };
        if (!res.ok || !data.audioBase64) {
          throw new Error(data.error || 'Unable to synthesize speech.');
        }
        const dataUrl = `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`;
        ttsCacheRef.current.set(cacheKey, dataUrl);
        playUrl(dataUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Voice playback unavailable.';
        showToast({ title: 'Speech unavailable', description: message });
      } finally {
        setLoadingTtsId((curr) => (curr === item.id ? null : curr));
      }
    },
    [showToast]
  );

  const speakTranslation = useCallback(
    async (item: InterpreterHistoryItem) => {
      const spokenText = item.translatedText.trim();
      if (!spokenText) return;

      if (speakingId === item.id) {
        stopPlayback();
        triggerHaptic('light');
        return;
      }

      // Cancel any previous speechSynthesis queue or audio immediately for zero overlap/lag
      stopPlayback();
      triggerHaptic('selection');

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const synth = window.speechSynthesis;
        synth.cancel();

        const targetInfo = findLanguageByCode(item.targetLangCode);
        const targetLocale = targetInfo?.speechLocale || item.targetLangCode || 'en-US';
        const baseLang = targetLocale.split('-')[0].toLowerCase();

        const voices = synth.getVoices();
        const exactVoice = voices.find(
          (v) => v.lang.toLowerCase() === targetLocale.toLowerCase()
        );
        const prefixVoice = voices.find((v) =>
          v.lang.toLowerCase().startsWith(`${baseLang}-`) || v.lang.toLowerCase() === baseLang
        );
        const chosenVoice = exactVoice || prefixVoice || null;

        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.lang = chosenVoice?.lang || targetLocale;
        if (chosenVoice) utterance.voice = chosenVoice;
        utterance.rate = 1.0;

        setSpeakingId(item.id);
        utterance.onend = () => {
          setSpeakingId((curr) => (curr === item.id ? null : curr));
        };
        utterance.onerror = (ev) => {
          setSpeakingId((curr) => (curr === item.id ? null : curr));
          // Ignore intentional cancellations when a newer utterance interrupts the queue
          if (ev.error === 'canceled' || ev.error === 'interrupted') return;
          void speakViaServerTts(item);
        };

        synth.speak(utterance);
        return;
      }

      await speakViaServerTts(item);
    },
    [speakingId, stopPlayback, speakViaServerTts]
  );

  const commitTranslation = useCallback(
    (
      payload: {
        detectedLanguage: string;
        sourceText: string;
        translatedText: string;
        transliteration: string;
      },
      meta: {
        srcCode: string;
        srcName: string;
        tgtCode: string;
        tgtName: string;
        inputMode: 'voice' | 'text';
      },
      options?: { saveToHistory?: boolean; shouldSpeak?: boolean; shouldScroll?: boolean }
    ) => {
      const saveToHistory = options?.saveToHistory ?? true;
      const shouldSpeak = options?.shouldSpeak ?? autoSpeak;
      const shouldScroll = options?.shouldScroll ?? true;

      if (!payload.sourceText && !payload.translatedText) {
        setErrorMsg('No clear speech was detected. Try speaking a bit closer to the microphone.');
        triggerHaptic('warning');
        return;
      }

      const resolvedSourceName =
        meta.srcCode === 'auto' ? payload.detectedLanguage || 'Detected' : meta.srcName;

      let item: InterpreterHistoryItem;
      if (saveToHistory) {
        item = addInterpreterHistory({
          sourceLangCode: meta.srcCode,
          sourceLangName: resolvedSourceName,
          targetLangCode: meta.tgtCode,
          targetLangName: meta.tgtName,
          sourceText: payload.sourceText,
          translatedText: payload.translatedText,
          transliteration: payload.transliteration,
          inputMode: meta.inputMode,
        });
      } else {
        item = {
          id: `live-${meta.srcCode}-${meta.tgtCode}`,
          sourceLangCode: meta.srcCode,
          sourceLangName: resolvedSourceName,
          targetLangCode: meta.tgtCode,
          targetLangName: meta.tgtName,
          sourceText: payload.sourceText,
          translatedText: payload.translatedText,
          transliteration: payload.transliteration,
          inputMode: meta.inputMode,
          timestamp: Date.now(),
        };
      }

      setLatestResult(item);
      if (saveToHistory) {
        triggerHaptic('success');
      }
      if (shouldScroll) {
        autoScrollToElement(resultCardRef);
      }

      if (shouldSpeak) {
        void speakTranslation(item);
      }
    },
    [addInterpreterHistory, autoSpeak, speakTranslation]
  );

  const runFastTranslation = useCallback(
    async (
      text: string,
      meta: {
        srcCode: string;
        srcName: string;
        tgtCode: string;
        tgtName: string;
        inputMode: 'voice' | 'text';
      },
      options?: {
        saveToHistory?: boolean;
        shouldSpeak?: boolean;
        shouldScroll?: boolean;
        signal?: AbortSignal;
      }
    ) => {
      const clean = text.trim();
      if (!clean) return;

      // Instant synchronous cache path avoids even showing a spinner
      const instantHit = getCachedTranslation(meta.srcCode, meta.tgtCode, clean);
      if (instantHit) {
        setErrorMsg(null);
        commitTranslation(instantHit, meta, options);
        return;
      }

      setTranslating(true);
      setErrorMsg(null);
      try {
        const result = await translateFast({
          text: clean,
          sourceCode: meta.srcCode,
          sourceName: meta.srcName,
          targetCode: meta.tgtCode,
          targetName: meta.tgtName,
          signal: options?.signal,
        });
        if (options?.signal?.aborted) return;
        commitTranslation(result, meta, options);
      } catch (err) {
        if (options?.signal?.aborted) return;
        const msg = err instanceof Error ? err.message : 'Unable to translate right now.';
        setErrorMsg(msg);
        triggerHaptic('error');
      } finally {
        if (!options?.signal?.aborted) {
          setTranslating(false);
        }
      }
    },
    [commitTranslation]
  );

  const startMediaRecorderFallback = async (
    side: 'a' | 'b',
    meta: { srcCode: string; srcName: string; tgtCode: string; tgtName: string }
  ) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMsg(
        'Microphone recording is not supported in this browser. You can use Type Instead below.'
      );
      triggerHaptic('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelledRef.current = false;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const chosenMime = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime, audioBitsPerSecond: 24000 })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const recordedMime = recorder.mimeType || chosenMime || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedMime });
        chunksRef.current = [];
        const wasCancelled = cancelledRef.current;
        cleanupRecording();

        if (wasCancelled || blob.size < 400) {
          return;
        }

        setTranslating(true);
        setErrorMsg(null);
        try {
          const audioBase64 = await blobToBase64(blob);
          const res = await fetch('/api/interpreter/translate-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64,
              mimeType: recordedMime,
              sourceLanguageName: meta.srcName,
              targetLanguageName: meta.tgtName,
            }),
          });
          const data = (await res.json()) as {
            detectedLanguage?: string;
            sourceText?: string;
            translatedText?: string;
            transliteration?: string;
            error?: string;
          };
          if (!res.ok) {
            throw new Error(data.error || 'Voice translation failed.');
          }
          commitTranslation(
            {
              detectedLanguage: data.detectedLanguage || meta.srcName,
              sourceText: data.sourceText || '',
              translatedText: data.translatedText || '',
              transliteration: data.transliteration || '',
            },
            {
              ...meta,
              inputMode: 'voice',
            }
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unable to translate voice recording.';
          setErrorMsg(msg);
          triggerHaptic('error');
        } finally {
          setTranslating(false);
        }
      };

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const bins = new Uint8Array(analyser.frequencyBinCount);

        const updateBars = () => {
          if (!audioCtxRef.current) return;
          analyser.getByteFrequencyData(bins);
          const nextBars: number[] = [];
          for (let i = 0; i < 15; i++) {
            const sample = bins[Math.min(bins.length - 1, i + 1)] ?? 0;
            nextBars.push(Math.max(14, Math.min(100, Math.round((sample / 255) * 100))));
          }
          setAudioLevels(nextBars);
          rafRef.current = requestAnimationFrame(updateBars);
        };
        rafRef.current = requestAnimationFrame(updateBars);
      }

      recorder.start();
      setRecordingSide(side);
      setRecordSeconds(0);
      triggerHaptic('medium');

      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
    } catch {
      cleanupRecording();
      setErrorMsg(
        'Microphone access was denied or unavailable. Allow microphone permission or use Type Instead below.'
      );
      triggerHaptic('error');
    }
  };

  const startRecording = async (side: 'a' | 'b') => {
    setErrorMsg(null);
    setLiveTranscript('');
    stopPlayback();

    const activeSrcCode =
      mode === 'conversation'
        ? side === 'a'
          ? sourceCode === 'auto'
            ? 'en'
            : sourceCode
          : targetCode
        : sourceCode;
    const activeTgtCode =
      mode === 'conversation'
        ? side === 'a'
          ? targetCode
          : sourceCode === 'auto'
          ? 'en'
          : sourceCode
        : targetCode;

    const activeSrcInfo = activeSrcCode === 'auto' ? null : findLanguageByCode(activeSrcCode) ?? null;
    const activeSrcName = activeSrcCode === 'auto' ? 'Auto-Detect' : activeSrcInfo?.name ?? 'English';
    const activeTgtName = findLanguageByCode(activeTgtCode)?.name ?? 'Hindi';

    const meta = {
      srcCode: activeSrcCode,
      srcName: activeSrcName,
      tgtCode: activeTgtCode,
      tgtName: activeTgtName,
    };

    const SpeechRecognitionCtor = getSpeechRecognitionCtor();

    // Primary fast path: Live Web Speech Recognition with interimResults = true
    if (SpeechRecognitionCtor && activeSrcCode !== 'tcy') {
      try {
        const recognition = new SpeechRecognitionCtor();
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;
        recognition.lang = activeSrcInfo?.speechLocale || navigator.language || 'en-US';

        recognitionRef.current = recognition;
        speechMetaRef.current = meta;
        liveTranscriptRef.current = { finalText: '', interimText: '' };
        sessionTranslatedRef.current = false;
        cancelledRef.current = false;

        recognition.onresult = (event) => {
          let finalStr = '';
          let interimStr = '';
          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            const part = (res[0]?.transcript || '').trim();
            if (!part) continue;
            if (res.isFinal) {
              finalStr += (finalStr ? ' ' : '') + part;
            } else {
              interimStr += (interimStr ? ' ' : '') + part;
            }
          }

          liveTranscriptRef.current = {
            finalText: finalStr,
            interimText: interimStr,
          };

          const combined = [finalStr, interimStr].filter(Boolean).join(' ');
          setLiveTranscript(combined);

          // Pulse waveform bars responsively as words stream in
          setAudioLevels(
            Array.from({ length: 15 }, (_, idx) => {
              const centerWeight = 1 - Math.abs(idx - 7) / 9;
              return Math.round(28 + Math.random() * 68 * centerWeight);
            })
          );

          // Trigger translation immediately on final speech result with zero extra delay
          if (finalStr.trim() && !sessionTranslatedRef.current && !cancelledRef.current) {
            sessionTranslatedRef.current = true;
            try {
              recognition.stop();
            } catch {
              // ignore
            }
            cleanupRecording();
            void runFastTranslation(finalStr.trim(), { ...meta, inputMode: 'voice' });
          }
        };

        recognition.onerror = (event) => {
          if (cancelledRef.current || sessionTranslatedRef.current) return;

          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            cleanupRecording();
            setErrorMsg(
              'Microphone permission was denied. Allow microphone access or use Type Instead below.'
            );
            triggerHaptic('error');
            return;
          }

          if (event.error === 'language-not-supported' || event.error === 'network') {
            cleanupRecording();
            void startMediaRecorderFallback(side, meta);
            return;
          }

          if (event.error === 'no-speech') {
            cleanupRecording();
            setErrorMsg('No speech detected. Tap the mic and speak clearly.');
            triggerHaptic('warning');
            return;
          }

          if (event.error !== 'aborted') {
            cleanupRecording();
            void startMediaRecorderFallback(side, meta);
          }
        };

        recognition.onend = () => {
          const captured = (
            liveTranscriptRef.current.finalText || liveTranscriptRef.current.interimText
          ).trim();
          const wasCancelled = cancelledRef.current;
          const alreadyTranslated = sessionTranslatedRef.current;
          cleanupRecording();

          if (!wasCancelled && !alreadyTranslated && captured) {
            sessionTranslatedRef.current = true;
            void runFastTranslation(captured, { ...meta, inputMode: 'voice' });
          }
        };

        recognition.start();
        setRecordingSide(side);
        setRecordSeconds(0);
        triggerHaptic('medium');

        const startedAt = Date.now();
        timerRef.current = window.setInterval(() => {
          setRecordSeconds(Math.floor((Date.now() - startedAt) / 1000));
        }, 250);

        // Gentle live listening animation between speech bursts
        pulseIntervalRef.current = window.setInterval(() => {
          setAudioLevels((prev) =>
            prev.map((_, idx) => {
              const centerWeight = 1 - Math.abs(idx - 7) / 10;
              return Math.round(20 + Math.random() * 34 * centerWeight);
            })
          );
        }, 160);
        return;
      } catch {
        cleanupRecording();
      }
    }

    // Fallback for browsers without Web Speech API or Tulu voice input
    await startMediaRecorderFallback(side, meta);
  };

  const stopRecording = () => {
    triggerHaptic('light');

    // If live SpeechRecognition is active, translate immediately on stop without waiting for onend
    const recognition = recognitionRef.current;
    if (recognition) {
      const captured = (
        liveTranscriptRef.current.finalText || liveTranscriptRef.current.interimText
      ).trim();
      const meta = speechMetaRef.current;

      if (captured && meta && !sessionTranslatedRef.current && !cancelledRef.current) {
        sessionTranslatedRef.current = true;
        try {
          recognition.stop();
        } catch {
          // ignore
        }
        cleanupRecording();
        void runFastTranslation(captured, { ...meta, inputMode: 'voice' });
        return;
      }

      try {
        recognition.stop();
      } catch {
        cleanupRecording();
      }
      return;
    }

    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      cleanupRecording();
    }
  };

  const cancelRecording = () => {
    triggerHaptic('warning');
    cancelledRef.current = true;
    setLiveTranscript('');

    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        // ignore
      }
      cleanupRecording();
      return;
    }

    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      cleanupRecording();
    }
  };

  // 250ms debounced live auto-translation while typing in the Text Translator
  useEffect(() => {
    if (!showTextInput || mode !== 'single') return;
    const clean = typedText.trim();
    if (!clean) return;

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      textAbortRef.current?.abort();
      const controller = new AbortController();
      textAbortRef.current = controller;

      void runFastTranslation(
        clean,
        {
          srcCode: sourceCode,
          srcName: sourceDisplayName,
          tgtCode: targetLang.code,
          tgtName: targetLang.name,
          inputMode: 'text',
        },
        {
          saveToHistory: false,
          shouldSpeak: false,
          shouldScroll: false,
          signal: controller.signal,
        }
      );
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    typedText,
    sourceCode,
    sourceDisplayName,
    targetLang.code,
    targetLang.name,
    showTextInput,
    mode,
    runFastTranslation,
  ]);

  const handleTextTranslate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = typedText.trim();
    if (!clean) return;

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    textAbortRef.current?.abort();

    triggerHaptic('medium');
    await runFastTranslation(
      clean,
      {
        srcCode: sourceCode,
        srcName: sourceDisplayName,
        tgtCode: targetLang.code,
        tgtName: targetLang.name,
        inputMode: 'text',
      },
      {
        saveToHistory: true,
        shouldSpeak: autoSpeak,
        shouldScroll: true,
      }
    );
    setTypedText('');
  };

  const swapLanguages = () => {
    triggerHaptic('selection');
    if (sourceCode === 'auto') {
      setSourceCode(targetCode);
      setTargetCode('en');
    } else {
      const prevSrc = sourceCode;
      setSourceCode(targetCode);
      setTargetCode(prevSrc);
    }
  };

  const filteredLanguages = useMemo(() => {
    const q = langSearch.trim().toLowerCase();
    if (!q) return INTERPRETER_LANGUAGES;
    return INTERPRETER_LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.region.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [langSearch]);

  const handleCopy = (item: InterpreterHistoryItem) => {
    navigator.clipboard.writeText(item.translatedText);
    triggerHaptic('success');
    setCopiedId(item.id);
    showToast({ title: `Copied ${item.targetLangName} translation` });
    window.setTimeout(() => setCopiedId((curr) => (curr === item.id ? null : curr)), 1500);
  };

  const sendItemToAnki = (item: InterpreterHistoryItem) => {
    openNoteToAnki({
      sourceTitle: `${item.sourceLangName} → ${item.targetLangName}`,
      cards: [
        {
          front: item.sourceText,
          back: item.transliteration
            ? `${item.translatedText}\n(${item.transliteration})`
            : item.translatedText,
        },
      ],
    });
  };

  const convLangA = sourceCode === 'auto' ? INTERPRETER_LANGUAGES[0] : sourceLang ?? INTERPRETER_LANGUAGES[0];

  return (
    <div className="space-y-5">
      {/* Header & Mode Segmented Control */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Voice Interpreter
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Speak into your microphone to translate across 50 world & Indian regional languages
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-900/5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setMode('single');
                autoScrollToElement(modeStageRef);
              }}
              className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                mode === 'single' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setMode('conversation');
                autoScrollToElement(modeStageRef);
              }}
              className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                mode === 'conversation'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Conversation</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setAutoSpeak((v) => !v);
            }}
            className={`h-11 px-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${
              autoSpeak
                ? 'bg-[#007AFF]/12 border-[#007AFF]/25 text-[#007AFF]'
                : 'bg-white/75 border-white text-slate-600'
            }`}
            aria-label="Toggle automatic voice playback"
          >
            {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>Auto-Speak</span>
          </button>
        </div>
      </div>

      {/* Language Pair Picker Bar */}
      <div className="glass-panel rounded-3xl p-4 sm:p-5 space-y-3.5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setLangSearch('');
              setPickerSide('source');
            }}
            className="rounded-2xl bg-white/80 hover:bg-white border border-white px-4 py-3 text-left flex items-center justify-between gap-2 transition-all active:scale-[0.99]"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500">
                {mode === 'conversation' ? 'Speaker A' : 'Speak In'}
              </div>
              <div className="font-display font-bold text-sm sm:text-base text-slate-950 truncate">
                {mode === 'conversation' ? convLangA.name : sourceDisplayName}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {mode === 'conversation' ? convLangA.nativeName : sourceNativeName}
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={swapLanguages}
            className="w-11 h-11 rounded-2xl bg-white/85 hover:bg-white border border-white text-[#007AFF] flex items-center justify-center shadow-xs active:scale-90 transition-transform"
            aria-label="Swap languages"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setLangSearch('');
              setPickerSide('target');
            }}
            className="rounded-2xl bg-white/80 hover:bg-white border border-white px-4 py-3 text-left flex items-center justify-between gap-2 transition-all active:scale-[0.99]"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500">
                {mode === 'conversation' ? 'Speaker B' : 'Translate To'}
              </div>
              <div className="font-display font-bold text-sm sm:text-base text-[#007AFF] truncate">
                {targetLang.name}
              </div>
              <div className="text-xs text-slate-500 truncate">{targetLang.nativeName}</div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        </div>

        {/* Quick-Select Popular Target Languages */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
          <span className="text-[11px] font-medium text-slate-500 shrink-0 pr-1">Quick To:</span>
          {QUICK_TARGET_CODES.map((code) => {
            const lang = findLanguageByCode(code);
            if (!lang) return null;
            const active = targetCode === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setTargetCode(lang.code);
                }}
                className={`h-8 px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                  active
                    ? 'bg-[#007AFF] text-white shadow-xs shadow-[#007AFF]/20'
                    : 'bg-white/75 text-slate-700 hover:bg-white'
                }`}
              >
                {lang.name.replace(' (Mandarin)', '')}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setLangSearch('');
              setPickerSide('target');
            }}
            className="h-8 px-3 rounded-xl bg-slate-900/5 hover:bg-slate-900/10 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0"
          >
            All 50 →
          </button>
        </div>
      </div>

      {/* Microphone Capture Stage */}
      <div ref={modeStageRef} className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6">
        {mode === 'single' ? (
          <div className="flex flex-col items-center text-center space-y-5">
            {/* Live Audio Waveform Bars */}
            <div className="h-12 flex items-center justify-center gap-1.5" aria-hidden="true">
              {audioLevels.map((lvl, idx) => (
                <motion.span
                  key={idx}
                  animate={{
                    height: recordingSide ? `${Math.max(18, lvl)}%` : translating ? '45%' : '18%',
                    opacity: recordingSide ? 1 : translating ? 0.65 : 0.3,
                  }}
                  transition={{ duration: 0.08 }}
                  className={`w-1.5 rounded-full ${
                    recordingSide ? 'bg-rose-500' : 'bg-[#007AFF]'
                  }`}
                />
              ))}
            </div>

            {/* Central Tactile Liquid Glass Mic Button */}
            <div className="relative flex items-center justify-center">
              {recordingSide && (
                <motion.span
                  initial={{ scale: 0.9, opacity: 0.55 }}
                  animate={{ scale: 1.4, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.35, ease: 'easeOut' }}
                  className="absolute inset-0 rounded-full bg-rose-500/35 pointer-events-none"
                />
              )}

              <button
                type="button"
                disabled={translating}
                onClick={() => {
                  if (recordingSide) stopRecording();
                  else startRecording('a');
                }}
                aria-label={recordingSide ? 'Stop listening and translate' : 'Tap to speak'}
                className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center shadow-xl transition-all active:scale-95 disabled:opacity-60 ${
                  recordingSide
                    ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-rose-500/30 ring-4 ring-rose-200'
                    : 'bg-gradient-to-br from-[#007AFF] via-[#2596FF] to-[#5856D6] text-white shadow-[#007AFF]/30 ring-4 ring-white/80 hover:brightness-105'
                }`}
              >
                {translating ? (
                  <Loader2 className="w-10 h-10 animate-spin" />
                ) : recordingSide ? (
                  <Square className="w-9 h-9 fill-white" />
                ) : (
                  <Mic className="w-11 h-11" />
                )}
              </button>
            </div>

            <div className="space-y-1.5 max-w-lg">
              <div className="font-display text-lg font-bold text-slate-900">
                {translating
                  ? `Translating to ${targetLang.name}…`
                  : recordingSide
                  ? `Listening… ${formatTimer(recordSeconds)}`
                  : `Tap to Speak (${sourceDisplayName})`}
              </div>
              {recordingSide && liveTranscript ? (
                <div className="rounded-2xl bg-white/80 border border-white px-4 py-2 text-sm font-medium text-slate-900 shadow-xs">
                  “{liveTranscript}”
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {recordingSide
                    ? 'Speak naturally—translates automatically when you finish or tap stop'
                    : `Translates straight into ${targetLang.name} (${targetLang.nativeName})`}
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-2.5">
              {recordingSide && (
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="h-9 px-4 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
              )}

              {!recordingSide && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setShowTextInput((v) => {
                      const next = !v;
                      if (next) autoScrollToElement(textBoxRef);
                      return next;
                    });
                  }}
                  className="h-9 px-4 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 active:scale-95"
                >
                  <Keyboard className="w-3.5 h-3.5 text-[#007AFF]" />
                  <span>{showTextInput ? 'Hide Keyboard' : 'Type Instead'}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Two-Way Conversation Mode */
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <div className="font-display text-base font-bold text-slate-900">
                Two-Way Live Conversation
              </div>
              <p className="text-xs text-slate-500">
                Tap either speaker button to listen and translate into the other language
              </p>
            </div>

            {recordingSide && (
              <div className="flex flex-col items-center gap-2">
                <div className="h-10 flex items-center justify-center gap-1.5">
                  {audioLevels.map((lvl, idx) => (
                    <motion.span
                      key={idx}
                      animate={{ height: `${Math.max(20, lvl)}%` }}
                      transition={{ duration: 0.08 }}
                      className="w-1.5 rounded-full bg-rose-500"
                    />
                  ))}
                </div>
                <span className="font-mono tabular-nums text-xs font-semibold text-rose-600">
                  Recording {formatTimer(recordSeconds)} · Tap active button to translate
                </span>
                {liveTranscript && (
                  <div className="max-w-lg rounded-2xl bg-white/80 border border-white px-4 py-2 text-sm font-medium text-slate-900 text-center shadow-xs">
                    “{liveTranscript}”
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                disabled={translating || recordingSide === 'b'}
                onClick={() => {
                  if (recordingSide === 'a') stopRecording();
                  else startRecording('a');
                }}
                className={`rounded-3xl p-6 text-left flex items-center justify-between gap-4 border transition-all active:scale-[0.98] disabled:opacity-50 ${
                  recordingSide === 'a'
                    ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/25'
                    : 'bg-white/85 hover:bg-white border-white text-slate-900'
                }`}
              >
                <div className="min-w-0">
                  <div
                    className={`text-xs font-medium ${
                      recordingSide === 'a' ? 'text-rose-100' : 'text-slate-500'
                    }`}
                  >
                    Speak → {targetLang.name}
                  </div>
                  <div className="font-display text-xl font-bold truncate mt-0.5">
                    {convLangA.name}
                  </div>
                  <div
                    className={`text-xs truncate ${
                      recordingSide === 'a' ? 'text-rose-100' : 'text-slate-500'
                    }`}
                  >
                    {convLangA.nativeName}
                  </div>
                </div>
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                    recordingSide === 'a'
                      ? 'bg-white/20 text-white'
                      : 'bg-[#007AFF] text-white shadow-sm shadow-[#007AFF]/25'
                  }`}
                >
                  {recordingSide === 'a' ? (
                    <Square className="w-6 h-6 fill-white" />
                  ) : translating ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )}
                </div>
              </button>

              <button
                type="button"
                disabled={translating || recordingSide === 'a'}
                onClick={() => {
                  if (recordingSide === 'b') stopRecording();
                  else startRecording('b');
                }}
                className={`rounded-3xl p-6 text-left flex items-center justify-between gap-4 border transition-all active:scale-[0.98] disabled:opacity-50 ${
                  recordingSide === 'b'
                    ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/25'
                    : 'bg-white/85 hover:bg-white border-white text-slate-900'
                }`}
              >
                <div className="min-w-0">
                  <div
                    className={`text-xs font-medium ${
                      recordingSide === 'b' ? 'text-rose-100' : 'text-slate-500'
                    }`}
                  >
                    Speak → {convLangA.name}
                  </div>
                  <div className="font-display text-xl font-bold truncate mt-0.5">
                    {targetLang.name}
                  </div>
                  <div
                    className={`text-xs truncate ${
                      recordingSide === 'b' ? 'text-rose-100' : 'text-slate-500'
                    }`}
                  >
                    {targetLang.nativeName}
                  </div>
                </div>
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                    recordingSide === 'b'
                      ? 'bg-white/20 text-white'
                      : 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/25'
                  }`}
                >
                  {recordingSide === 'b' ? (
                    <Square className="w-6 h-6 fill-white" />
                  ) : translating ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )}
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Optional Type-to-Translate Input */}
        {showTextInput && mode === 'single' && (
          <form
            ref={textBoxRef}
            onSubmit={handleTextTranslate}
            className="pt-4 border-t border-slate-200/70 space-y-3"
          >
            <textarea
              rows={3}
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={`Type anything in ${sourceDisplayName} to translate into ${targetLang.name}…`}
              className="w-full p-4 rounded-2xl glass-input text-sm text-slate-900 resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                Translates automatically as you type
              </span>
              <button
                type="submit"
                disabled={!typedText.trim()}
                className="h-10 px-5 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 active:scale-95"
              >
                {translating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Translate to {targetLang.name}</span>
              </button>
            </div>
          </form>
        )}

        {errorMsg && (
          <div className="rounded-2xl bg-rose-500/12 border border-rose-200/80 px-4 py-3 text-xs font-medium text-rose-800">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Latest Translation Result Card */}
      {latestResult && (
        <div
          ref={resultCardRef}
          className="glass-panel-strong rounded-3xl p-5 sm:p-7 space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white/75 border border-white p-4 space-y-1.5">
              <div className="text-xs font-semibold text-slate-500">
                {latestResult.sourceLangName}
              </div>
              <p className="text-base sm:text-lg font-medium text-slate-900 leading-relaxed whitespace-pre-wrap">
                {latestResult.sourceText}
              </p>
            </div>

            <div className="rounded-2xl bg-[#007AFF]/[0.07] border border-[#007AFF]/20 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#007AFF]">
                  {latestResult.targetLangName}
                </span>
                <button
                  type="button"
                  onClick={() => speakTranslation(latestResult)}
                  disabled={loadingTtsId === latestResult.id}
                  className="h-8 px-3 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-60"
                >
                  {loadingTtsId === latestResult.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : speakingId === latestResult.id ? (
                    <Square className="w-3 h-3 fill-white" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {loadingTtsId === latestResult.id
                      ? 'Loading…'
                      : speakingId === latestResult.id
                      ? 'Stop'
                      : 'Listen'}
                  </span>
                </button>
              </div>

              <p className="font-display text-xl sm:text-2xl font-bold text-slate-950 leading-snug whitespace-pre-wrap">
                {latestResult.translatedText}
              </p>

              {latestResult.transliteration && (
                <p className="text-xs sm:text-sm text-slate-600 font-medium pt-1 border-t border-slate-200/70">
                  Pronunciation: <span className="text-slate-900">{latestResult.transliteration}</span>
                </p>
              )}
            </div>
          </div>

          {/* Cross-Tool Integration Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/70">
            <button
              type="button"
              onClick={() => handleCopy(latestResult)}
              className="h-9 px-3.5 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-800 flex items-center gap-1.5 active:scale-95"
            >
              {copiedId === latestResult.id ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedId === latestResult.id ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={() => sendItemToAnki(latestResult)}
              className="h-9 px-3.5 rounded-xl bg-indigo-500/12 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-700 flex items-center gap-1.5 active:scale-95"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Save as Anki Card</span>
            </button>

            <button
              type="button"
              onClick={() =>
                createNoteFromPayload(
                  `${latestResult.sourceLangName} → ${latestResult.targetLangName}`,
                  `${latestResult.sourceText}\n\n${latestResult.translatedText}${
                    latestResult.transliteration ? `\n(${latestResult.transliteration})` : ''
                  }`,
                  'Unfiled'
                )
              }
              className="h-9 px-3.5 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 active:scale-95"
            >
              <NotebookPen className="w-3.5 h-3.5" />
              <span>Save Note</span>
            </button>

            <button
              type="button"
              onClick={() =>
                sendToQr(latestResult.translatedText, 'text', latestResult.targetLangName)
              }
              className="h-9 px-3.5 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-[#007AFF] flex items-center gap-1.5 active:scale-95"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>To QR</span>
            </button>
          </div>
        </div>
      )}

      {/* Saved Translation History */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Recent Interpretations</h2>
            <p className="text-xs text-slate-500">
              Saved locally for instant replay or flashcard study
            </p>
          </div>
          {state.interpreterHistory.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearInterpreterHistory();
                setLatestResult(null);
              }}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          )}
        </div>

        {state.interpreterHistory.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Tap the microphone above and speak in any language—your translations will appear here.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70">
            {state.interpreterHistory.map((item) => (
              <div
                key={item.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                    <span className="font-semibold text-slate-700">{item.sourceLangName}</span>
                    <span>→</span>
                    <span className="font-semibold text-[#007AFF]">{item.targetLangName}</span>
                    <span>·</span>
                    <span className="font-mono">
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">{item.sourceText}</div>
                  <div className="text-sm sm:text-base font-semibold text-slate-950">
                    {item.translatedText}
                  </div>
                  {item.transliteration && (
                    <div className="text-xs text-slate-500">{item.transliteration}</div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => speakTranslation(item)}
                    disabled={loadingTtsId === item.id}
                    className="h-9 px-3 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-[#007AFF] flex items-center gap-1"
                    aria-label="Play audio"
                  >
                    {loadingTtsId === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : speakingId === item.id ? (
                      <Square className="w-3 h-3 fill-[#007AFF]" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                    <span>{speakingId === item.id ? 'Stop' : 'Speak'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => sendItemToAnki(item)}
                    className="h-9 w-9 rounded-xl bg-white/80 hover:bg-white border border-white text-indigo-600 flex items-center justify-center"
                    aria-label="Create Anki card"
                  >
                    <Layers className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(item)}
                    className="h-9 w-9 rounded-xl bg-white/80 hover:bg-white border border-white text-slate-600 flex items-center justify-center"
                    aria-label="Copy translation"
                  >
                    {copiedId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteInterpreterHistory(item.id)}
                    className="h-9 w-9 rounded-xl bg-white/80 hover:bg-rose-50 border border-white text-slate-400 hover:text-rose-600 flex items-center justify-center"
                    aria-label="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 50-Language Searchable Picker Modal */}
      <AnimatePresence>
        {pickerSide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPickerSide(null)}
            className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg glass-panel-strong rounded-3xl overflow-hidden flex flex-col max-h-[82vh]"
            >
              <div className="px-5 py-4 border-b border-slate-200/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Languages className="w-5 h-5 text-[#007AFF]" />
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    {pickerSide === 'source'
                      ? 'Choose Spoken Language (50)'
                      : 'Choose Target Language (50)'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerSide(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800"
                  aria-label="Close language picker"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 border-b border-slate-200/60">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    autoFocus
                    type="text"
                    value={langSearch}
                    onChange={(e) => setLangSearch(e.target.value)}
                    placeholder="Search English, Chinese, Hindi, Marathi, Tulu, Telugu…"
                    className="w-full h-10 pl-10 pr-4 rounded-xl glass-input text-sm"
                  />
                </div>
              </div>

              <div className="overflow-y-auto p-3 space-y-1">
                {pickerSide === 'source' && mode === 'single' && !langSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setSourceCode('auto');
                      setPickerSide(null);
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between text-left transition-colors ${
                      sourceCode === 'auto'
                        ? 'bg-[#007AFF] text-white'
                        : 'hover:bg-white/85 text-slate-900'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold">Auto-Detect Language</div>
                      <div
                        className={`text-xs ${
                          sourceCode === 'auto' ? 'text-sky-100' : 'text-slate-500'
                        }`}
                      >
                        Automatically identifies whichever of the 50 languages you speak
                      </div>
                    </div>
                    {sourceCode === 'auto' && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                )}

                {filteredLanguages.map((lang) => {
                  const selected =
                    pickerSide === 'source' ? sourceCode === lang.code : targetCode === lang.code;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        if (pickerSide === 'source') {
                          setSourceCode(lang.code);
                        } else {
                          setTargetCode(lang.code);
                        }
                        setPickerSide(null);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between text-left transition-colors ${
                        selected
                          ? 'bg-[#007AFF] text-white'
                          : 'hover:bg-white/85 text-slate-900'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{lang.name}</div>
                        <div
                          className={`text-xs truncate ${
                            selected ? 'text-sky-100' : 'text-slate-500'
                          }`}
                        >
                          {lang.nativeName} · {lang.region}
                        </div>
                      </div>
                      {selected && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}

                {filteredLanguages.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-500">
                    No language matched "{langSearch}".
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
