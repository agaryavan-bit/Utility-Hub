import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Flag,
  NotebookPen,
  Pause,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useHub } from '../../../context/HubContext';
import { autoScrollToElement } from '../../../utils/autoScroll';
import { triggerHaptic } from '../../../utils/haptics';

function formatStopwatch(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/* ==================== GENERAL TOOLS ==================== */

const StopwatchTool: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const startRef = useRef<number>(0);
  const lapsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!running) return;
    startRef.current = performance.now() - elapsed;
    let raf = 0;
    const tick = (now: number) => {
      setElapsed(now - startRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const handleToggle = () => {
    triggerHaptic(running ? 'light' : 'medium');
    setRunning((r) => !r);
  };

  const handleLap = () => {
    if (elapsed === 0) return;
    triggerHaptic('selection');
    setLaps((prev) => [elapsed, ...prev]);
    autoScrollToElement(lapsRef, { align: 'bottom' });
  };

  const handleReset = () => {
    triggerHaptic('warning');
    setRunning(false);
    setElapsed(0);
    setLaps([]);
  };

  return (
    <div className="space-y-6">
      <div className="text-center py-6">
        <div className="font-mono tabular-nums text-5xl sm:text-6xl font-semibold tracking-tight text-slate-900">
          {formatStopwatch(elapsed)}
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleToggle}
            className="h-12 px-7 rounded-2xl bg-[#007AFF] hover:bg-[#0062CC] text-white font-semibold text-sm flex items-center gap-2 shadow-md shadow-[#007AFF]/20 transition-all active:scale-95"
          >
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}</span>
          </button>
          <button
            type="button"
            onClick={handleLap}
            disabled={elapsed === 0}
            className="h-12 px-5 rounded-2xl bg-white/80 hover:bg-white border border-white text-slate-800 font-medium text-sm flex items-center gap-2 disabled:opacity-40 transition-all active:scale-95"
          >
            <Flag className="w-4 h-4" />
            <span>Lap</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={elapsed === 0 && laps.length === 0}
            className="h-12 w-12 rounded-2xl bg-white/75 hover:bg-white border border-white text-slate-600 flex items-center justify-center disabled:opacity-40 transition-all active:scale-95"
            aria-label="Reset stopwatch"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {laps.length > 0 && (
        <div ref={lapsRef} className="border-t border-slate-200/70 pt-4 max-h-60 overflow-y-auto divide-y divide-slate-200/60">
          {laps.map((lapMs, idx) => {
            const prev = laps[idx + 1] ?? 0;
            const split = lapMs - prev;
            return (
              <div key={idx} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-slate-500 font-medium">Lap {laps.length - idx}</span>
                <div className="flex items-center gap-6 font-mono tabular-nums">
                  <span className="text-slate-500 text-xs">+{formatStopwatch(split)}</span>
                  <span className="text-slate-900 font-semibold">{formatStopwatch(lapMs)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PomodoroTool: React.FC = () => {
  const { showToast } = useHub();
  const [mode, setMode] = useState<'focus' | 'short' | 'long'>('focus');
  const durations = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  const [remaining, setRemaining] = useState(durations.focus);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setRunning(false);
          triggerHaptic('success');
          if (mode === 'focus') setSessions((s) => s + 1);
          showToast({
            title: mode === 'focus' ? 'Focus block complete' : 'Break finished',
            description: 'Ready for your next Pomodoro interval.',
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, mode, showToast]);

  const switchMode = (next: 'focus' | 'short' | 'long') => {
    triggerHaptic('selection');
    setMode(next);
    setRunning(false);
    setRemaining(durations[next]);
  };

  const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
  const secs = String(remaining % 60).padStart(2, '0');
  const pct = 100 - (remaining / durations[mode]) * 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-1 p-1 rounded-2xl bg-slate-900/5 w-fit mx-auto">
        {([
          { id: 'focus', label: 'Focus 25m' },
          { id: 'short', label: 'Short 5m' },
          { id: 'long', label: 'Long 15m' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchMode(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              mode === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center py-4">
        <div className="relative w-52 h-52 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="7" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={mode === 'focus' ? '#007AFF' : '#10B981'}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 52}
              strokeDashoffset={2 * Math.PI * 52 * (1 - pct / 100)}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono tabular-nums text-4xl font-semibold text-slate-900">
              {mins}:{secs}
            </span>
            <span className="text-xs text-slate-500 mt-1">
              {sessions} {sessions === 1 ? 'session' : 'sessions'} today
            </span>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              if (remaining === 0) setRemaining(durations[mode]);
              setRunning((r) => !r);
            }}
            className="h-11 px-7 rounded-2xl bg-[#007AFF] hover:bg-[#0062CC] text-white font-semibold text-sm flex items-center gap-2 shadow-md shadow-[#007AFF]/20 active:scale-95 transition-all"
          >
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{running ? 'Pause' : 'Start Focus'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setRunning(false);
              setRemaining(durations[mode]);
            }}
            className="h-11 px-4 rounded-2xl bg-white/80 hover:bg-white border border-white text-slate-700 text-sm font-medium active:scale-95 transition-all"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

const WORLD_ZONES = [
  { city: 'San Francisco', tz: 'America/Los_Angeles' },
  { city: 'New York', tz: 'America/New_York' },
  { city: 'London', tz: 'Europe/London' },
  { city: 'Paris', tz: 'Europe/Paris' },
  { city: 'Dubai', tz: 'Asia/Dubai' },
  { city: 'Mumbai', tz: 'Asia/Kolkata' },
  { city: 'Singapore', tz: 'Asia/Singapore' },
  { city: 'Tokyo', tz: 'Asia/Tokyo' },
  { city: 'Sydney', tz: 'Australia/Sydney' },
];

const WorldClockTool: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  const [use24h, setUse24h] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Synchronized live clocks across major hubs</p>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection');
            setUse24h((v) => !v);
          }}
          className="px-3.5 py-1.5 rounded-xl bg-white/80 border border-white text-xs font-semibold text-slate-700 hover:bg-white transition-colors"
        >
          {use24h ? '24-Hour' : '12-Hour'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {WORLD_ZONES.map((z) => {
          const timeStr = new Intl.DateTimeFormat('en-US', {
            timeZone: z.tz,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: !use24h,
          }).format(now);
          const dayStr = new Intl.DateTimeFormat('en-US', {
            timeZone: z.tz,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }).format(now);
          return (
            <div key={z.tz} className="rounded-2xl bg-white/60 border border-white/90 p-4 flex flex-col justify-between">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display font-semibold text-slate-900">{z.city}</span>
                <span className="text-xs text-slate-500">{dayStr}</span>
              </div>
              <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-900">{timeStr}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TallyCounterTool: React.FC = () => {
  const [counters, setCounters] = useState<{ id: string; label: string; count: number; step: number }[]>([]);
  const [newName, setNewName] = useState('');
  const countersGridRef = useRef<HTMLDivElement | null>(null);

  const adjust = (id: string, delta: number) => {
    triggerHaptic(delta > 0 ? 'light' : 'selection');
    setCounters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, count: Math.max(0, c.count + delta * c.step) } : c))
    );
  };

  const addCounter = () => {
    if (!newName.trim()) return;
    triggerHaptic('medium');
    setCounters((prev) => [...prev, { id: String(Date.now()), label: newName.trim(), count: 0, step: 1 }]);
    setNewName('');
    autoScrollToElement(countersGridRef, { align: 'bottom' });
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCounter()}
          placeholder="New counter label (e.g. Pages Read)…"
          className="flex-1 h-11 px-4 rounded-xl glass-input text-sm text-slate-900"
        />
        <button
          type="button"
          onClick={addCounter}
          className="h-11 px-4 rounded-xl bg-[#007AFF] text-white text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-transform whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add</span>
        </button>
      </div>

      {counters.length === 0 ? (
        <div className="rounded-2xl bg-white/55 border border-white p-8 text-center text-sm text-slate-500">
          Add a counter label above to start tallying.
        </div>
      ) : (
        <div ref={countersGridRef} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {counters.map((c) => (
            <div key={c.id} className="rounded-2xl bg-white/65 border border-white/90 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold text-slate-900 truncate">{c.label}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setCounters((prev) => prev.map((x) => (x.id === c.id ? { ...x, count: 0 } : x)));
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:bg-white/80"
                    aria-label="Reset counter"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('warning');
                      setCounters((prev) => prev.filter((x) => x.id !== c.id));
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-white/80"
                    aria-label="Delete counter"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => adjust(c.id, -1)}
                  className="w-12 h-12 rounded-2xl bg-white/90 border border-slate-200/70 text-xl font-semibold text-slate-700 hover:bg-white active:scale-90 transition-transform"
                >
                  −
                </button>
                <span className="font-mono tabular-nums text-4xl font-bold text-slate-900">{c.count}</span>
                <button
                  type="button"
                  onClick={() => adjust(c.id, 1)}
                  className="w-12 h-12 rounded-2xl bg-[#007AFF] text-white text-xl font-semibold shadow-sm shadow-[#007AFF]/25 hover:bg-[#0062CC] active:scale-90 transition-transform"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AspectRatioTool: React.FC = () => {
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [targetW, setTargetW] = useState(1280);

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = width > 0 && height > 0 ? gcd(Math.round(width), Math.round(height)) : 1;
  const ratioW = Math.round(width / divisor);
  const ratioH = Math.round(height / divisor);
  const scaledH = width > 0 ? Math.round((targetW * height) / width) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Original Width (px)</label>
          <input
            type="number"
            min={1}
            value={width}
            onChange={(e) => setWidth(Math.max(1, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Original Height (px)</label>
          <input
            type="number"
            min={1}
            value={height}
            onChange={(e) => setHeight(Math.max(1, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { label: '16:9 FHD', w: 1920, h: 1080 },
          { label: '4:3 Classic', w: 1600, h: 1200 },
          { label: '1:1 Square', w: 1080, h: 1080 },
          { label: '9:16 Vertical', w: 1080, h: 1920 },
          { label: '21:9 Cinema', w: 2560, h: 1080 },
        ].map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setWidth(p.w);
              setHeight(p.h);
            }}
            className="px-3 py-1.5 rounded-xl bg-white/75 hover:bg-white border border-white text-xs font-medium text-slate-700"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/70">
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">Simplified Ratio</div>
          <div className="mt-1 font-mono tabular-nums text-3xl font-bold text-slate-900">
            {ratioW}:{ratioH}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Decimal: {(width / height).toFixed(3)}
          </div>
        </div>

        <div className="rounded-2xl bg-white/65 border border-white p-4 space-y-2">
          <label className="block text-xs text-slate-500">Scale to Target Width (px)</label>
          <input
            type="number"
            min={1}
            value={targetW}
            onChange={(e) => setTargetW(Math.max(1, Number(e.target.value)))}
            className="w-full h-10 px-3 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
          <div className="text-sm font-medium text-slate-800 font-mono tabular-nums">
            Scaled size: {targetW} × {scaledH} px
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==================== TEXT TOOLS ==================== */

const TextCrossToolActions: React.FC<{ text: string; title: string }> = ({ text, title }) => {
  const { sendToQr, createNoteFromPayload, showToast } = useHub();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    triggerHaptic('success');
    setCopied(true);
    showToast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        disabled={!text}
        className="h-9 px-3.5 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-800 flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <button
        type="button"
        onClick={() => sendToQr(text, 'text', title)}
        disabled={!text}
        className="h-9 px-3.5 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-[#007AFF] flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all"
      >
        <QrCode className="w-3.5 h-3.5" />
        <span>To QR</span>
      </button>
      <button
        type="button"
        onClick={() => createNoteFromPayload(title, text, 'Personal')}
        disabled={!text}
        className="h-9 px-3.5 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all"
      >
        <NotebookPen className="w-3.5 h-3.5" />
        <span>Save Note</span>
      </button>
    </div>
  );
};

const CaseConverterTool: React.FC = () => {
  const [text, setText] = useState('');

  const transform = (fn: (s: string) => string) => {
    triggerHaptic('selection');
    setText((prev) => fn(prev));
  };

  const toWords = (s: string) =>
    s
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  return (
    <div className="space-y-4">
      <textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste or type text to convert…"
        className="w-full p-4 rounded-2xl glass-input text-sm text-slate-900 leading-relaxed resize-y"
      />
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'UPPERCASE', fn: (s: string) => s.toUpperCase() },
          { label: 'lowercase', fn: (s: string) => s.toLowerCase() },
          {
            label: 'Title Case',
            fn: (s: string) =>
              s.toLowerCase().replace(/(^|\s)\S/g, (t) => t.toUpperCase()),
          },
          {
            label: 'Sentence case',
            fn: (s: string) =>
              s.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase()),
          },
          {
            label: 'camelCase',
            fn: (s: string) =>
              toWords(s)
                .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
                .join(''),
          },
          {
            label: 'snake_case',
            fn: (s: string) => toWords(s).map((w) => w.toLowerCase()).join('_'),
          },
          {
            label: 'kebab-case',
            fn: (s: string) => toWords(s).map((w) => w.toLowerCase()).join('-'),
          },
        ].map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={() => transform(btn.fn)}
            className="h-9 px-3.5 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-800 active:scale-95 transition-all"
          >
            {btn.label}
          </button>
        ))}
      </div>
      <TextCrossToolActions text={text} title="Converted Text" />
    </div>
  );
};

const WordCounterTool: React.FC = () => {
  const [text, setText] = useState('');

  const stats = useMemo(() => {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    const sentences = trimmed ? trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0).length : 0;
    const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length : 0;
    const readMin = Math.max(1, Math.ceil(words / 225));
    return { words, chars, charsNoSpace, sentences, paragraphs, readMin };
  }, [text]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          { label: 'Words', value: stats.words },
          { label: 'Characters', value: stats.chars },
          { label: 'No Spaces', value: stats.charsNoSpace },
          { label: 'Sentences', value: stats.sentences },
          { label: 'Paragraphs', value: stats.paragraphs },
          { label: 'Read Time', value: `${stats.readMin}m` },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl bg-white/65 border border-white p-3.5">
            <div className="text-xs text-slate-500">{item.label}</div>
            <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-900">{item.value}</div>
          </div>
        ))}
      </div>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type or paste content to analyze…"
        className="w-full p-4 rounded-2xl glass-input text-sm text-slate-900 leading-relaxed"
      />
      <TextCrossToolActions text={text} title="Text Draft" />
    </div>
  );
};

const LineSorterTool: React.FC = () => {
  const [text, setText] = useState('');

  const applyLines = (fn: (lines: string[]) => string[]) => {
    triggerHaptic('selection');
    setText((prev) => fn(prev.split('\n')).join('\n'));
  };

  return (
    <div className="space-y-4">
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full p-4 rounded-2xl glass-input font-mono text-sm text-slate-900"
      />
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Sort A → Z', fn: (l: string[]) => [...l].sort((a, b) => a.localeCompare(b)) },
          { label: 'Sort Z → A', fn: (l: string[]) => [...l].sort((a, b) => b.localeCompare(a)) },
          { label: 'Remove Duplicates', fn: (l: string[]) => Array.from(new Set(l)) },
          { label: 'Remove Empty', fn: (l: string[]) => l.filter((x) => x.trim().length > 0) },
          { label: 'Trim Lines', fn: (l: string[]) => l.map((x) => x.trim()) },
          { label: 'Reverse Order', fn: (l: string[]) => [...l].reverse() },
        ].map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => applyLines(a.fn)}
            className="h-9 px-3.5 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-800 active:scale-95 transition-all"
          >
            {a.label}
          </button>
        ))}
      </div>
      <TextCrossToolActions text={text} title="Cleaned List" />
    </div>
  );
};

const FindReplaceTool: React.FC = () => {
  const [text, setText] = useState('');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  const matchCount = useMemo(() => {
    if (!find) return 0;
    try {
      const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
      return (text.match(regex) ?? []).length;
    } catch {
      return 0;
    }
  }, [text, find, caseSensitive]);

  const handleReplaceAll = () => {
    if (!find) return;
    triggerHaptic('medium');
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
    setText((prev) => prev.replace(regex, replace));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Find…"
          className="h-11 px-4 rounded-xl glass-input text-sm"
        />
        <input
          type="text"
          value={replace}
          onChange={(e) => setReplace(e.target.value)}
          placeholder="Replace with…"
          className="h-11 px-4 rounded-xl glass-input text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="rounded accent-[#007AFF]"
          />
          <span>Case sensitive</span>
          <span className="text-slate-400">·</span>
          <span className="font-mono tabular-nums text-slate-600">{matchCount} matches</span>
        </label>
        <button
          type="button"
          onClick={handleReplaceAll}
          disabled={matchCount === 0}
          className="h-9 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-semibold disabled:opacity-40 active:scale-95 transition-all"
        >
          Replace All
        </button>
      </div>
      <textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full p-4 rounded-2xl glass-input text-sm"
      />
      <TextCrossToolActions text={text} title="Edited Text" />
    </div>
  );
};

const LOREM_SENTENCES = [
  'Translucent surfaces soften visual noise while keeping every primary control within effortless thumb reach.',
  'Crafted typography and balanced whitespace turn routine utilities into a focused daily workspace.',
  'Modular converters, timers, and flashcard decks share context smoothly without forcing constant app switching.',
  'Crisp specular edges reflect ambient light across frosted layers while preserving clear text legibility.',
  'Local-first persistence guarantees instant startup and dependable offline access wherever work happens.',
  'Responsive spring physics give each tap and transition a calm, physical sense of responsiveness.',
];

const LoremIpsumTool: React.FC = () => {
  const [paragraphs, setParagraphs] = useState(3);
  const generated = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < paragraphs; i++) {
      const slice = [
        LOREM_SENTENCES[i % LOREM_SENTENCES.length],
        LOREM_SENTENCES[(i + 2) % LOREM_SENTENCES.length],
        LOREM_SENTENCES[(i + 4) % LOREM_SENTENCES.length],
      ].join(' ');
      out.push(slice);
    }
    return out.join('\n\n');
  }, [paragraphs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-medium text-slate-700">
          Paragraphs: <span className="font-mono tabular-nums font-bold">{paragraphs}</span>
        </label>
        <input
          type="range"
          min={1}
          max={8}
          value={paragraphs}
          onChange={(e) => {
            triggerHaptic('selection');
            setParagraphs(Number(e.target.value));
          }}
          className="w-48 accent-[#007AFF]"
        />
      </div>
      <textarea
        rows={7}
        readOnly
        value={generated}
        className="w-full p-4 rounded-2xl glass-input text-sm text-slate-800 leading-relaxed"
      />
      <TextCrossToolActions text={generated} title="Placeholder Copy" />
    </div>
  );
};

export const GeneralAndTextTools: React.FC<{ subToolId: string }> = ({ subToolId }) => {
  switch (subToolId) {
    case 'gen-stopwatch':
      return <StopwatchTool />;
    case 'gen-pomodoro':
      return <PomodoroTool />;
    case 'gen-worldclock':
      return <WorldClockTool />;
    case 'gen-tally':
      return <TallyCounterTool />;
    case 'gen-aspect':
      return <AspectRatioTool />;
    case 'txt-case':
      return <CaseConverterTool />;
    case 'txt-counter':
      return <WordCounterTool />;
    case 'txt-lines':
      return <LineSorterTool />;
    case 'txt-replace':
      return <FindReplaceTool />;
    case 'txt-lorem':
      return <LoremIpsumTool />;
    default:
      return <StopwatchTool />;
  }
};
