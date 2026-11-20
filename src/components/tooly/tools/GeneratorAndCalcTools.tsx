import React, { useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Plus, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { useHub } from '../../../context/HubContext';
import { autoScrollToElement } from '../../../utils/autoScroll';
import { triggerHaptic } from '../../../utils/haptics';

/* ==================== GENERATOR TOOLS ==================== */

const PasswordGeneratorTool: React.FC = () => {
  const { sendToQr, showToast } = useHub();
  const [length, setLength] = useState(18);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [seed, setSeed] = useState(0);

  const password = useMemo(() => {
    void seed;
    let pool = '';
    if (upper) pool += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    if (lower) pool += 'abcdefghijkmnopqrstuvwxyz';
    if (digits) pool += '23456789';
    if (symbols) pool += '!@#$%^&*-_=+?';
    if (!pool) pool = 'abcdefghijkmnopqrstuvwxyz23456789';
    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, (n) => pool[n % pool.length]).join('');
  }, [length, upper, lower, digits, symbols, seed]);

  const poolSize = (upper ? 24 : 0) + (lower ? 25 : 0) + (digits ? 8 : 0) + (symbols ? 13 : 0) || 33;
  const entropy = Math.round(length * Math.log2(poolSize));
  const strength = entropy >= 95 ? 'Very Strong' : entropy >= 65 ? 'Strong' : entropy >= 45 ? 'Moderate' : 'Weak';

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white/75 border border-white p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <code className="font-mono text-lg sm:text-xl font-semibold text-slate-900 break-all select-all">
          {password}
        </code>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setSeed((s) => s + 1);
            }}
            className="h-10 px-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/70 text-slate-700 text-xs font-semibold flex items-center gap-1.5 active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Regenerate</span>
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(password);
              triggerHaptic('success');
              showToast({ title: 'Password copied' });
            }}
            className="h-10 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </button>
          <button
            type="button"
            onClick={() => sendToQr(password, 'text', 'Generated Password')}
            className="h-10 w-10 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/70 text-[#007AFF] flex items-center justify-center active:scale-95"
            aria-label="Generate QR for password"
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>
          Strength: <strong className="text-slate-900">{strength}</strong>
        </span>
        <span className="font-mono tabular-nums">{entropy} bits of entropy</span>
      </div>

      <div className="space-y-4 pt-2 border-t border-slate-200/70">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-slate-700">
            Length: <strong className="font-mono tabular-nums">{length}</strong>
          </span>
          <input
            type="range"
            min={8}
            max={48}
            value={length}
            onChange={(e) => {
              triggerHaptic('selection');
              setLength(Number(e.target.value));
            }}
            className="w-56 accent-[#007AFF]"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: 'Uppercase A–Z', val: upper, set: setUpper },
            { label: 'Lowercase a–z', val: lower, set: setLower },
            { label: 'Numbers 2–9', val: digits, set: setDigits },
            { label: 'Symbols !@#$', val: symbols, set: setSymbols },
          ].map((opt) => (
            <label
              key={opt.label}
              className="flex items-center gap-2 p-3 rounded-xl bg-white/65 border border-white text-xs font-medium text-slate-800 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={opt.val}
                onChange={(e) => {
                  triggerHaptic('selection');
                  opt.set(e.target.checked);
                }}
                className="accent-[#007AFF] rounded"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

const UuidGeneratorTool: React.FC = () => {
  const { showToast } = useHub();
  const [count, setCount] = useState(5);
  const [format, setFormat] = useState<'uuid' | 'hex' | 'token'>('uuid');
  const [seed, setSeed] = useState(0);
  const uuidListRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => {
    void seed;
    return Array.from({ length: count }, () => {
      if (format === 'uuid') return crypto.randomUUID();
      const bytes = new Uint8Array(format === 'hex' ? 16 : 24);
      crypto.getRandomValues(bytes);
      if (format === 'hex') {
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      }
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    });
  }, [count, format, seed]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/5">
          {([
            { id: 'uuid', label: 'UUID v4' },
            { id: 'hex', label: 'Hex 128-bit' },
            { id: 'token', label: 'URL Token' },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setFormat(t.id);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                format === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-9 px-3 rounded-xl glass-input text-xs font-semibold"
          >
            {[1, 5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n} items
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setSeed((s) => s + 1);
              autoScrollToElement(uuidListRef);
            }}
            className="h-9 px-3.5 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Generate</span>
          </button>
        </div>
      </div>

      <div ref={uuidListRef} className="rounded-2xl bg-white/70 border border-white divide-y divide-slate-200/60">
        {items.map((val, i) => (
          <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
            <code className="font-mono text-xs sm:text-sm text-slate-800 truncate">{val}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(val);
                triggerHaptic('success');
                showToast({ title: 'Identifier copied' });
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white shrink-0"
              aria-label="Copy identifier"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const CssGradientTool: React.FC = () => {
  const { showToast } = useHub();
  const [c1, setC1] = useState('#38BDF8');
  const [c2, setC2] = useState('#818CF8');
  const [c3, setC3] = useState('#F472B6');
  const [angle, setAngle] = useState(135);
  const [useThird, setUseThird] = useState(true);

  const cssValue = useThird
    ? `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 52%, ${c3} 100%)`
    : `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;

  return (
    <div className="space-y-5">
      <div
        className="w-full h-44 rounded-2xl border border-white shadow-inner"
        style={{ background: cssValue }}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Start', val: c1, set: setC1 },
          { label: 'Middle', val: c2, set: setC2 },
          { label: 'End', val: c3, set: setC3 },
        ].map((stop, idx) => (
          <div
            key={stop.label}
            className={`rounded-xl bg-white/70 border border-white p-3 flex items-center justify-between gap-2 ${
              idx === 2 && !useThird ? 'opacity-45' : ''
            }`}
          >
            <span className="text-xs font-medium text-slate-600">{stop.label}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-800">{stop.val.toUpperCase()}</span>
              <input
                type="color"
                value={stop.val}
                onChange={(e) => stop.set(e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-700 font-mono tabular-nums">Angle: {angle}°</span>
          <input
            type="range"
            min={0}
            max={360}
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="w-40 accent-[#007AFF]"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={useThird}
            onChange={(e) => setUseThird(e.target.checked)}
            className="accent-[#007AFF]"
          />
          <span>3-Stop Gradient</span>
        </label>
      </div>

      <div className="rounded-xl bg-white/75 border border-white p-3.5 flex items-center justify-between gap-3">
        <code className="font-mono text-xs text-slate-800 truncate">background: {cssValue};</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(`background: ${cssValue};`);
            triggerHaptic('success');
            showToast({ title: 'CSS copied' });
          }}
          className="px-3 py-1.5 rounded-lg bg-[#007AFF] text-white text-xs font-semibold shrink-0"
        >
          Copy CSS
        </button>
      </div>
    </div>
  );
};

// Code-39 encoding patterns for real scannable SVG barcodes
const CODE39_MAP: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn',
  F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn',
  P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
};

const BarcodeGeneratorTool: React.FC = () => {
  const [value, setValue] = useState('');
  const sanitized = value.toUpperCase().replace(/[^0-9A-Z\-.\s]/g, '').slice(0, 22);
  const encoded = sanitized ? `*${sanitized}*` : '';

  const bars = useMemo(() => {
    const rects: { x: number; w: number }[] = [];
    let cursor = 14;
    for (const ch of encoded) {
      const pattern = CODE39_MAP[ch] ?? CODE39_MAP['-'];
      for (let i = 0; i < pattern.length; i++) {
        const w = pattern[i] === 'w' ? 4 : 1.8;
        if (i % 2 === 0) rects.push({ x: cursor, w });
        cursor += w;
      }
      cursor += 2.2;
    }
    return { rects, totalWidth: cursor + 14 };
  }, [encoded]);

  const downloadSvg = () => {
    triggerHaptic('success');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bars.totalWidth}" height="110" viewBox="0 0 ${bars.totalWidth} 110"><rect width="100%" height="100%" fill="#ffffff"/>${bars.rects
      .map((r) => `<rect x="${r.x}" y="12" width="${r.w}" height="68" fill="#0f172a"/>`)
      .join('')}<text x="${bars.totalWidth / 2}" y="98" text-anchor="middle" font-family="monospace" font-size="13" fill="#0f172a">${sanitized}</text></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${sanitized.toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter SKU or label (A–Z, 0–9, -)"
          className="flex-1 h-11 px-4 rounded-xl glass-input font-mono text-sm uppercase"
        />
        <button
          type="button"
          onClick={downloadSvg}
          disabled={!sanitized}
          className="h-11 px-5 rounded-xl bg-[#007AFF] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95 whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>Download SVG</span>
        </button>
      </div>
      <div className="rounded-2xl bg-white p-6 border border-slate-200/70 flex flex-col items-center justify-center overflow-x-auto min-h-[130px]">
        {sanitized ? (
          <svg
            width={Math.min(540, bars.totalWidth * 1.25)}
            height={110}
            viewBox={`0 0 ${bars.totalWidth} 110`}
            className="max-w-full"
          >
            {bars.rects.map((r, i) => (
              <rect key={i} x={r.x} y={10} width={r.w} height={70} fill="#0F172A" />
            ))}
            <text
              x={bars.totalWidth / 2}
              y={98}
              textAnchor="middle"
              className="font-mono fill-slate-900 text-[13px] tracking-widest"
            >
              {sanitized}
            </text>
          </svg>
        ) : (
          <span className="text-xs text-slate-400">Type characters above to render a Code-39 barcode</span>
        )}
      </div>
    </div>
  );
};

const ADJECTIVES = ['calm', 'lucid', 'crisp', 'solar', 'nordic', 'velvet', 'cobalt', 'swift', 'alpine', 'silver'];
const NOUNS = ['otter', 'falcon', 'prism', 'harbor', 'cedar', 'quartz', 'comet', 'studio', 'drift', 'beacon'];

const HandleGeneratorTool: React.FC = () => {
  const { showToast } = useHub();
  const [seed, setSeed] = useState(0);
  const handlesRef = useRef<HTMLDivElement | null>(null);
  const handles = useMemo(() => {
    void seed;
    return Array.from({ length: 6 }, () => {
      const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
      const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
      const num = Math.floor(10 + Math.random() * 89);
      return {
        handle: `@${a}.${n}${num}`,
        email: `${a}.${n}${num}@example.dev`,
      };
    });
  }, [seed]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Clean usernames and placeholder test emails</p>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            setSeed((s) => s + 1);
            autoScrollToElement(handlesRef);
          }}
          className="h-9 px-3.5 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>
      <div ref={handlesRef} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {handles.map((h, i) => (
          <div key={i} className="rounded-2xl bg-white/70 border border-white p-3.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold text-slate-900 truncate">{h.handle}</div>
              <div className="font-mono text-xs text-slate-500 truncate">{h.email}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(h.handle);
                triggerHaptic('success');
                showToast({ title: `Copied ${h.handle}` });
              }}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white shrink-0"
              aria-label="Copy handle"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ==================== CALCULATION TOOLS ==================== */

function safeEvalMath(expr: string): number {
  const sanitized = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, String(Math.PI))
    .replace(/\be\b/g, String(Math.E))
    .replace(/\^/g, '**')
    .replace(/sin\(/g, 'Math.sin(')
    .replace(/cos\(/g, 'Math.cos(')
    .replace(/tan\(/g, 'Math.tan(')
    .replace(/sqrt\(/g, 'Math.sqrt(')
    .replace(/log\(/g, 'Math.log10(')
    .replace(/ln\(/g, 'Math.log(')
    .replace(/abs\(/g, 'Math.abs(');

  if (!/^[0-9+\-*/().,\sMathsincoqrtlgabEPIE*]+$/.test(sanitized)) {
    throw new Error('Invalid expression');
  }
  const fn = new Function(`"use strict"; return (${sanitized});`);
  const result = fn();
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Undefined');
  }
  return Number(result.toPrecision(12));
}

const ScientificCalcTool: React.FC = () => {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<string>('0');
  const [history, setHistory] = useState<{ expr: string; res: string }[]>([]);

  const evaluate = (input = expr) => {
    try {
      const val = safeEvalMath(input);
      const formatted = String(val);
      setResult(formatted);
      setHistory((prev) => [{ expr: input, res: formatted }, ...prev.slice(0, 7)]);
      triggerHaptic('medium');
    } catch {
      setResult('Error');
      triggerHaptic('error');
    }
  };

  const append = (tok: string) => {
    triggerHaptic('selection');
    setExpr((prev) => (prev === '0' ? tok : prev + tok));
  };

  const keys = [
    ['sin(', 'cos(', 'tan(', 'sqrt(', 'C'],
    ['(', ')', '^', 'π', '⌫'],
    ['7', '8', '9', '÷', 'log('],
    ['4', '5', '6', '×', 'ln('],
    ['1', '2', '3', '-', '%'],
    ['0', '.', 'e', '+', '='],
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-3">
        <div className="rounded-2xl bg-white/80 border border-white p-4 text-right space-y-1">
          <input
            type="text"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && evaluate()}
            className="w-full text-right bg-transparent font-mono text-sm text-slate-500 focus:outline-none"
            aria-label="Calculator expression"
          />
          <div className="font-mono tabular-nums text-3xl sm:text-4xl font-bold text-slate-900 truncate">
            {result}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {keys.flat().map((k) => {
            const isEq = k === '=';
            const isClear = k === 'C' || k === '⌫';
            const isOp = ['+', '-', '×', '÷', '^', '%'].includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  if (k === '=') evaluate();
                  else if (k === 'C') {
                    triggerHaptic('warning');
                    setExpr('');
                    setResult('0');
                  } else if (k === '⌫') {
                    triggerHaptic('selection');
                    setExpr((p) => p.slice(0, -1));
                  } else if (k === '%') {
                    append('/100');
                  } else {
                    append(k);
                  }
                }}
                className={`h-12 rounded-xl font-mono text-sm font-semibold transition-all active:scale-95 ${
                  isEq
                    ? 'bg-[#007AFF] text-white shadow-sm shadow-[#007AFF]/25 hover:bg-[#0062CC]'
                    : isClear
                    ? 'bg-rose-500/12 text-rose-700 hover:bg-rose-500/20'
                    : isOp
                    ? 'bg-[#007AFF]/12 text-[#007AFF] hover:bg-[#007AFF]/20'
                    : 'bg-white/75 hover:bg-white border border-white text-slate-900'
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-white/55 border border-white p-4 space-y-3">
        <div className="text-xs font-semibold text-slate-500">History Tape</div>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500">Evaluated calculations appear here for quick reuse.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setExpr(h.res);
                }}
                className="w-full text-left p-2.5 rounded-xl bg-white/70 hover:bg-white transition-colors"
              >
                <div className="font-mono text-xs text-slate-500 truncate">{h.expr}</div>
                <div className="font-mono tabular-nums text-sm font-bold text-slate-900">= {h.res}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const PercentageTool: React.FC = () => {
  const [p1, setP1] = useState(15);
  const [v1, setV1] = useState(240);
  const [fromVal, setFromVal] = useState(80);
  const [toVal, setToVal] = useState(104);

  const pctOf = (p1 / 100) * v1;
  const pctChange = fromVal !== 0 ? ((toVal - fromVal) / Math.abs(fromVal)) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="rounded-2xl bg-white/65 border border-white p-5 space-y-4">
        <h4 className="font-display font-semibold text-slate-900">Percentage of a Value</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Percent (%)</label>
            <input
              type="number"
              value={p1}
              onChange={(e) => setP1(Number(e.target.value))}
              className="w-full h-11 px-3 rounded-xl glass-input font-mono tabular-nums text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Of Number</label>
            <input
              type="number"
              value={v1}
              onChange={(e) => setV1(Number(e.target.value))}
              className="w-full h-11 px-3 rounded-xl glass-input font-mono tabular-nums text-sm"
            />
          </div>
        </div>
        <div className="pt-2 border-t border-slate-200/70">
          <div className="text-xs text-slate-500">Result</div>
          <div className="font-mono tabular-nums text-3xl font-bold text-[#007AFF]">{pctOf.toFixed(2)}</div>
        </div>
      </div>

      <div className="rounded-2xl bg-white/65 border border-white p-5 space-y-4">
        <h4 className="font-display font-semibold text-slate-900">Percentage Change</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input
              type="number"
              value={fromVal}
              onChange={(e) => setFromVal(Number(e.target.value))}
              className="w-full h-11 px-3 rounded-xl glass-input font-mono tabular-nums text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input
              type="number"
              value={toVal}
              onChange={(e) => setToVal(Number(e.target.value))}
              className="w-full h-11 px-3 rounded-xl glass-input font-mono tabular-nums text-sm"
            />
          </div>
        </div>
        <div className="pt-2 border-t border-slate-200/70">
          <div className="text-xs text-slate-500">Delta</div>
          <div
            className={`font-mono tabular-nums text-3xl font-bold ${
              pctChange >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {pctChange >= 0 ? '+' : ''}
            {pctChange.toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  );
};

const DateDiffTool: React.FC = () => {
  const [start, setStart] = useState('2000-05-15');
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const diff = useMemo(() => {
    const a = new Date(start);
    const b = new Date(end);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    const ms = Math.abs(b.getTime() - a.getTime());
    const totalDays = Math.floor(ms / 86400_000);
    const weeks = Math.floor(totalDays / 7);
    const years = Math.floor(totalDays / 365.2425);
    const remDaysAfterY = Math.floor(totalDays - years * 365.2425);
    const months = Math.floor(remDaysAfterY / 30.437);
    const days = Math.max(0, Math.round(remDaysAfterY - months * 30.437));
    return { totalDays, weeks, years, months, days, hours: totalDays * 24 };
  }, [start, end]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Start Date</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">End Date</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono text-sm"
          />
        </div>
      </div>

      {diff && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Duration', val: `${diff.years}y ${diff.months}m ${diff.days}d` },
            { label: 'Total Days', val: diff.totalDays.toLocaleString() },
            { label: 'Total Weeks', val: diff.weeks.toLocaleString() },
            { label: 'Total Hours', val: diff.hours.toLocaleString() },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl bg-white/70 border border-white p-4">
              <div className="text-xs text-slate-500">{c.label}</div>
              <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-900">{c.val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TipSplitterTool: React.FC = () => {
  const [bill, setBill] = useState(86.5);
  const [tipPct, setTipPct] = useState(18);
  const [people, setPeople] = useState(3);

  const tipAmount = (bill * tipPct) / 100;
  const total = bill + tipAmount;
  const perPerson = people > 0 ? total / people : total;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Bill Subtotal ($)</label>
          <input
            type="number"
            min={0}
            step="0.5"
            value={bill}
            onChange={(e) => setBill(Math.max(0, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Tip Percentage (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={tipPct}
            onChange={(e) => setTipPct(Math.max(0, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Split Between</label>
          <input
            type="number"
            min={1}
            max={50}
            value={people}
            onChange={(e) => setPeople(Math.max(1, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[10, 15, 18, 20, 25].map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setTipPct(pct);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              tipPct === pct ? 'bg-[#007AFF] text-white' : 'bg-white/75 text-slate-700 hover:bg-white'
            }`}
          >
            {pct}%
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/75 border border-white p-4">
          <div className="text-xs text-slate-500">Per Person</div>
          <div className="mt-1 font-mono tabular-nums text-3xl font-bold text-[#007AFF]">
            ${perPerson.toFixed(2)}
          </div>
        </div>
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">Total Tip</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
            ${tipAmount.toFixed(2)}
          </div>
        </div>
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">Grand Total</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
            ${total.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
};

const GRADE_POINTS: Record<string, number> = {
  'A+': 4.0, A: 4.0, 'A-': 3.7, 'B+': 3.3, B: 3.0, 'B-': 2.7, 'C+': 2.3, C: 2.0, 'C-': 1.7, D: 1.0, F: 0.0,
};

const GpaCalculatorTool: React.FC = () => {
  const [courses, setCourses] = useState<{ id: string; name: string; credits: number; grade: string }[]>([]);
  const addCourseBtnRef = useRef<HTMLButtonElement | null>(null);

  const totalCredits = courses.reduce((acc, c) => acc + c.credits, 0);
  const totalPoints = courses.reduce((acc, c) => acc + c.credits * (GRADE_POINTS[c.grade] ?? 0), 0);
  const gpa = totalCredits > 0 ? totalPoints / totalCredits : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/75 border border-white p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">Weighted Semester GPA</div>
          <div className="font-mono tabular-nums text-3xl font-bold text-[#007AFF]">{gpa.toFixed(2)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Total Credits</div>
          <div className="font-mono tabular-nums text-xl font-bold text-slate-900">{totalCredits}</div>
        </div>
      </div>

      <div className="space-y-2.5">
        {courses.map((c) => (
          <div key={c.id} className="grid grid-cols-12 gap-2 items-center">
            <input
              type="text"
              value={c.name}
              onChange={(e) =>
                setCourses((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))
              }
              placeholder="Course name"
              className="col-span-6 h-10 px-3 rounded-xl glass-input text-sm"
            />
            <input
              type="number"
              min={1}
              max={8}
              value={c.credits}
              onChange={(e) =>
                setCourses((prev) =>
                  prev.map((x) => (x.id === c.id ? { ...x, credits: Math.max(1, Number(e.target.value)) } : x))
                )
              }
              className="col-span-2 h-10 px-2 rounded-xl glass-input font-mono text-sm text-center"
            />
            <select
              value={c.grade}
              onChange={(e) =>
                setCourses((prev) => prev.map((x) => (x.id === c.id ? { ...x, grade: e.target.value } : x)))
              }
              className="col-span-3 h-10 px-2 rounded-xl glass-input font-mono text-sm"
            >
              {Object.keys(GRADE_POINTS).map((g) => (
                <option key={g} value={g}>
                  {g} ({GRADE_POINTS[g].toFixed(1)})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCourses((prev) => prev.filter((x) => x.id !== c.id))}
              className="col-span-1 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600"
              aria-label="Remove course"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        ref={addCourseBtnRef}
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setCourses((prev) => [...prev, { id: String(Date.now()), name: 'New Course', credits: 3, grade: 'A' }]);
          autoScrollToElement(addCourseBtnRef, { align: 'bottom' });
        }}
        className="h-10 px-4 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-800 flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add Course</span>
      </button>
    </div>
  );
};

export const GeneratorAndCalcTools: React.FC<{ subToolId: string }> = ({ subToolId }) => {
  switch (subToolId) {
    case 'gn-password':
      return <PasswordGeneratorTool />;
    case 'gn-uuid':
      return <UuidGeneratorTool />;
    case 'gn-gradient':
      return <CssGradientTool />;
    case 'gn-barcode':
      return <BarcodeGeneratorTool />;
    case 'gn-username':
      return <HandleGeneratorTool />;
    case 'calc-sci':
      return <ScientificCalcTool />;
    case 'calc-percent':
      return <PercentageTool />;
    case 'calc-date':
      return <DateDiffTool />;
    case 'calc-tip':
      return <TipSplitterTool />;
    case 'calc-gpa':
      return <GpaCalculatorTool />;
    default:
      return <PasswordGeneratorTool />;
  }
};
