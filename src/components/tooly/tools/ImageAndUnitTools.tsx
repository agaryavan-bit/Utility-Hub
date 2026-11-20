import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Copy, Download, RotateCw, Upload } from 'lucide-react';
import { useHub } from '../../../context/HubContext';
import { autoScrollToElement } from '../../../utils/autoScroll';
import { triggerHaptic } from '../../../utils/haptics';

/* ==================== IMAGE TOOLS (REAL HTML5 CANVAS) ==================== */

const ImageStudioTool: React.FC<{ mode: 'compress' | 'resize' | 'filter' | 'palette' }> = ({ mode }) => {
  const { showToast } = useHub();
  const [srcUrl, setSrcUrl] = useState<string>('');
  const [origSize, setOrigSize] = useState<number>(0);
  const [origDims, setOrigDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Compress / Resize controls
  const [quality, setQuality] = useState(0.78);
  const [format, setFormat] = useState<'image/jpeg' | 'image/webp' | 'image/png'>('image/webp');
  const [outW, setOutW] = useState(640);
  const [outH, setOutH] = useState(420);
  const [lockAspect, setLockAspect] = useState(true);
  const [outSizeBytes, setOutSizeBytes] = useState(0);

  // Filter controls
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [grayscale, setGrayscale] = useState(0);
  const [rotation, setRotation] = useState(0);

  // Palette controls
  const [palette, setPalette] = useState<string[]>([]);
  const [pickedHex, setPickedHex] = useState<string>('#38BDF8');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    triggerHaptic('medium');
    setOrigSize(file.size);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSrcUrl(reader.result);
        autoScrollToElement(previewRef);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!srcUrl) {
      imgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setOrigDims({ w: img.naturalWidth, h: img.naturalHeight });
      setOutW(img.naturalWidth);
      setOutH(img.naturalHeight);
    };
    img.src = srcUrl;
  }, [srcUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const targetW = mode === 'resize' ? Math.max(16, outW) : img.naturalWidth;
    const targetH = mode === 'resize' ? Math.max(16, outH) : img.naturalHeight;

    const swapped = mode === 'filter' && (rotation === 90 || rotation === 270);
    canvas.width = swapped ? targetH : targetW;
    canvas.height = swapped ? targetW : targetH;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (mode === 'filter') {
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) grayscale(${grayscale}%)`;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
    } else {
      ctx.drawImage(img, 0, 0, targetW, targetH);
    }
    ctx.restore();

    if (mode === 'compress' || mode === 'resize') {
      canvas.toBlob(
        (blob) => {
          if (blob) setOutSizeBytes(blob.size);
        },
        format,
        quality
      );
    }

    if (mode === 'palette') {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const buckets = new Map<string, number>();
      const step = Math.max(4, Math.floor((canvas.width * canvas.height) / 900)) * 4;
      for (let i = 0; i < data.length; i += step) {
        const r = Math.round(data[i] / 24) * 24;
        const g = Math.round(data[i + 1] / 24) * 24;
        const b = Math.round(data[i + 2] / 24) * 24;
        const hex =
          '#' +
          [r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, '0')).join('').toUpperCase();
        buckets.set(hex, (buckets.get(hex) ?? 0) + 1);
      }
      const top = Array.from(buckets.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([hex]) => hex);
      setPalette(top);
    }
  }, [mode, srcUrl, origDims, outW, outH, quality, format, brightness, contrast, saturate, grayscale, rotation]);

  const handleCanvasPick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'palette' || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvasRef.current.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvasRef.current.height);
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const px = ctx.getImageData(x, y, 1, 1).data;
    const hex = '#' + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    setPickedHex(hex);
    triggerHaptic('selection');
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    triggerHaptic('success');
    const ext = format === 'image/png' ? 'png' : format === 'image/jpeg' ? 'jpg' : 'webp';
    const url = canvas.toDataURL(mode === 'filter' ? 'image/png' : format, quality);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tooly-image.${mode === 'filter' ? 'png' : ext}`;
    a.click();
    showToast({ title: 'Image exported' });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="h-10 px-4 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-800 flex items-center gap-2 cursor-pointer active:scale-95 transition-all">
          <Upload className="w-3.5 h-3.5 text-[#007AFF]" />
          <span>Upload Image</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>

        {mode !== 'palette' && (
          <button
            type="button"
            onClick={handleExport}
            disabled={!srcUrl}
            className="h-10 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-40 active:scale-95 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Result</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        <div ref={previewRef} className="lg:col-span-3 rounded-2xl bg-white/60 border border-white p-3 flex flex-col items-center justify-center overflow-hidden min-h-[240px]">
          {srcUrl ? (
            <>
              <canvas
                ref={canvasRef}
                onClick={handleCanvasPick}
                className={`max-w-full max-h-[340px] rounded-xl object-contain ${
                  mode === 'palette' ? 'cursor-crosshair' : ''
                }`}
              />
              <div className="mt-2.5 text-xs text-slate-500 font-mono tabular-nums">
                {origDims.w} × {origDims.h} px
                {origSize > 0 ? ` · Original ${(origSize / 1024).toFixed(1)} KB` : ''}
                {(mode === 'compress' || mode === 'resize') && outSizeBytes > 0
                  ? ` · Output ${(outSizeBytes / 1024).toFixed(1)} KB`
                  : ''}
              </div>
            </>
          ) : (
            <label className="w-full h-56 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 text-center p-6 cursor-pointer hover:bg-white/60 transition-colors">
              <Upload className="w-7 h-7 text-[#007AFF]" />
              <span className="text-sm font-semibold text-slate-800">Upload an image to begin</span>
              <span className="text-xs text-slate-500">Processed 100% locally in your browser</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
          )}
        </div>

        <div className="lg:col-span-2 rounded-2xl bg-white/65 border border-white p-4 space-y-4">
          {(mode === 'compress' || mode === 'resize') && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Output Format</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { id: 'image/webp', label: 'WebP' },
                    { id: 'image/jpeg', label: 'JPEG' },
                    { id: 'image/png', label: 'PNG' },
                  ] as const).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setFormat(f.id);
                      }}
                      className={`h-9 rounded-xl text-xs font-semibold ${
                        format === f.id ? 'bg-[#007AFF] text-white' : 'bg-white/80 text-slate-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {format !== 'image/png' && (
                <div>
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>Quality</span>
                    <span className="font-mono tabular-nums font-semibold">{Math.round(quality * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.02}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full accent-[#007AFF]"
                  />
                </div>
              )}

              {mode === 'resize' && (
                <div className="space-y-3 pt-2 border-t border-slate-200/70">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Width (px)</label>
                      <input
                        type="number"
                        min={16}
                        value={outW}
                        onChange={(e) => {
                          const w = Math.max(16, Number(e.target.value));
                          setOutW(w);
                          if (lockAspect && origDims.w > 0) {
                            setOutH(Math.round((w * origDims.h) / origDims.w));
                          }
                        }}
                        className="w-full h-10 px-3 rounded-xl glass-input font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Height (px)</label>
                      <input
                        type="number"
                        min={16}
                        value={outH}
                        onChange={(e) => {
                          const h = Math.max(16, Number(e.target.value));
                          setOutH(h);
                          if (lockAspect && origDims.h > 0) {
                            setOutW(Math.round((h * origDims.w) / origDims.h));
                          }
                        }}
                        className="w-full h-10 px-3 rounded-xl glass-input font-mono text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lockAspect}
                      onChange={(e) => setLockAspect(e.target.checked)}
                      className="accent-[#007AFF]"
                    />
                    <span>Lock aspect ratio</span>
                  </label>
                </div>
              )}
            </>
          )}

          {mode === 'filter' && (
            <div className="space-y-3.5">
              {[
                { label: 'Brightness', val: brightness, set: setBrightness, min: 40, max: 180 },
                { label: 'Contrast', val: contrast, set: setContrast, min: 40, max: 180 },
                { label: 'Saturation', val: saturate, set: setSaturate, min: 0, max: 200 },
                { label: 'Grayscale', val: grayscale, set: setGrayscale, min: 0, max: 100 },
              ].map((s) => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>{s.label}</span>
                    <span className="font-mono tabular-nums">{s.val}%</span>
                  </div>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    value={s.val}
                    onChange={(e) => s.set(Number(e.target.value))}
                    className="w-full accent-[#007AFF]"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setRotation((r) => (r + 90) % 360);
                  }}
                  className="flex-1 h-9 rounded-xl bg-white/85 border border-white text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotate 90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setBrightness(100);
                    setContrast(100);
                    setSaturate(100);
                    setGrayscale(0);
                    setRotation(0);
                  }}
                  className="h-9 px-3 rounded-xl bg-white/75 text-xs font-medium text-slate-600"
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {mode === 'palette' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Click anywhere on the image to sample a pixel, or tap a dominant swatch to copy HEX.
              </p>
              <div className="rounded-xl bg-white/80 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-9 h-9 rounded-xl border border-black/10 shrink-0"
                    style={{ backgroundColor: pickedHex }}
                  />
                  <div>
                    <div className="text-[11px] text-slate-500">Sampled Pixel</div>
                    <div className="font-mono text-sm font-bold text-slate-900">{pickedHex}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(pickedHex);
                    triggerHaptic('success');
                    showToast({ title: `Copied ${pickedHex}` });
                  }}
                  className="p-2 rounded-lg text-slate-600 hover:bg-white"
                  aria-label="Copy sampled color"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-600 mb-2">Dominant Palette</div>
                <div className="grid grid-cols-3 gap-2">
                  {palette.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(hex);
                        triggerHaptic('success');
                        showToast({ title: `Copied ${hex}` });
                      }}
                      className="rounded-xl bg-white/80 p-2 text-left hover:bg-white transition-colors"
                    >
                      <div className="w-full h-9 rounded-lg border border-black/5" style={{ backgroundColor: hex }} />
                      <div className="mt-1.5 font-mono text-[11px] font-semibold text-slate-800">{hex}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ==================== UNIT CONVERTER ==================== */

interface UnitDef {
  id: string;
  label: string;
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
}

const UNIT_GROUPS: Record<string, UnitDef[]> = {
  'unit-length': [
    { id: 'm', label: 'Meters (m)', toBase: (v) => v, fromBase: (v) => v },
    { id: 'km', label: 'Kilometers (km)', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    { id: 'cm', label: 'Centimeters (cm)', toBase: (v) => v * 0.01, fromBase: (v) => v / 0.01 },
    { id: 'mm', label: 'Millimeters (mm)', toBase: (v) => v * 0.001, fromBase: (v) => v / 0.001 },
    { id: 'mi', label: 'Miles (mi)', toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
    { id: 'ft', label: 'Feet (ft)', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    { id: 'in', label: 'Inches (in)', toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
  ],
  'unit-weight': [
    { id: 'kg', label: 'Kilograms (kg)', toBase: (v) => v, fromBase: (v) => v },
    { id: 'g', label: 'Grams (g)', toBase: (v) => v * 0.001, fromBase: (v) => v / 0.001 },
    { id: 'lb', label: 'Pounds (lb)', toBase: (v) => v * 0.45359237, fromBase: (v) => v / 0.45359237 },
    { id: 'oz', label: 'Ounces (oz)', toBase: (v) => v * 0.0283495, fromBase: (v) => v / 0.0283495 },
    { id: 'st', label: 'Stones (st)', toBase: (v) => v * 6.35029, fromBase: (v) => v / 6.35029 },
  ],
  'unit-temp': [
    { id: 'c', label: 'Celsius (°C)', toBase: (v) => v, fromBase: (v) => v },
    { id: 'f', label: 'Fahrenheit (°F)', toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
    { id: 'k', label: 'Kelvin (K)', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
  ],
  'unit-data': [
    { id: 'b', label: 'Bytes (B)', toBase: (v) => v, fromBase: (v) => v },
    { id: 'kb', label: 'Kilobytes (KB)', toBase: (v) => v * 1024, fromBase: (v) => v / 1024 },
    { id: 'mb', label: 'Megabytes (MB)', toBase: (v) => v * 1024 ** 2, fromBase: (v) => v / 1024 ** 2 },
    { id: 'gb', label: 'Gigabytes (GB)', toBase: (v) => v * 1024 ** 3, fromBase: (v) => v / 1024 ** 3 },
    { id: 'tb', label: 'Terabytes (TB)', toBase: (v) => v * 1024 ** 4, fromBase: (v) => v / 1024 ** 4 },
  ],
  'unit-volume': [
    { id: 'l', label: 'Liters (L)', toBase: (v) => v, fromBase: (v) => v },
    { id: 'ml', label: 'Milliliters (mL)', toBase: (v) => v * 0.001, fromBase: (v) => v / 0.001 },
    { id: 'gal', label: 'US Gallons (gal)', toBase: (v) => v * 3.78541, fromBase: (v) => v / 3.78541 },
    { id: 'cup', label: 'US Cups', toBase: (v) => v * 0.236588, fromBase: (v) => v / 0.236588 },
    { id: 'floz', label: 'Fluid Ounces (fl oz)', toBase: (v) => v * 0.0295735, fromBase: (v) => v / 0.0295735 },
  ],
};

const UnitConverterPanel: React.FC<{ groupKey: string }> = ({ groupKey }) => {
  const units = UNIT_GROUPS[groupKey] ?? UNIT_GROUPS['unit-length'];
  const [amount, setAmount] = useState(1);
  const [fromId, setFromId] = useState(units[0].id);
  const [toId, setToId] = useState(units[1]?.id ?? units[0].id);

  useEffect(() => {
    setFromId(units[0].id);
    setToId(units[1]?.id ?? units[0].id);
  }, [groupKey, units]);

  const fromUnit = units.find((u) => u.id === fromId) ?? units[0];
  const toUnit = units.find((u) => u.id === toId) ?? units[1] ?? units[0];
  const baseVal = fromUnit.toBase(amount);
  const converted = toUnit.fromBase(baseVal);

  const formatNum = (n: number) => {
    if (Math.abs(n) >= 10000 || (Math.abs(n) > 0 && Math.abs(n) < 0.0001)) {
      return n.toExponential(4);
    }
    return Number(n.toFixed(6)).toString();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-end">
        <div className="md:col-span-5 space-y-2">
          <label className="block text-xs font-medium text-slate-600">From</label>
          <select
            value={fromId}
            onChange={(e) => {
              triggerHaptic('selection');
              setFromId(e.target.value);
            }}
            className="w-full h-11 px-3 rounded-xl glass-input text-sm font-medium"
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full h-12 px-4 rounded-xl glass-input font-mono tabular-nums text-lg font-semibold"
          />
        </div>

        <div className="md:col-span-1 flex justify-center pb-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setFromId(toId);
              setToId(fromId);
            }}
            className="w-11 h-11 rounded-2xl bg-white/85 hover:bg-white border border-white text-[#007AFF] flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Swap units"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
        </div>

        <div className="md:col-span-5 space-y-2">
          <label className="block text-xs font-medium text-slate-600">To</label>
          <select
            value={toId}
            onChange={(e) => {
              triggerHaptic('selection');
              setToId(e.target.value);
            }}
            className="w-full h-11 px-3 rounded-xl glass-input text-sm font-medium"
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <div className="w-full h-12 px-4 rounded-xl bg-white/80 border border-white flex items-center font-mono tabular-nums text-lg font-bold text-[#007AFF]">
            {formatNum(converted)}
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-200/70">
        <div className="text-xs font-medium text-slate-500 mb-2.5">All Equivalent Values</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {units.map((u) => (
            <div key={u.id} className="rounded-xl bg-white/65 border border-white p-3">
              <div className="text-[11px] text-slate-500 truncate">{u.label}</div>
              <div className="mt-0.5 font-mono tabular-nums text-sm font-semibold text-slate-900 truncate">
                {formatNum(u.fromBase(baseVal))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ImageAndUnitTools: React.FC<{ subToolId: string }> = ({ subToolId }) => {
  if (subToolId === 'img-compress') return <ImageStudioTool mode="compress" />;
  if (subToolId === 'img-resize') return <ImageStudioTool mode="resize" />;
  if (subToolId === 'img-filter') return <ImageStudioTool mode="filter" />;
  if (subToolId === 'img-palette') return <ImageStudioTool mode="palette" />;
  return <UnitConverterPanel groupKey={subToolId} />;
};
