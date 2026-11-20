import React, { useEffect, useMemo, useState } from 'react';
import { Copy, QrCode } from 'lucide-react';
import { useHub } from '../../../context/HubContext';
import { triggerHaptic } from '../../../utils/haptics';

/* ==================== HEALTH TOOLS ==================== */

const BmiTool: React.FC = () => {
  const [heightCm, setHeightCm] = useState(175);
  const [weightKg, setWeightKg] = useState(70);

  const hm = heightCm / 100;
  const bmi = hm > 0 ? weightKg / (hm * hm) : 0;
  const category =
    bmi < 18.5
      ? { label: 'Underweight', tone: 'text-sky-600' }
      : bmi < 25
      ? { label: 'Healthy Range', tone: 'text-emerald-600' }
      : bmi < 30
      ? { label: 'Overweight', tone: 'text-amber-600' }
      : { label: 'Obese', tone: 'text-rose-600' };

  const minHealthy = (18.5 * hm * hm).toFixed(1);
  const maxHealthy = (24.9 * hm * hm).toFixed(1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Height (cm)</label>
          <input
            type="number"
            min={90}
            max={240}
            value={heightCm}
            onChange={(e) => setHeightCm(Math.max(90, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Weight (kg)</label>
          <input
            type="number"
            min={25}
            max={250}
            value={weightKg}
            onChange={(e) => setWeightKg(Math.max(25, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl bg-white/75 border border-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500">Body Mass Index</div>
          <div className="mt-1 font-mono tabular-nums text-4xl font-bold text-slate-900">{bmi.toFixed(1)}</div>
          <div className={`text-sm font-semibold mt-0.5 ${category.tone}`}>{category.label}</div>
        </div>
        <div className="text-sm text-slate-600">
          <div>Healthy weight for {heightCm} cm:</div>
          <div className="font-mono tabular-nums font-bold text-slate-900 text-lg mt-0.5">
            {minHealthy} – {maxHealthy} kg
          </div>
        </div>
      </div>
    </div>
  );
};

const BmrCaloriesTool: React.FC = () => {
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState(26);
  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(72);
  const [activity, setActivity] = useState(1.55);

  const bmr =
    sex === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;
  const tdee = bmr * activity;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Biological Sex</label>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as 'male' | 'female')}
            className="w-full h-11 px-3 rounded-xl glass-input text-sm"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Age</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(Math.max(12, Number(e.target.value)))}
            className="w-full h-11 px-3 rounded-xl glass-input font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Height (cm)</label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(Math.max(100, Number(e.target.value)))}
            className="w-full h-11 px-3 rounded-xl glass-input font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Weight (kg)</label>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(Math.max(30, Number(e.target.value)))}
            className="w-full h-11 px-3 rounded-xl glass-input font-mono text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-600 mb-1.5">Activity Level</label>
        <select
          value={activity}
          onChange={(e) => setActivity(Number(e.target.value))}
          className="w-full h-11 px-3 rounded-xl glass-input text-sm"
        >
          <option value={1.2}>Sedentary (desk job)</option>
          <option value={1.375}>Lightly Active (1–3 days/wk)</option>
          <option value={1.55}>Moderately Active (3–5 days/wk)</option>
          <option value={1.725}>Very Active (6–7 days/wk)</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/75 border border-white p-4">
          <div className="text-xs text-slate-500">Maintenance (TDEE)</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#007AFF]">
            {Math.round(tdee)} kcal
          </div>
        </div>
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">Mild Deficit (−400)</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-emerald-600">
            {Math.round(tdee - 400)} kcal
          </div>
        </div>
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">Basal Rate (BMR)</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
            {Math.round(bmr)} kcal
          </div>
        </div>
      </div>
    </div>
  );
};

const HydrationTool: React.FC = () => {
  const [weightKg, setWeightKg] = useState(70);
  const [exerciseMins, setExerciseMins] = useState(45);

  const liters = (weightKg * 0.033 + (exerciseMins / 30) * 0.35).toFixed(2);
  const cups = Math.round(Number(liters) * 4.22675);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Weight (kg)</label>
          <input
            type="number"
            value={weightKg}
            onChange={(e) => setWeightKg(Math.max(20, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Daily Exercise (minutes)</label>
          <input
            type="number"
            value={exerciseMins}
            onChange={(e) => setExerciseMins(Math.max(0, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono text-sm"
          />
        </div>
      </div>
      <div className="rounded-2xl bg-white/75 border border-white p-5 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">Daily Target</div>
          <div className="font-mono tabular-nums text-3xl font-bold text-sky-600">{liters} Liters</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Equivalent</div>
          <div className="font-mono tabular-nums text-xl font-bold text-slate-900">~{cups} glasses</div>
        </div>
      </div>
    </div>
  );
};

const HeartZonesTool: React.FC = () => {
  const [age, setAge] = useState(28);
  const maxHr = Math.max(120, 220 - age);
  const zones = [
    { name: 'Zone 1 · Recovery', min: 0.5, max: 0.6 },
    { name: 'Zone 2 · Fat Burn & Base', min: 0.6, max: 0.7 },
    { name: 'Zone 3 · Aerobic Tempo', min: 0.7, max: 0.8 },
    { name: 'Zone 4 · Lactate Threshold', min: 0.8, max: 0.9 },
    { name: 'Zone 5 · VO2 Peak', min: 0.9, max: 1.0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-medium text-slate-700">
          Age: <strong className="font-mono">{age}</strong> · Max HR:{' '}
          <strong className="font-mono text-rose-600">{maxHr} BPM</strong>
        </label>
        <input
          type="range"
          min={15}
          max={80}
          value={age}
          onChange={(e) => setAge(Number(e.target.value))}
          className="w-44 accent-[#007AFF]"
        />
      </div>
      <div className="divide-y divide-slate-200/70 rounded-2xl bg-white/70 border border-white overflow-hidden">
        {zones.map((z) => (
          <div key={z.name} className="px-4 py-3 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-800">{z.name}</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {Math.round(maxHr * z.min)} – {Math.round(maxHr * z.max)} BPM
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SleepCyclesTool: React.FC = () => {
  const [wakeTime, setWakeTime] = useState('07:00');
  const bedtimes = useMemo(() => {
    const [hh, mm] = wakeTime.split(':').map(Number);
    if (isNaN(hh) || isNaN(mm)) return [];
    const wakeMins = hh * 60 + mm;
    return [6, 5, 4].map((cycles) => {
      const total = wakeMins - cycles * 90 - 15; // 15 min to fall asleep
      const wrapped = ((total % 1440) + 1440) % 1440;
      const h = Math.floor(wrapped / 60);
      const m = wrapped % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return {
        cycles,
        hours: (cycles * 1.5).toFixed(1),
        time: `${h12}:${String(m).padStart(2, '0')} ${ampm}`,
      };
    });
  }, [wakeTime]);

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Desired Wake-Up Time</label>
        <input
          type="time"
          value={wakeTime}
          onChange={(e) => setWakeTime(e.target.value)}
          className="h-11 px-4 rounded-xl glass-input font-mono text-sm"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {bedtimes.map((b, i) => (
          <div key={b.cycles} className="rounded-2xl bg-white/75 border border-white p-4">
            <div className="text-xs text-slate-500">
              {b.cycles} Cycles · {b.hours} hrs {i === 1 ? '(Ideal)' : ''}
            </div>
            <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#007AFF]">{b.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ==================== DEVELOPMENT TOOLS ==================== */

const JsonFormatterTool: React.FC = () => {
  const { showToast } = useHub();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const format = (spaces: number) => {
    try {
      const parsed = JSON.parse(input);
      setInput(JSON.stringify(parsed, null, spaces));
      setError(null);
      triggerHaptic('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
      triggerHaptic('error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => format(2)}
          className="h-9 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-semibold active:scale-95"
        >
          Prettify (2 Spaces)
        </button>
        <button
          type="button"
          onClick={() => format(0)}
          className="h-9 px-4 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-800"
        >
          Minify
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(input);
            triggerHaptic('success');
            showToast({ title: 'JSON copied' });
          }}
          className="h-9 px-3.5 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-700 flex items-center gap-1.5"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>Copy</span>
        </button>
      </div>

      {error && (
        <div className="px-3.5 py-2 rounded-xl bg-rose-500/12 text-rose-700 text-xs font-mono">
          Syntax Error: {error}
        </div>
      )}

      <textarea
        rows={9}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setError(null);
        }}
        spellCheck={false}
        className="w-full p-4 rounded-2xl glass-input font-mono text-xs sm:text-sm text-slate-900 leading-relaxed"
      />
    </div>
  );
};

const Base64UrlTool: React.FC = () => {
  const [mode, setMode] = useState<'base64' | 'url'>('base64');
  const [plain, setPlain] = useState('');
  const [encoded, setEncoded] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const encode = (val: string, m = mode) => {
    setPlain(val);
    setErr(null);
    try {
      if (m === 'base64') {
        const bytes = new TextEncoder().encode(val);
        let bin = '';
        bytes.forEach((b) => (bin += String.fromCharCode(b)));
        setEncoded(btoa(bin));
      } else {
        setEncoded(encodeURIComponent(val));
      }
    } catch {
      setErr('Unable to encode input');
    }
  };

  const decode = (val: string, m = mode) => {
    setEncoded(val);
    setErr(null);
    try {
      if (m === 'base64') {
        const bin = atob(val);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        setPlain(new TextDecoder().decode(bytes));
      } else {
        setPlain(decodeURIComponent(val));
      }
    } catch {
      setErr('Invalid encoded sequence');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/5 w-fit">
        {(['base64', 'url'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setMode(m);
              encode(plain, m);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
              mode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            {m === 'base64' ? 'Base64 UTF-8' : 'URL Component'}
          </button>
        ))}
      </div>

      {err && <div className="text-xs text-rose-600 font-medium">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-600 mb-1.5">Plain Text</label>
          <textarea
            rows={5}
            value={plain}
            onChange={(e) => encode(e.target.value)}
            className="w-full p-3.5 rounded-2xl glass-input font-mono text-xs"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1.5">Encoded Output</label>
          <textarea
            rows={5}
            value={encoded}
            onChange={(e) => decode(e.target.value)}
            className="w-full p-3.5 rounded-2xl glass-input font-mono text-xs"
          />
        </div>
      </div>
    </div>
  );
};

const JwtInspectorTool: React.FC = () => {
  const [token, setToken] = useState('');

  const decoded = useMemo(() => {
    const parts = token.trim().split('.');
    if (parts.length < 2) return null;
    const decodePart = (p: string) => {
      const padded = p.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(p.length / 4) * 4, '=');
      return JSON.parse(atob(padded));
    };
    try {
      return { header: decodePart(parts[0]), payload: decodePart(parts[1]) };
    } catch {
      return null;
    }
  }, [token]);

  return (
    <div className="space-y-4">
      <textarea
        rows={3}
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Paste JWT token to inspect locally…"
        className="w-full p-3.5 rounded-2xl glass-input font-mono text-xs break-all"
      />
      {decoded ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white/70 border border-white p-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Header</div>
            <pre className="font-mono text-xs text-slate-800 overflow-x-auto">
              {JSON.stringify(decoded.header, null, 2)}
            </pre>
          </div>
          <div className="rounded-2xl bg-white/70 border border-white p-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Payload Claims</div>
            <pre className="font-mono text-xs text-slate-800 overflow-x-auto">
              {JSON.stringify(decoded.payload, null, 2)}
            </pre>
          </div>
        </div>
      ) : token.trim() ? (
        <div className="text-xs text-rose-600">Enter a valid 3-part dot-separated JWT string.</div>
      ) : (
        <div className="text-xs text-slate-500">Paste a JWT above to inspect its header and payload locally.</div>
      )}
    </div>
  );
};

const CryptoHashTool: React.FC = () => {
  const { showToast, sendToQr } = useHub();
  const [text, setText] = useState('');
  const [hashes, setHashes] = useState<{ algo: string; digest: string }[]>([]);

  useEffect(() => {
    let active = true;
    const compute = async () => {
      const data = new TextEncoder().encode(text);
      const algos = ['SHA-256', 'SHA-384', 'SHA-512', 'SHA-1'];
      const results = await Promise.all(
        algos.map(async (algo) => {
          const buf = await crypto.subtle.digest(algo, data);
          const hex = Array.from(new Uint8Array(buf))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          return { algo, digest: hex };
        })
      );
      if (active) setHashes(results);
    };
    compute();
    return () => {
      active = false;
    };
  }, [text]);

  return (
    <div className="space-y-4">
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter string to hash via Web Crypto…"
        className="w-full p-3.5 rounded-2xl glass-input font-mono text-sm"
      />
      <div className="space-y-2.5">
        {hashes.map((h) => (
          <div key={h.algo} className="rounded-2xl bg-white/70 border border-white p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-500">{h.algo}</div>
              <code className="block font-mono text-xs text-slate-900 break-all mt-0.5">{h.digest}</code>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(h.digest);
                  triggerHaptic('success');
                  showToast({ title: `${h.algo} copied` });
                }}
                className="p-2 rounded-lg text-slate-500 hover:bg-white"
                aria-label={`Copy ${h.algo}`}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => sendToQr(h.digest, 'text', `${h.algo} Hash`)}
                className="p-2 rounded-lg text-[#007AFF] hover:bg-white"
                aria-label={`QR for ${h.algo}`}
              >
                <QrCode className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RegexEpochTool: React.FC = () => {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [sample, setSample] = useState('');
  const [epochSec, setEpochSec] = useState(() => Math.floor(Date.now() / 1000));

  const matches = useMemo(() => {
    if (!pattern) return [];
    try {
      const re = new RegExp(pattern, flags);
      return Array.from(sample.matchAll(re)).map((m) => m[0]);
    } catch {
      return null;
    }
  }, [pattern, flags, sample]);

  const humanDate = useMemo(() => {
    const d = new Date(epochSec * 1000);
    return isNaN(d.getTime()) ? 'Invalid timestamp' : d.toLocaleString();
  }, [epochSec]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-3 rounded-2xl bg-white/65 border border-white p-4">
        <div className="text-xs font-semibold text-slate-600">Regex Tester</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="flex-1 h-10 px-3 rounded-xl glass-input font-mono text-xs"
            placeholder="Pattern"
          />
          <input
            type="text"
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
            className="w-16 h-10 px-2 rounded-xl glass-input font-mono text-xs text-center"
            placeholder="g"
          />
        </div>
        <textarea
          rows={3}
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          className="w-full p-3 rounded-xl glass-input text-xs"
        />
        <div className="text-xs text-slate-600">
          {matches === null ? (
            <span className="text-rose-600">Invalid Regular Expression</span>
          ) : (
            <span>
              {matches.length} matches: <strong className="font-mono text-slate-900">{matches.join(', ') || 'None'}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl bg-white/65 border border-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">Unix Epoch Converter</span>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setEpochSec(Math.floor(Date.now() / 1000));
            }}
            className="text-xs font-semibold text-[#007AFF]"
          >
            Now
          </button>
        </div>
        <input
          type="number"
          value={epochSec}
          onChange={(e) => setEpochSec(Number(e.target.value))}
          className="w-full h-11 px-3.5 rounded-xl glass-input font-mono tabular-nums text-sm"
        />
        <div className="space-y-1 text-xs">
          <div className="text-slate-500">Local Time</div>
          <div className="font-mono font-semibold text-slate-900">{humanDate}</div>
          <div className="text-slate-500 pt-1">ISO 8601 (UTC)</div>
          <div className="font-mono text-slate-700">
            {isNaN(new Date(epochSec * 1000).getTime()) ? '—' : new Date(epochSec * 1000).toISOString()}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==================== COLORS TOOLS ==================== */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = s / 100;
  const ll = l / 100;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + hh / 30) % 12;
    const col = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * col)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ColorConverterTool: React.FC = () => {
  const { showToast } = useHub();
  const [hex, setHex] = useState('#007AFF');
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const k = 1 - Math.max(r, g, b) / 255;
  const c = k < 1 ? Math.round(((1 - r / 255 - k) / (1 - k)) * 100) : 0;
  const m = k < 1 ? Math.round(((1 - g / 255 - k) / (1 - k)) * 100) : 0;
  const y = k < 1 ? Math.round(((1 - b / 255 - k) / (1 - k)) * 100) : 0;

  const formats = [
    { label: 'HEX', val: hex.toUpperCase() },
    { label: 'RGB', val: `rgb(${r}, ${g}, ${b})` },
    { label: 'HSL', val: `hsl(${h}deg, ${s}%, ${l}%)` },
    { label: 'CMYK', val: `cmyk(${c}%, ${m}%, ${y}%, ${Math.round(k * 100)}%)` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div
          className="w-full sm:w-28 h-24 rounded-2xl border-2 border-white shadow-md shrink-0"
          style={{ backgroundColor: hex }}
        />
        <div className="flex-1 flex items-center gap-3">
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className="w-14 h-12 rounded-xl cursor-pointer bg-transparent"
          />
          <input
            type="text"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className="flex-1 h-12 px-4 rounded-xl glass-input font-mono text-base font-semibold uppercase"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {formats.map((f) => (
          <div key={f.label} className="rounded-2xl bg-white/70 border border-white p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-500">{f.label}</div>
              <div className="font-mono text-sm font-semibold text-slate-900">{f.val}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(f.val);
                triggerHaptic('success');
                showToast({ title: `Copied ${f.label}` });
              }}
              className="p-2 rounded-lg text-slate-500 hover:bg-white"
              aria-label={`Copy ${f.label}`}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const ContrastCheckerTool: React.FC = () => {
  const [fg, setFg] = useState('#0F172A');
  const [bg, setBg] = useState('#F2F6FC');

  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white/70 border border-white p-3.5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">Foreground Text</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{fg.toUpperCase()}</span>
            <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="w-9 h-9 rounded-lg" />
          </div>
        </div>
        <div className="rounded-2xl bg-white/70 border border-white p-3.5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">Background Surface</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{bg.toUpperCase()}</span>
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="w-9 h-9 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-6 border border-white shadow-xs" style={{ backgroundColor: bg, color: fg }}>
        <div className="font-display text-2xl font-bold">Liquid Glass Contrast Preview</div>
        <p className="text-sm mt-1.5 opacity-90">
          Accessible typography guarantees effortless outdoor daylight readability across translucent surfaces.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/75 border border-white p-4">
          <div className="text-xs text-slate-500">Contrast Ratio</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">{ratio.toFixed(2)}:1</div>
        </div>
        <div className="rounded-2xl bg-white/75 border border-white p-4">
          <div className="text-xs text-slate-500">WCAG AA Normal</div>
          <div className={`text-lg font-bold mt-1 ${ratio >= 4.5 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {ratio >= 4.5 ? 'Pass' : 'Fail'}
          </div>
        </div>
        <div className="rounded-2xl bg-white/75 border border-white p-4">
          <div className="text-xs text-slate-500">WCAG AAA Normal</div>
          <div className={`text-lg font-bold mt-1 ${ratio >= 7 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {ratio >= 7 ? 'Pass' : 'Below 7:1'}
          </div>
        </div>
      </div>
    </div>
  );
};

const HarmonyPaletteTool: React.FC = () => {
  const { showToast } = useHub();
  const [base, setBase] = useState('#007AFF');
  const [r, g, b] = hexToRgb(base);
  const [h, s, l] = rgbToHsl(r, g, b);

  const swatches = [
    { name: 'Base', hex: hslToHex(h, s, l) },
    { name: 'Complementary', hex: hslToHex(h + 180, s, l) },
    { name: 'Analogous −30°', hex: hslToHex(h - 30, s, l) },
    { name: 'Analogous +30°', hex: hslToHex(h + 30, s, l) },
    { name: 'Triadic 120°', hex: hslToHex(h + 120, s, l) },
    { name: 'Soft Tint', hex: hslToHex(h, Math.max(25, s - 15), Math.min(92, l + 32)) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-600">Seed Hue:</span>
        <input type="color" value={base} onChange={(e) => setBase(e.target.value)} className="w-10 h-10 rounded-xl" />
        <span className="font-mono text-sm font-semibold text-slate-800">{base.toUpperCase()}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {swatches.map((sw) => (
          <button
            key={sw.name}
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(sw.hex);
              triggerHaptic('success');
              showToast({ title: `Copied ${sw.hex}` });
            }}
            className="rounded-2xl bg-white/75 border border-white p-3 text-left hover:bg-white transition-colors"
          >
            <div className="w-full h-16 rounded-xl border border-black/5" style={{ backgroundColor: sw.hex }} />
            <div className="mt-2 text-xs text-slate-500">{sw.name}</div>
            <div className="font-mono text-sm font-bold text-slate-900">{sw.hex}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

const LiquidGlassBuilderTool: React.FC = () => {
  const { showToast } = useHub();
  const [blur, setBlur] = useState(24);
  const [alpha, setAlpha] = useState(0.62);
  const [saturate, setSaturate] = useState(185);

  const cssCode = `background: rgba(255, 255, 255, ${alpha});\nbackdrop-filter: blur(${blur}px) saturate(${saturate}%);\nborder: 1px solid rgba(255, 255, 255, 0.85);`;

  return (
    <div className="space-y-5">
      <div className="relative h-48 rounded-2xl overflow-hidden bg-gradient-to-br from-sky-300 via-indigo-200 to-teal-200 flex items-center justify-center p-6">
        <div
          className="w-full max-w-sm rounded-2xl p-5 shadow-xl"
          style={{
            background: `rgba(255,255,255,${alpha})`,
            backdropFilter: `blur(${blur}px) saturate(${saturate}%)`,
            WebkitBackdropFilter: `blur(${blur}px) saturate(${saturate}%)`,
            border: '1px solid rgba(255,255,255,0.85)',
          }}
        >
          <div className="font-display font-bold text-slate-900">Liquid Glass Pane</div>
          <p className="text-xs text-slate-700 mt-1">
            Live optical refraction preview with adjustable blur, opacity, and saturation.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span>Blur</span>
            <span className="font-mono">{blur}px</span>
          </div>
          <input type="range" min={4} max={44} value={blur} onChange={(e) => setBlur(Number(e.target.value))} className="w-full accent-[#007AFF]" />
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span>Opacity</span>
            <span className="font-mono">{Math.round(alpha * 100)}%</span>
          </div>
          <input type="range" min={0.15} max={0.95} step={0.05} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} className="w-full accent-[#007AFF]" />
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span>Saturation</span>
            <span className="font-mono">{saturate}%</span>
          </div>
          <input type="range" min={100} max={240} step={5} value={saturate} onChange={(e) => setSaturate(Number(e.target.value))} className="w-full accent-[#007AFF]" />
        </div>
      </div>

      <div className="rounded-xl bg-white/75 border border-white p-3.5 flex items-center justify-between gap-3">
        <pre className="font-mono text-xs text-slate-800 whitespace-pre-wrap">{cssCode}</pre>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(cssCode);
            triggerHaptic('success');
            showToast({ title: 'Glass CSS copied' });
          }}
          className="px-3.5 py-2 rounded-xl bg-[#007AFF] text-white text-xs font-semibold shrink-0"
        >
          Copy
        </button>
      </div>
    </div>
  );
};

export const HealthDevColorTools: React.FC<{ subToolId: string }> = ({ subToolId }) => {
  switch (subToolId) {
    case 'hlt-bmi':
      return <BmiTool />;
    case 'hlt-bmr':
      return <BmrCaloriesTool />;
    case 'hlt-water':
      return <HydrationTool />;
    case 'hlt-hr':
      return <HeartZonesTool />;
    case 'hlt-sleep':
      return <SleepCyclesTool />;
    case 'dev-json':
      return <JsonFormatterTool />;
    case 'dev-base64':
      return <Base64UrlTool />;
    case 'dev-jwt':
      return <JwtInspectorTool />;
    case 'dev-hash':
      return <CryptoHashTool />;
    case 'dev-regex':
      return <RegexEpochTool />;
    case 'col-picker':
      return <ColorConverterTool />;
    case 'col-contrast':
      return <ContrastCheckerTool />;
    case 'col-harmony':
      return <HarmonyPaletteTool />;
    case 'col-glass':
      return <LiquidGlassBuilderTool />;
    default:
      return <BmiTool />;
  }
};
