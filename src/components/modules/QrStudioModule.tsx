import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {
  BellPlus,
  Camera,
  CameraOff,
  Check,
  Copy,
  Download,
  ExternalLink,
  History,
  NotebookPen,
  QrCode,
  ScanLine,
  Trash2,
  Upload,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { QrPayloadType } from '../../types/hub';
import { autoScrollToElement } from '../../utils/autoScroll';
import { triggerHaptic } from '../../utils/haptics';

const PAYLOAD_TYPES: { id: QrPayloadType; label: string }[] = [
  { id: 'url', label: 'URL' },
  { id: 'text', label: 'Text' },
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'vcard', label: 'Contact' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'sms', label: 'SMS' },
];

export const QrStudioModule: React.FC = () => {
  const {
    state,
    pendingQrDraft,
    clearPendingQrDraft,
    addQrHistory,
    clearQrHistory,
    createNoteFromPayload,
    openQuickReminder,
    showToast,
  } = useHub();

  const [tab, setTab] = useState<'generate' | 'scan' | 'history'>('generate');
  const [payloadType, setPayloadType] = useState<QrPayloadType>('url');

  // Form fields for each QR type (start empty for user input)
  const [urlVal, setUrlVal] = useState('');
  const [textVal, setTextVal] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiEnc, setWifiEnc] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [vName, setVName] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vOrg, setVOrg] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailSubj, setEmailSubj] = useState('');
  const [phoneNum, setPhoneNum] = useState('');
  const [smsNum, setSmsNum] = useState('');
  const [smsMsg, setSmsMsg] = useState('');

  // Styling options
  const [fgColor, setFgColor] = useState('#0F172A');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [ecLevel, setEcLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Scanner state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedText, setScannedText] = useState<string | null>(null);
  const [scanFileError, setScanFileError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const decodedResultRef = useRef<HTMLDivElement | null>(null);
  const qrPreviewRef = useRef<HTMLDivElement | null>(null);
  const tabContentRef = useRef<HTMLDivElement | null>(null);
  const cameraBoxRef = useRef<HTMLDivElement | null>(null);

  // Absorb incoming cross-tool QR draft
  useEffect(() => {
    if (!pendingQrDraft) return;
    setTab('generate');
    setPayloadType(pendingQrDraft.type);
    if (pendingQrDraft.type === 'url') setUrlVal(pendingQrDraft.payload);
    else setTextVal(pendingQrDraft.payload);
    clearPendingQrDraft();
  }, [pendingQrDraft, clearPendingQrDraft]);

  const encodedPayload = useMemo(() => {
    switch (payloadType) {
      case 'url':
        return urlVal.trim();
      case 'text':
        return textVal.trim();
      case 'wifi':
        return wifiSsid.trim() ? `WIFI:T:${wifiEnc};S:${wifiSsid};P:${wifiPass};;` : '';
      case 'vcard':
        return vName.trim() || vPhone.trim() || vEmail.trim()
          ? `BEGIN:VCARD\nVERSION:3.0\nFN:${vName}\nORG:${vOrg}\nTEL:${vPhone}\nEMAIL:${vEmail}\nEND:VCARD`
          : '';
      case 'email':
        return emailTo.trim() ? `mailto:${emailTo}?subject=${encodeURIComponent(emailSubj)}` : '';
      case 'phone':
        return phoneNum.trim() ? `tel:${phoneNum}` : '';
      case 'sms':
        return smsNum.trim() ? `SMSTO:${smsNum}:${smsMsg}` : '';
      default:
        return textVal.trim();
    }
  }, [payloadType, urlVal, textVal, wifiEnc, wifiSsid, wifiPass, vName, vOrg, vPhone, vEmail, emailTo, emailSubj, phoneNum, smsNum, smsMsg]);

  // Render real QR code PNG & SVG
  useEffect(() => {
    if (!encodedPayload) {
      setQrDataUrl('');
      setQrSvg('');
      return;
    }
    let mounted = true;
    const render = async () => {
      try {
        const [dataUrl, svgStr] = await Promise.all([
          QRCode.toDataURL(encodedPayload, {
            width: 320,
            margin: 2,
            errorCorrectionLevel: ecLevel,
            color: { dark: fgColor, light: bgColor },
          }),
          QRCode.toString(encodedPayload, {
            type: 'svg',
            margin: 2,
            errorCorrectionLevel: ecLevel,
            color: { dark: fgColor, light: bgColor },
          }),
        ]);
        if (mounted) {
          setQrDataUrl(dataUrl);
          setQrSvg(svgStr);
        }
      } catch {
        // Ignore transient invalid input
      }
    };
    render();
    return () => {
      mounted = false;
    };
  }, [encodedPayload, fgColor, bgColor, ecLevel]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (tab !== 'scan') stopCamera();
    return () => stopCamera();
  }, [tab, stopCamera]);

  const handleDecoded = useCallback(
    (raw: string) => {
      setScannedText(raw);
      setScanFileError(null);
      triggerHaptic('success');
      const isUrl = /^https?:\/\//i.test(raw);
      addQrHistory({
        mode: 'scanned',
        type: isUrl ? 'url' : raw.startsWith('WIFI:') ? 'wifi' : 'text',
        payload: raw,
        label: raw.slice(0, 42),
      });
      showToast({ title: 'QR code decoded', description: raw.slice(0, 60) });
      autoScrollToElement(decodedResultRef);
    },
    [addQrHistory, showToast]
  );

  const startCamera = async () => {
    setCameraError(null);
    setScanFileError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      triggerHaptic('medium');
      autoScrollToElement(cameraBoxRef);

      requestAnimationFrame(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play().catch(() => {});

        const tick = () => {
          const video = videoRef.current;
          const canvas = scanCanvasRef.current;
          if (!video || !canvas || !streamRef.current) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imgData.data, imgData.width, imgData.height);
              if (code?.data) {
                handleDecoded(code.data);
                stopCamera();
                return;
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      });
    } catch {
      setCameraError(
        'Camera access is unavailable or denied. You can still upload or drop any QR code image below.'
      );
      triggerHaptic('error');
    }
  };

  const decodeUploadedImage = (file: File | undefined) => {
    if (!file) return;
    setScanFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code?.data) {
          handleDecoded(code.data);
        } else {
          setScanFileError('No QR code detected in that image. Try a clearer or higher-contrast crop.');
          triggerHaptic('warning');
        }
      };
      if (typeof reader.result === 'string') img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const downloadPng = () => {
    if (!qrDataUrl) return;
    triggerHaptic('success');
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `tooly-qr-${payloadType}.png`;
    a.click();
    addQrHistory({
      mode: 'generated',
      type: payloadType,
      payload: encodedPayload,
      label: encodedPayload.slice(0, 42),
    });
    showToast({ title: 'PNG downloaded & saved to history' });
  };

  const downloadSvg = () => {
    if (!qrSvg) return;
    triggerHaptic('success');
    const blob = new Blob([qrSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tooly-qr-${payloadType}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    addQrHistory({
      mode: 'generated',
      type: payloadType,
      payload: encodedPayload,
      label: encodedPayload.slice(0, 42),
    });
  };

  const isScannedUrl = scannedText ? /^https?:\/\//i.test(scannedText) : false;

  return (
    <div className="space-y-5">
      {/* Segmented Header */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            QR Studio
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Generate custom scannable codes or decode live camera frames and images
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-900/5 self-start sm:self-auto">
          {([
            { id: 'generate', label: 'Generate', icon: QrCode },
            { id: 'scan', label: 'Scan', icon: ScanLine },
            { id: 'history', label: `History (${state.qrHistory.length})`, icon: History },
          ] as const).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setTab(item.id);
                  autoScrollToElement(tabContentRef);
                }}
                className={`h-10 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  tab === item.id ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* GENERATE TAB */}
      <div ref={tabContentRef}>
      {tab === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap gap-1.5">
              {PAYLOAD_TYPES.map((pt) => (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setPayloadType(pt.id);
                  }}
                  className={`h-9 px-3.5 rounded-xl text-xs font-semibold transition-all ${
                    payloadType === pt.id
                      ? 'bg-[#007AFF] text-white shadow-xs shadow-[#007AFF]/20'
                      : 'bg-white/75 text-slate-700 hover:bg-white'
                  }`}
                >
                  {pt.label}
                </button>
              ))}
            </div>

            {payloadType === 'url' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Website URL</label>
                <input
                  type="url"
                  value={urlVal}
                  onChange={(e) => setUrlVal(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full h-11 px-4 rounded-xl glass-input text-sm"
                />
              </div>
            )}

            {payloadType === 'text' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Plain Text</label>
                <textarea
                  rows={4}
                  value={textVal}
                  onChange={(e) => setTextVal(e.target.value)}
                  placeholder="Type or paste any text…"
                  className="w-full p-4 rounded-2xl glass-input text-sm"
                />
              </div>
            )}

            {payloadType === 'wifi' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Network Name (SSID)</label>
                  <input
                    type="text"
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl glass-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
                  <input
                    type="text"
                    value={wifiPass}
                    onChange={(e) => setWifiPass(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl glass-input text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Security</label>
                  <select
                    value={wifiEnc}
                    onChange={(e) => setWifiEnc(e.target.value as 'WPA' | 'WEP' | 'nopass')}
                    className="w-full h-11 px-3 rounded-xl glass-input text-sm"
                  >
                    <option value="WPA">WPA / WPA2 / WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">Open (No Password)</option>
                  </select>
                </div>
              </div>
            )}

            {payloadType === 'vcard' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={vName}
                  onChange={(e) => setVName(e.target.value)}
                  placeholder="Full Name"
                  className="h-11 px-4 rounded-xl glass-input text-sm"
                />
                <input
                  type="text"
                  value={vOrg}
                  onChange={(e) => setVOrg(e.target.value)}
                  placeholder="Organization"
                  className="h-11 px-4 rounded-xl glass-input text-sm"
                />
                <input
                  type="tel"
                  value={vPhone}
                  onChange={(e) => setVPhone(e.target.value)}
                  placeholder="Phone"
                  className="h-11 px-4 rounded-xl glass-input text-sm"
                />
                <input
                  type="email"
                  value={vEmail}
                  onChange={(e) => setVEmail(e.target.value)}
                  placeholder="Email"
                  className="h-11 px-4 rounded-xl glass-input text-sm"
                />
              </div>
            )}

            {payloadType === 'email' && (
              <div className="space-y-3">
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="Recipient email"
                  className="w-full h-11 px-4 rounded-xl glass-input text-sm"
                />
                <input
                  type="text"
                  value={emailSubj}
                  onChange={(e) => setEmailSubj(e.target.value)}
                  placeholder="Subject line"
                  className="w-full h-11 px-4 rounded-xl glass-input text-sm"
                />
              </div>
            )}

            {payloadType === 'phone' && (
              <input
                type="tel"
                value={phoneNum}
                onChange={(e) => setPhoneNum(e.target.value)}
                placeholder="+1 415 555 0123"
                className="w-full h-11 px-4 rounded-xl glass-input text-sm font-mono"
              />
            )}

            {payloadType === 'sms' && (
              <div className="space-y-3">
                <input
                  type="tel"
                  value={smsNum}
                  onChange={(e) => setSmsNum(e.target.value)}
                  placeholder="Phone number"
                  className="w-full h-11 px-4 rounded-xl glass-input text-sm font-mono"
                />
                <textarea
                  rows={3}
                  value={smsMsg}
                  onChange={(e) => setSmsMsg(e.target.value)}
                  placeholder="SMS message"
                  className="w-full p-3.5 rounded-xl glass-input text-sm"
                />
              </div>
            )}

            {/* Styling Controls */}
            <div className="pt-4 border-t border-slate-200/70 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-white/70 border border-white p-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Foreground</span>
                <input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer"
                />
              </div>
              <div className="rounded-xl bg-white/70 border border-white p-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Background</span>
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer"
                />
              </div>
              <div className="rounded-xl bg-white/70 border border-white p-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Correction</span>
                <select
                  value={ecLevel}
                  onChange={(e) => setEcLevel(e.target.value as 'L' | 'M' | 'Q' | 'H')}
                  className="bg-transparent text-xs font-mono font-bold text-slate-900 focus:outline-none"
                >
                  <option value="L">L (7%)</option>
                  <option value="M">M (15%)</option>
                  <option value="Q">Q (25%)</option>
                  <option value="H">H (30%)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Live QR Preview */}
          <div ref={qrPreviewRef} className="lg:col-span-5 glass-panel rounded-3xl p-6 flex flex-col items-center space-y-5">
            <div className="p-4 rounded-3xl bg-white shadow-sm border border-slate-100">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Generated QR Code"
                  className="w-56 h-56 sm:w-64 sm:h-64 rounded-xl"
                />
              ) : (
                <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-6 gap-2 text-slate-400">
                  <QrCode className="w-10 h-10 opacity-50" />
                  <span className="text-xs font-medium text-slate-500">
                    Enter content on the left to generate your QR code
                  </span>
                </div>
              )}
            </div>

            <div className="w-full grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={downloadPng}
                disabled={!qrDataUrl}
                className="h-11 rounded-2xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm shadow-[#007AFF]/20 disabled:opacity-40 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>
              <button
                type="button"
                onClick={downloadSvg}
                disabled={!qrSvg}
                className="h-11 rounded-2xl bg-white/85 hover:bg-white border border-white text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Export SVG</span>
              </button>
            </div>

            <div className="w-full pt-3 border-t border-slate-200/70 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(encodedPayload);
                  triggerHaptic('success');
                  setCopiedPayload(true);
                  setTimeout(() => setCopiedPayload(false), 1400);
                }}
                className="h-9 px-3 rounded-xl bg-white/80 hover:bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5"
              >
                {copiedPayload ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPayload ? 'Copied' : 'Copy Data'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  createNoteFromPayload(`QR (${payloadType.toUpperCase()})`, encodedPayload, 'Personal')
                }
                className="h-9 px-3 rounded-xl bg-white/80 hover:bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5"
              >
                <NotebookPen className="w-3.5 h-3.5" />
                <span>Save Note</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCAN TAB */}
      {tab === 'scan' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-slate-900">Camera & Image Decoder</h2>
              {cameraActive ? (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="h-9 px-3.5 rounded-xl bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <CameraOff className="w-3.5 h-3.5" />
                  <span>Stop Camera</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startCamera}
                  className="h-9 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Start Live Camera</span>
                </button>
              )}
            </div>

            {cameraError && (
              <div className="p-3.5 rounded-2xl bg-amber-500/12 text-amber-900 text-xs leading-relaxed">
                {cameraError}
              </div>
            )}

            <div ref={cameraBoxRef} className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-slate-900/90 flex items-center justify-center">
              <video
                ref={videoRef}
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                muted
              />
              <canvas ref={scanCanvasRef} className="hidden" />
              {cameraActive ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="w-48 h-48 rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
                </div>
              ) : (
                <div className="text-center p-6 text-slate-300 space-y-2">
                  <ScanLine className="w-10 h-10 mx-auto text-sky-400" />
                  <p className="text-sm font-medium text-white">Point camera at any QR code</p>
                  <p className="text-xs text-slate-400">Or upload a screenshot / photo below</p>
                </div>
              )}
            </div>

            <label className="w-full h-12 rounded-2xl bg-white/80 hover:bg-white border border-dashed border-slate-300 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors">
              <Upload className="w-4 h-4 text-[#007AFF]" />
              <span>Upload QR Image (PNG / JPG / WebP)</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => decodeUploadedImage(e.target.files?.[0])}
              />
            </label>

            {scanFileError && <div className="text-xs text-rose-600 font-medium">{scanFileError}</div>}
          </div>

          {/* Decoded Result + Cross-Tool Actions */}
          <div ref={decodedResultRef} className="glass-panel rounded-3xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <h2 className="font-display font-bold text-slate-900">Decoded Payload</h2>
              {scannedText ? (
                <div className="rounded-2xl bg-white/80 border border-white p-4 font-mono text-sm text-slate-900 break-all whitespace-pre-wrap">
                  {scannedText}
                </div>
              ) : (
                <div className="rounded-2xl bg-white/50 border border-white p-8 text-center text-sm text-slate-500">
                  Scan a QR code with your camera or upload a QR image to unlock instant cross-tool actions.
                </div>
              )}
            </div>

            {scannedText && (
              <div className="space-y-3 pt-4 border-t border-slate-200/70">
                <div className="text-xs font-semibold text-slate-500">Cross-Tool Actions</div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(scannedText);
                      triggerHaptic('success');
                      showToast({ title: 'Copied scanned payload' });
                    }}
                    className="h-11 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Text</span>
                  </button>

                  {isScannedUrl ? (
                    <a
                      href={scannedText}
                      target="_blank"
                      rel="noreferrer"
                      className="h-11 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Link</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => createNoteFromPayload('Scanned QR Code', scannedText, 'Personal')}
                      className="h-11 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5"
                    >
                      <NotebookPen className="w-3.5 h-3.5" />
                      <span>Save to Notes</span>
                    </button>
                  )}

                  {isScannedUrl && (
                    <button
                      type="button"
                      onClick={() => createNoteFromPayload('Scanned QR Link', scannedText, 'Personal')}
                      className="h-11 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5"
                    >
                      <NotebookPen className="w-3.5 h-3.5" />
                      <span>Save to Notes</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      openQuickReminder({
                        title: isScannedUrl ? 'Check scanned link' : scannedText.slice(0, 60),
                        notes: scannedText,
                      })
                    }
                    className="h-11 rounded-xl bg-[#007AFF]/12 hover:bg-[#007AFF]/20 text-[#007AFF] text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <BellPlus className="w-3.5 h-3.5" />
                    <span>Create Reminder</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-slate-900">Recent QR Activity</h2>
            {state.qrHistory.length > 0 && (
              <button
                type="button"
                onClick={clearQrHistory}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
          </div>

          {state.qrHistory.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Downloaded or scanned QR codes will appear here for instant reuse.
            </div>
          ) : (
            <div className="divide-y divide-slate-200/70">
              {state.qrHistory.map((item) => (
                <div key={item.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-800 capitalize">{item.mode}</span>
                      <span>·</span>
                      <span className="uppercase">{item.type}</span>
                      <span>·</span>
                      <span className="font-mono">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="font-mono text-sm text-slate-900 truncate mt-0.5">{item.payload}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setPayloadType(item.type === 'url' ? 'url' : 'text');
                        if (item.type === 'url') setUrlVal(item.payload);
                        else setTextVal(item.payload);
                        setTab('generate');
                        autoScrollToElement(qrPreviewRef);
                      }}
                      className="h-8 px-3 rounded-lg bg-white/80 hover:bg-white text-xs font-semibold text-slate-800"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openQuickReminder({
                          title: `Follow up: ${item.label.slice(0, 40)}`,
                          notes: item.payload,
                        })
                      }
                      className="h-8 px-3 rounded-lg bg-[#007AFF]/12 text-xs font-semibold text-[#007AFF]"
                    >
                      Remind
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
};
