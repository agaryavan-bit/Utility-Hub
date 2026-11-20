import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Dices, Plus, RefreshCw, Shuffle, Trash2 } from 'lucide-react';
import { autoScrollToElement } from '../../../utils/autoScroll';
import { triggerHaptic } from '../../../utils/haptics';

/* ==================== FINANCE TOOLS ==================== */

const LoanEmiTool: React.FC = () => {
  const [principal, setPrincipal] = useState(250000);
  const [rate, setRate] = useState(6.2);
  const [years, setYears] = useState(15);

  const months = Math.max(1, years * 12);
  const monthlyRate = rate / 100 / 12;
  const emi =
    monthlyRate === 0
      ? principal / months
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);
  const totalPay = emi * months;
  const totalInterest = Math.max(0, totalPay - principal);
  const principalPct = totalPay > 0 ? (principal / totalPay) * 100 : 100;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Loan Amount ($)</label>
          <input
            type="number"
            min={100}
            value={principal}
            onChange={(e) => setPrincipal(Math.max(0, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Annual Rate (%)</label>
          <input
            type="number"
            min={0}
            step="0.1"
            value={rate}
            onChange={(e) => setRate(Math.max(0, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Tenure (Years)</label>
          <input
            type="number"
            min={1}
            max={40}
            value={years}
            onChange={(e) => setYears(Math.max(1, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/75 border border-white p-4">
          <div className="text-xs text-slate-500">Monthly Payment (EMI)</div>
          <div className="mt-1 font-mono tabular-nums text-3xl font-bold text-[#007AFF]">
            ${emi.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">Total Interest</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-amber-600">
            ${totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">Total Repayment</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
            ${totalPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-600">
          <span>Principal ({principalPct.toFixed(1)}%)</span>
          <span>Interest ({(100 - principalPct).toFixed(1)}%)</span>
        </div>
        <div className="w-full h-3 rounded-full bg-amber-400/35 overflow-hidden">
          <div
            className="h-full bg-[#007AFF] transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, principalPct))}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const CompoundInterestTool: React.FC = () => {
  const [initial, setInitial] = useState(10000);
  const [monthly, setMonthly] = useState(500);
  const [annualRate, setAnnualRate] = useState(8);
  const [years, setYears] = useState(15);

  const summary = useMemo(() => {
    const r = annualRate / 100 / 12;
    let balance = initial;
    let contributed = initial;
    const yearly: { year: number; balance: number; contributed: number }[] = [];
    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < 12; m++) {
        balance = balance * (1 + r) + monthly;
        contributed += monthly;
      }
      yearly.push({ year: y, balance, contributed });
    }
    return { balance, contributed, gains: Math.max(0, balance - contributed), yearly };
  }, [initial, monthly, annualRate, years]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Starting ($)', val: initial, set: setInitial },
          { label: 'Monthly ($)', val: monthly, set: setMonthly },
          { label: 'Return (%/yr)', val: annualRate, set: setAnnualRate },
          { label: 'Years', val: years, set: (n: number) => setYears(Math.min(50, Math.max(1, n))) },
        ].map((f) => (
          <div key={f.label}>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{f.label}</label>
            <input
              type="number"
              min={0}
              value={f.val}
              onChange={(e) => f.set(Math.max(0, Number(e.target.value)))}
              className="w-full h-11 px-3 rounded-xl glass-input font-mono tabular-nums text-sm"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/75 border border-white p-4">
          <div className="text-xs text-slate-500">Projected Balance</div>
          <div className="mt-1 font-mono tabular-nums text-3xl font-bold text-emerald-600">
            ${summary.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">Total Contributed</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
            ${summary.contributed.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">Compound Growth</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#007AFF]">
            +${summary.gains.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Compact bar visualization */}
      <div className="rounded-2xl bg-white/60 border border-white p-4">
        <div className="text-xs font-medium text-slate-500 mb-3">Growth Trajectory by Year</div>
        <div className="h-32 flex items-end gap-1.5">
          {summary.yearly.map((pt) => {
            const hPct = summary.balance > 0 ? (pt.balance / summary.balance) * 100 : 0;
            const cPct = pt.balance > 0 ? (pt.contributed / pt.balance) * 100 : 0;
            return (
              <div
                key={pt.year}
                className="flex-1 h-full flex flex-col justify-end group relative"
                title={`Year ${pt.year}: $${Math.round(pt.balance).toLocaleString()}`}
              >
                <div
                  className="w-full rounded-t-md bg-emerald-500/80 overflow-hidden flex flex-col justify-end transition-all"
                  style={{ height: `${Math.max(4, hPct)}%` }}
                >
                  <div className="w-full bg-[#007AFF]" style={{ height: `${cPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const DiscountTaxTool: React.FC = () => {
  const [price, setPrice] = useState(149);
  const [discount, setDiscount] = useState(20);
  const [tax, setTax] = useState(8.5);

  const saved = (price * discount) / 100;
  const discounted = price - saved;
  const taxAmt = (discounted * tax) / 100;
  const finalPrice = discounted + taxAmt;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Original Price ($)</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Discount (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={discount}
            onChange={(e) => setDiscount(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Tax / VAT (%)</label>
          <input
            type="number"
            min={0}
            step="0.25"
            value={tax}
            onChange={(e) => setTax(Math.max(0, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/75 border border-white p-4">
          <div className="text-xs text-slate-500">Final Price</div>
          <div className="mt-1 font-mono tabular-nums text-3xl font-bold text-[#007AFF]">
            ${finalPrice.toFixed(2)}
          </div>
        </div>
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">You Save</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-emerald-600">
            ${saved.toFixed(2)}
          </div>
        </div>
        <div className="rounded-2xl bg-white/65 border border-white p-4">
          <div className="text-xs text-slate-500">Tax Added</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
            ${taxAmt.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
};

const FX_RATES_USD: Record<string, { name: string; rate: number; symbol: string }> = {
  USD: { name: 'US Dollar', rate: 1, symbol: '$' },
  EUR: { name: 'Euro', rate: 0.92, symbol: '€' },
  GBP: { name: 'British Pound', rate: 0.79, symbol: '£' },
  JPY: { name: 'Japanese Yen', rate: 152.4, symbol: '¥' },
  INR: { name: 'Indian Rupee', rate: 84.1, symbol: '₹' },
  CAD: { name: 'Canadian Dollar', rate: 1.38, symbol: 'C$' },
  AUD: { name: 'Australian Dollar', rate: 1.53, symbol: 'A$' },
  CHF: { name: 'Swiss Franc', rate: 0.88, symbol: 'CHF ' },
};

const CurrencyConverterTool: React.FC = () => {
  const [amount, setAmount] = useState(100);
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('EUR');

  const inUsd = amount / FX_RATES_USD[from].rate;
  const result = inUsd * FX_RATES_USD[to].rate;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Amount</label>
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            className="w-full h-11 px-4 rounded-xl glass-input font-mono tabular-nums text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">From</label>
          <select
            value={from}
            onChange={(e) => {
              triggerHaptic('selection');
              setFrom(e.target.value);
            }}
            className="w-full h-11 px-3 rounded-xl glass-input text-sm font-medium"
          >
            {Object.entries(FX_RATES_USD).map(([code, info]) => (
              <option key={code} value={code}>
                {code} — {info.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">To</label>
          <select
            value={to}
            onChange={(e) => {
              triggerHaptic('selection');
              setTo(e.target.value);
            }}
            className="w-full h-11 px-3 rounded-xl glass-input text-sm font-medium"
          >
            {Object.entries(FX_RATES_USD).map(([code, info]) => (
              <option key={code} value={code}>
                {code} — {info.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl bg-white/75 border border-white p-5">
        <div className="text-xs text-slate-500">
          {FX_RATES_USD[from].symbol}
          {amount.toLocaleString()} {from} equals
        </div>
        <div className="mt-1 font-mono tabular-nums text-3xl font-bold text-[#007AFF]">
          {FX_RATES_USD[to].symbol}
          {result.toLocaleString(undefined, { maximumFractionDigits: 2 })} {to}
        </div>
        <div className="text-xs text-slate-500 mt-1.5 font-mono">
          1 {from} = {(FX_RATES_USD[to].rate / FX_RATES_USD[from].rate).toFixed(4)} {to} · Reference offline rates
        </div>
      </div>
    </div>
  );
};

const SavingsGoalTool: React.FC = () => {
  const [goal, setGoal] = useState(20000);
  const [current, setCurrent] = useState(3500);
  const [months, setMonths] = useState(24);
  const [apy, setApy] = useState(4.5);

  const r = apy / 100 / 12;
  const futureCurrent = current * Math.pow(1 + r, months);
  const gap = Math.max(0, goal - futureCurrent);
  const monthlyNeeded =
    months <= 0 ? 0 : r === 0 ? gap / months : (gap * r) / (Math.pow(1 + r, months) - 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Goal ($)', val: goal, set: setGoal },
          { label: 'Saved So Far ($)', val: current, set: setCurrent },
          { label: 'Months', val: months, set: (v: number) => setMonths(Math.max(1, v)) },
          { label: 'APY (%)', val: apy, set: setApy },
        ].map((f) => (
          <div key={f.label}>
            <label className="block text-xs text-slate-600 mb-1">{f.label}</label>
            <input
              type="number"
              min={0}
              value={f.val}
              onChange={(e) => f.set(Math.max(0, Number(e.target.value)))}
              className="w-full h-11 px-3 rounded-xl glass-input font-mono text-sm"
            />
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-white/75 border border-white p-5">
        <div className="text-xs text-slate-500">Required Monthly Deposit</div>
        <div className="mt-1 font-mono tabular-nums text-3xl font-bold text-emerald-600">
          ${monthlyNeeded.toLocaleString(undefined, { maximumFractionDigits: 2 })} / mo
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Reaches ${goal.toLocaleString()} in {months} months at {apy}% APY
        </div>
      </div>
    </div>
  );
};

/* ==================== RANDOMIZER TOOLS ==================== */

const WHEEL_COLORS = ['#007AFF', '#38BDF8', '#818CF8', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#F97316'];

const SpinWheelTool: React.FC = () => {
  const [options, setOptions] = useState<string[]>([]);
  const [newOpt, setNewOpt] = useState('');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const winnerRef = useRef<HTMLDivElement | null>(null);

  const spin = () => {
    if (options.length < 2 || spinning) return;
    triggerHaptic('medium');
    setSpinning(true);
    const extraSpins = 5 * 360;
    const randomOffset = Math.floor(Math.random() * 360);
    const nextRot = rotation + extraSpins + randomOffset;
    setRotation(nextRot);

    window.setTimeout(() => {
      const normalized = ((360 - (nextRot % 360)) + 360) % 360;
      const sliceAngle = 360 / options.length;
      const idx = Math.floor(normalized / sliceAngle) % options.length;
      setWinner(options[idx]);
      setSpinning(false);
      triggerHaptic('success');
      autoScrollToElement(winnerRef, { align: 'bottom' });
    }, 3100);
  };

  const addOption = () => {
    if (!newOpt.trim() || options.length >= 10) return;
    triggerHaptic('light');
    setOptions((p) => [...p, newOpt.trim()]);
    setNewOpt('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
      <div className="flex flex-col items-center">
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
          {options.length >= 2 ? (
            <>
              {/* Top Pointer */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-slate-900 drop-shadow" />
              <motion.svg
                viewBox="0 0 200 200"
                className="w-full h-full drop-shadow-lg"
                animate={{ rotate: rotation }}
                transition={{ duration: 3, ease: [0.15, 0.85, 0.2, 1] }}
              >
                {options.map((opt, idx) => {
                  const slice = (2 * Math.PI) / options.length;
                  const start = idx * slice - Math.PI / 2;
                  const end = start + slice;
                  const x1 = 100 + 96 * Math.cos(start);
                  const y1 = 100 + 96 * Math.sin(start);
                  const x2 = 100 + 96 * Math.cos(end);
                  const y2 = 100 + 96 * Math.sin(end);
                  const largeArc = slice > Math.PI ? 1 : 0;
                  const mid = start + slice / 2;
                  const tx = 100 + 58 * Math.cos(mid);
                  const ty = 100 + 58 * Math.sin(mid);
                  return (
                    <g key={`${opt}-${idx}`}>
                      <path
                        d={`M100,100 L${x1},${y1} A96,96 0 ${largeArc},1 ${x2},${y2} Z`}
                        fill={WHEEL_COLORS[idx % WHEEL_COLORS.length]}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                      <text
                        x={tx}
                        y={ty}
                        fill="#ffffff"
                        fontSize="10.5"
                        fontWeight="700"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${(mid * 180) / Math.PI}, ${tx}, ${ty})`}
                      >
                        {opt.slice(0, 11)}
                      </text>
                    </g>
                  );
                })}
                <circle cx="100" cy="100" r="18" fill="#ffffff" stroke="rgba(15,23,42,0.12)" strokeWidth="2" />
              </motion.svg>
            </>
          ) : (
            <div className="w-60 h-60 rounded-full bg-white/65 border-2 border-dashed border-slate-300 flex items-center justify-center text-center p-6 text-xs text-slate-500">
              Add at least 2 options on the right to spin the wheel.
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={spin}
          disabled={spinning || options.length < 2}
          className="mt-5 h-11 px-7 rounded-2xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-sm font-semibold shadow-md shadow-[#007AFF]/20 disabled:opacity-50 active:scale-95 transition-all"
        >
          {spinning ? 'Spinning…' : 'Spin Wheel'}
        </button>

        {winner && !spinning && (
          <div ref={winnerRef} className="mt-3 text-center">
            <span className="text-xs text-slate-500">Selected Choice</span>
            <div className="font-display text-xl font-bold text-slate-900">{winner}</div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={newOpt}
            onChange={(e) => setNewOpt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addOption()}
            placeholder="Add wheel option…"
            className="flex-1 h-10 px-3.5 rounded-xl glass-input text-sm"
          />
          <button
            type="button"
            onClick={addOption}
            className="h-10 px-4 rounded-xl bg-white/85 border border-white text-xs font-semibold text-slate-800 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>

        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {options.map((opt, idx) => (
            <div
              key={`${opt}-${idx}`}
              className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-white/70 border border-white text-sm"
            >
              <span className="flex items-center gap-2.5 text-slate-800 font-medium">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: WHEEL_COLORS[idx % WHEEL_COLORS.length] }}
                />
                {opt}
              </span>
              <button
                type="button"
                onClick={() => setOptions((p) => p.filter((_, i) => i !== idx))}
                disabled={options.length <= 2}
                className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                aria-label="Remove option"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const DiceRollerTool: React.FC = () => {
  const [sides, setSides] = useState(6);
  const [count, setCount] = useState(2);
  const [rolls, setRolls] = useState<number[]>([4, 6]);
  const [rolling, setRolling] = useState(false);

  const roll = () => {
    triggerHaptic('heavy');
    setRolling(true);
    window.setTimeout(() => {
      const next = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
      setRolls(next);
      setRolling(false);
    }, 220);
  };

  const sum = rolls.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[4, 6, 8, 10, 12, 20].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setSides(s);
              }}
              className={`h-9 px-3 rounded-xl font-mono text-xs font-semibold ${
                sides === s ? 'bg-[#007AFF] text-white' : 'bg-white/75 text-slate-700'
              }`}
            >
              D{s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">Dice:</span>
          {[1, 2, 3, 4, 6].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setCount(c);
              }}
              className={`w-8 h-8 rounded-lg font-mono text-xs font-semibold ${
                count === c ? 'bg-slate-900 text-white' : 'bg-white/75 text-slate-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="py-6 flex flex-wrap items-center justify-center gap-4">
        {rolls.map((val, idx) => (
          <motion.div
            key={`${idx}-${val}-${rolling}`}
            initial={{ rotate: -14, scale: 0.85 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 20 }}
            className="w-20 h-20 rounded-2xl bg-white/90 border border-white shadow-md flex items-center justify-center font-mono tabular-nums text-3xl font-bold text-slate-900"
          >
            {val}
          </motion.div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Total: <strong className="font-mono tabular-nums text-lg text-slate-900">{sum}</strong>
        </div>
        <button
          type="button"
          onClick={roll}
          className="h-11 px-6 rounded-2xl bg-[#007AFF] text-white text-sm font-semibold flex items-center gap-2 active:scale-95"
        >
          <Dices className="w-4 h-4" />
          <span>Roll Dice</span>
        </button>
      </div>
    </div>
  );
};

const CoinFlipperTool: React.FC = () => {
  const [side, setSide] = useState<'Heads' | 'Tails'>('Heads');
  const [flips, setFlips] = useState(0);
  const [headsCount, setHeadsCount] = useState(0);
  const [flipping, setFlipping] = useState(false);

  const flip = () => {
    if (flipping) return;
    triggerHaptic('medium');
    setFlipping(true);
    window.setTimeout(() => {
      const next = Math.random() < 0.5 ? 'Heads' : 'Tails';
      setSide(next);
      setFlips((f) => f + 1);
      if (next === 'Heads') setHeadsCount((h) => h + 1);
      setFlipping(false);
      triggerHaptic('success');
    }, 360);
  };

  return (
    <div className="flex flex-col items-center py-6 space-y-5">
      <motion.button
        type="button"
        onClick={flip}
        animate={{ rotateY: flipping ? 540 : 0 }}
        transition={{ duration: 0.36 }}
        className="w-36 h-36 rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 border-4 border-white shadow-xl flex flex-col items-center justify-center text-amber-950 font-display font-extrabold text-2xl active:scale-95"
      >
        <span>{side}</span>
      </motion.button>

      <button
        type="button"
        onClick={flip}
        className="h-11 px-7 rounded-2xl bg-[#007AFF] text-white text-sm font-semibold active:scale-95"
      >
        Flip Coin
      </button>

      <div className="flex items-center gap-4 text-xs text-slate-600 font-mono tabular-nums">
        <span>Total: {flips}</span>
        <span>·</span>
        <span>Heads: {headsCount}</span>
        <span>·</span>
        <span>Tails: {flips - headsCount}</span>
      </div>
    </div>
  );
};

const NumberRangeTool: React.FC = () => {
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [qty, setQty] = useState(1);
  const [results, setResults] = useState<number[]>([42]);

  const draw = () => {
    triggerHaptic('medium');
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const out: number[] = [];
    for (let i = 0; i < qty; i++) {
      out.push(lo + Math.floor(Math.random() * (hi - lo + 1)));
    }
    setResults(out);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Min</label>
          <input
            type="number"
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
            className="w-full h-11 px-3 rounded-xl glass-input font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Max</label>
          <input
            type="number"
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
            className="w-full h-11 px-3 rounded-xl glass-input font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Count</label>
          <input
            type="number"
            min={1}
            max={20}
            value={qty}
            onChange={(e) => setQty(Math.min(20, Math.max(1, Number(e.target.value))))}
            className="w-full h-11 px-3 rounded-xl glass-input font-mono text-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl bg-white/75 border border-white p-6 text-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {results.map((n, i) => (
            <span
              key={i}
              className="px-4 py-2 rounded-2xl bg-white border border-slate-200/70 font-mono tabular-nums text-3xl font-bold text-[#007AFF]"
            >
              {n}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={draw}
          className="mt-5 h-11 px-6 rounded-2xl bg-[#007AFF] text-white text-sm font-semibold inline-flex items-center gap-2 active:scale-95"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Generate</span>
        </button>
      </div>
    </div>
  );
};

const ListShufflerTool: React.FC = () => {
  const [input, setInput] = useState('');
  const [teamCount, setTeamCount] = useState(2);
  const [teams, setTeams] = useState<string[][]>([]);
  const teamsRef = useRef<HTMLDivElement | null>(null);

  const shuffleAndSplit = () => {
    triggerHaptic('medium');
    const items = input
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const groups: string[][] = Array.from({ length: Math.max(1, teamCount) }, () => []);
    shuffled.forEach((person, idx) => {
      groups[idx % groups.length].push(person);
    });
    setTeams(groups);
    autoScrollToElement(teamsRef);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <textarea
            rows={6}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="One name or item per line…"
            className="w-full p-4 rounded-2xl glass-input text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-2">
              <span>Groups:</span>
              <input
                type="number"
                min={1}
                max={8}
                value={teamCount}
                onChange={(e) => setTeamCount(Math.max(1, Math.min(8, Number(e.target.value))))}
                className="w-16 h-9 px-2 rounded-xl glass-input font-mono text-sm text-center"
              />
            </label>
            <button
              type="button"
              onClick={shuffleAndSplit}
              className="h-10 px-5 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Shuffle & Split</span>
            </button>
          </div>
        </div>

        <div ref={teamsRef} className="space-y-2.5">
          {teams.length === 0 ? (
            <div className="h-full rounded-2xl bg-white/55 border border-white p-5 flex items-center justify-center text-xs text-slate-500 text-center">
              Click Shuffle & Split to generate randomized balanced teams.
            </div>
          ) : (
            teams.map((members, idx) => (
              <div key={idx} className="rounded-2xl bg-white/75 border border-white p-3.5">
                <div className="text-xs font-semibold text-[#007AFF] mb-1">Group {idx + 1}</div>
                <div className="text-sm text-slate-800">{members.join(' · ') || 'Empty'}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const FinanceAndRandomTools: React.FC<{ subToolId: string }> = ({ subToolId }) => {
  switch (subToolId) {
    case 'fin-loan':
      return <LoanEmiTool />;
    case 'fin-compound':
      return <CompoundInterestTool />;
    case 'fin-discount':
      return <DiscountTaxTool />;
    case 'fin-currency':
      return <CurrencyConverterTool />;
    case 'fin-savings':
      return <SavingsGoalTool />;
    case 'rnd-wheel':
      return <SpinWheelTool />;
    case 'rnd-dice':
      return <DiceRollerTool />;
    case 'rnd-coin':
      return <CoinFlipperTool />;
    case 'rnd-number':
      return <NumberRangeTool />;
    case 'rnd-shuffler':
      return <ListShufflerTool />;
    default:
      return <LoanEmiTool />;
  }
};
