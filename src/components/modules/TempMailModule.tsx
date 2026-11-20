import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Inbox,
  KeyRound,
  Loader2,
  Mail,
  MailOpen,
  NotebookPen,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { autoScrollToElement } from '../../utils/autoScroll';
import { triggerHaptic } from '../../utils/haptics';

interface TempMailAccount {
  id: string;
  address: string;
  token: string;
  createdAt: string;
}

interface TempMailAddress {
  address: string;
  name?: string;
}

interface TempMailSummary {
  id: string;
  from?: TempMailAddress;
  to?: TempMailAddress[];
  subject?: string;
  intro?: string;
  seen?: boolean;
  hasAttachments?: boolean;
  createdAt?: string;
}

interface TempMailDetail extends TempMailSummary {
  text?: string;
  html?: string[];
}

const TEMP_MAIL_SESSION_KEY = 'tooly_temp_mail_session_v1';

function loadSavedSession(): TempMailAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TEMP_MAIL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TempMailAccount>;
    if (parsed && parsed.id && parsed.address && parsed.token) {
      return {
        id: parsed.id,
        address: parsed.address,
        token: parsed.token,
        createdAt: parsed.createdAt || new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveSession(account: TempMailAccount | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!account) {
      window.localStorage.removeItem(TEMP_MAIL_SESSION_KEY);
    } else {
      window.localStorage.setItem(TEMP_MAIL_SESSION_KEY, JSON.stringify(account));
    }
  } catch {
    // ignore quota issues
  }
}

function formatMailTime(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) {
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function extractVerificationCodes(subject: string, bodyText: string): string[] {
  const combined = `${subject}\n${bodyText}`;
  const found = new Set<string>();

  // Priority 1: Codes explicitly preceded by verification/OTP/PIN keywords
  const keywordRegex =
    /(?:code|otp|pin|passcode|verification|confirm|token)[^A-Za-z0-9]{0,16}([0-9]{4,8}|[0-9]{3}-[0-9]{3})/gi;
  let m: RegExpExecArray | null;
  while ((m = keywordRegex.exec(combined)) !== null) {
    found.add(m[1]);
  }

  // Priority 2: Standalone 4–6 digit numbers (skipping common years like 2024-2029)
  if (found.size === 0) {
    const bareRegex = /\b([0-9]{4,6})\b/g;
    while ((m = bareRegex.exec(combined)) !== null) {
      const val = m[1];
      if (/^20[2-3][0-9]$/.test(val)) continue;
      found.add(val);
      if (found.size >= 2) break;
    }
  }

  return Array.from(found).slice(0, 3);
}

function extractLinks(text: string, htmlStrings: string[]): string[] {
  const urls = new Set<string>();
  const combined = `${text}\n${htmlStrings.join('\n')}`;
  const regex = /https?:\/\/[^\s"'<>)\]]+/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(combined)) !== null) {
    const cleaned = m[0].replace(/[.,;!?]+$/, '');
    if (cleaned.length > 12 && !cleaned.match(/\.(png|jpg|jpeg|gif|svg|css|woff2?)($|\?)/i)) {
      urls.add(cleaned);
    }
    if (urls.size >= 6) break;
  }
  return Array.from(urls);
}

function buildSandboxedEmailDoc(htmlFragments: string[]): string {
  const body = htmlFragments.join('\n');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<base target="_blank" />
<style>
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "DM Sans", "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.55;
    color: #0f172a;
    background: #ffffff;
    word-break: break-word;
  }
  img { max-width: 100%; height: auto; }
  a { color: #007aff; }
  table { max-width: 100% !important; }
</style>
</head>
<body>${body}</body>
</html>`;
}

export const TempMailModule: React.FC = () => {
  const { createNoteFromPayload, sendToQr, showToast } = useHub();

  const [account, setAccount] = useState<TempMailAccount | null>(() => loadSavedSession());
  const [customPrefix, setCustomPrefix] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [messages, setMessages] = useState<TempMailSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<TempMailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [readerMode, setReaderMode] = useState<'html' | 'text'>('html');

  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const initialFetchDoneRef = useRef<boolean>(false);
  const readerCardRef = useRef<HTMLDivElement | null>(null);

  const copyAddress = useCallback(
    async (addr: string) => {
      try {
        await navigator.clipboard.writeText(addr);
        setCopiedAddr(true);
        triggerHaptic('success');
        showToast({ title: 'Temp address copied', description: addr });
        window.setTimeout(() => setCopiedAddr(false), 1800);
      } catch {
        showToast({ title: 'Address ready', description: addr });
      }
    },
    [showToast]
  );

  const fetchInbox = useCallback(
    async (targetAccount: TempMailAccount, silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch('/api/tempmail/messages', {
          headers: { Authorization: `Bearer ${targetAccount.token}` },
        });
        const data = (await res.json()) as { messages?: TempMailSummary[]; error?: string };

        if (res.status === 401) {
          setErrorMsg(data.error || 'Temporary inbox expired. Generate a fresh address.');
          setAccount(null);
          saveSession(null);
          setMessages([]);
          setActiveDetail(null);
          setSelectedId(null);
          return;
        }
        if (!res.ok) {
          if (!silent) setErrorMsg(data.error || 'Unable to check inbox right now.');
          return;
        }

        const list = data.messages || [];
        setErrorMsg(null);
        setMessages(list);
        setLastSyncedAt(Date.now());

        // Notify cleanly when a brand-new message arrives after initial load
        if (initialFetchDoneRef.current) {
          const newlyArrived = list.filter((m) => !knownMessageIdsRef.current.has(m.id));
          if (newlyArrived.length > 0) {
            triggerHaptic('success');
            const latest = newlyArrived[0];
            showToast({
              title: 'New email received',
              description: latest.subject || latest.from?.address || 'Tap to read message',
            });
          }
        }
        list.forEach((m) => knownMessageIdsRef.current.add(m.id));
        initialFetchDoneRef.current = true;
      } catch {
        if (!silent) setErrorMsg('Could not reach Mail.tm inbox right now.');
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [showToast]
  );

  const handleGenerateAddress = async () => {
    if (creating) return;
    setCreating(true);
    setErrorMsg(null);
    triggerHaptic('medium');

    try {
      const res = await fetch('/api/tempmail/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: customPrefix.trim() || undefined }),
      });
      const data = (await res.json()) as Partial<TempMailAccount> & { error?: string };
      if (!res.ok || !data.id || !data.address || !data.token) {
        throw new Error(data.error || 'Unable to generate temporary address.');
      }

      const fresh: TempMailAccount = {
        id: data.id,
        address: data.address,
        token: data.token,
        createdAt: data.createdAt || new Date().toISOString(),
      };

      knownMessageIdsRef.current = new Set();
      initialFetchDoneRef.current = false;
      setAccount(fresh);
      saveSession(fresh);
      setMessages([]);
      setSelectedId(null);
      setActiveDetail(null);
      setCustomPrefix('');

      await copyAddress(fresh.address);
      void fetchInbox(fresh, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create Temp Mail address.';
      setErrorMsg(msg);
      triggerHaptic('error');
    } finally {
      setCreating(false);
    }
  };

  const handleBurnAddress = async () => {
    if (!account) return;
    triggerHaptic('warning');
    const prev = account;
    setAccount(null);
    saveSession(null);
    setMessages([]);
    setSelectedId(null);
    setActiveDetail(null);
    setLastSyncedAt(null);
    setErrorMsg(null);
    knownMessageIdsRef.current = new Set();
    initialFetchDoneRef.current = false;

    showToast({ title: 'Disposable inbox deleted', description: prev.address });

    fetch(`/api/tempmail/account/${encodeURIComponent(prev.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${prev.token}` },
    }).catch(() => {});
  };

  const handleOpenMessage = async (msg: TempMailSummary) => {
    if (!account) return;
    triggerHaptic('selection');
    setSelectedId(msg.id);
    setLoadingDetail(true);
    setErrorMsg(null);
    autoScrollToElement(readerCardRef);

    // Optimistically mark seen in the inbox list
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, seen: true } : m)));

    try {
      const res = await fetch(`/api/tempmail/messages/${encodeURIComponent(msg.id)}`, {
        headers: { Authorization: `Bearer ${account.token}` },
      });
      const detail = (await res.json()) as TempMailDetail & { error?: string };
      if (!res.ok) {
        throw new Error(detail.error || 'Could not load message.');
      }
      setActiveDetail(detail);
      setReaderMode(detail.html && detail.html.length > 0 ? 'html' : 'text');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to open email.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!account) return;
    triggerHaptic('warning');
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    if (selectedId === msgId) {
      setSelectedId(null);
      setActiveDetail(null);
    }
    fetch(`/api/tempmail/messages/${encodeURIComponent(msgId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.token}` },
    }).catch(() => {});
    showToast({ title: 'Message removed' });
  };

  // Auto-refresh polling every 7 seconds while an active Temp Mail inbox exists
  useEffect(() => {
    if (!account) return;
    void fetchInbox(account, false);
    if (!autoRefresh) return;

    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchInbox(account, true);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [account, autoRefresh, fetchInbox]);

  const extractedCodes = useMemo(() => {
    if (!activeDetail) return [];
    const strippedHtml = (activeDetail.html || [])
      .join(' ')
      .replace(/<[^>]+>/g, ' ');
    return extractVerificationCodes(
      activeDetail.subject || '',
      activeDetail.text || strippedHtml
    );
  }, [activeDetail]);

  const extractedLinks = useMemo(() => {
    if (!activeDetail) return [];
    return extractLinks(activeDetail.text || '', activeDetail.html || []);
  }, [activeDetail]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    triggerHaptic('success');
    setCopiedCode(code);
    showToast({ title: `Copied code ${code}` });
    window.setTimeout(() => setCopiedCode((curr) => (curr === code ? null : curr)), 1800);
  };

  return (
    <div className="space-y-5">
      {/* Top Disposable Address Control Plate */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Temp Mail
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Instant free disposable inbox for signups, verification codes, and links
            </p>
          </div>

          {account && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setAutoRefresh((v) => !v);
                }}
                className={`h-9 px-3 rounded-xl border text-xs font-semibold transition-colors active:scale-95 ${
                  autoRefresh
                    ? 'bg-[#007AFF]/12 border-[#007AFF]/25 text-[#007AFF]'
                    : 'bg-white/75 border-white text-slate-600'
                }`}
              >
                Auto-Refresh {autoRefresh ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => account && fetchInbox(account, false)}
                disabled={refreshing}
                className="h-9 px-3 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          )}
        </div>

        {!account ? (
          /* Clean Empty Launch State — Zero Pre-Added Data */
          <div className="rounded-2xl bg-white/75 border border-white p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-[#007AFF]/12 text-[#007AFF] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="font-display text-base font-bold text-slate-900">
                  Create a fresh disposable email in one tap
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Powered by Mail.tm with no signup or API key. Incoming OTP codes and verification
                  links appear here automatically.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={customPrefix}
                onChange={(e) => setCustomPrefix(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateAddress()}
                placeholder="Optional custom prefix (e.g. shopping) or leave blank for random…"
                className="flex-1 min-w-0 h-11 px-4 rounded-xl glass-input text-sm"
              />
              <button
                type="button"
                onClick={handleGenerateAddress}
                disabled={creating}
                className="h-11 px-5 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm shadow-[#007AFF]/25 active:scale-95 disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>{creating ? 'Creating Inbox…' : 'Generate & Copy Address'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Active Disposable Address Bar */
          <div className="rounded-2xl bg-white/80 border border-white p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                  <span>Active Temporary Address</span>
                  {lastSyncedAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        Synced{' '}
                        {new Date(lastSyncedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </>
                  )}
                </div>
                <div className="font-mono text-base sm:text-xl font-bold text-slate-950 break-all mt-0.5 select-all">
                  {account.address}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyAddress(account.address)}
                  className="h-10 px-4 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs shadow-[#007AFF]/20 active:scale-95"
                >
                  {copiedAddr ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedAddr ? 'Copied' : 'Copy Address'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleGenerateAddress}
                  disabled={creating}
                  className="h-10 px-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-800 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {creating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-[#007AFF]" />
                  )}
                  <span>New Address</span>
                </button>

                <button
                  type="button"
                  onClick={() => sendToQr(`mailto:${account.address}`, 'email', 'Temp Mail')}
                  className="h-10 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-xs font-semibold text-[#007AFF] flex items-center gap-1.5 active:scale-95"
                  title="Create QR code for this temporary email"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">To QR</span>
                </button>

                <button
                  type="button"
                  onClick={handleBurnAddress}
                  className="h-10 px-3 rounded-xl bg-white hover:bg-rose-50 border border-slate-200/80 text-xs font-semibold text-rose-600 flex items-center gap-1.5 active:scale-95"
                  title="Delete disposable address"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-2xl bg-rose-500/12 border border-rose-200/80 px-4 py-3 text-xs font-medium text-rose-800">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Split Inbox & Clean Message Reader */}
      {account && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Incoming Mail List */}
          <div className="lg:col-span-5 glass-panel rounded-3xl p-4 sm:p-5 space-y-3">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="font-display text-lg font-bold text-slate-900">Inbox</h2>
              <span className="font-mono tabular-nums text-xs text-slate-500">
                {messages.length} {messages.length === 1 ? 'message' : 'messages'}
              </span>
            </div>

            {messages.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2">
                <div className="w-11 h-11 mx-auto rounded-2xl bg-white/80 border border-white flex items-center justify-center text-slate-400">
                  <Inbox className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-slate-800">Waiting for incoming mail…</div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Paste your temporary address wherever you need a verification code. Messages arrive
                  here automatically.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/70">
                {messages.map((msg) => {
                  const isSelected = selectedId === msg.id;
                  const isUnread = msg.seen === false;
                  const senderLabel = msg.from?.name || msg.from?.address || 'Unknown sender';
                  return (
                    <button
                      key={msg.id}
                      type="button"
                      onClick={() => handleOpenMessage(msg)}
                      className={`w-full text-left p-3 rounded-2xl transition-colors flex items-start gap-3 ${
                        isSelected
                          ? 'bg-white shadow-xs ring-1 ring-[#007AFF]/25'
                          : 'hover:bg-white/65'
                      }`}
                    >
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                          isUnread ? 'bg-[#007AFF]' : 'bg-transparent'
                        }`}
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={`text-xs truncate ${
                              isUnread ? 'font-bold text-slate-950' : 'font-semibold text-slate-700'
                            }`}
                          >
                            {senderLabel}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">
                            {formatMailTime(msg.createdAt)}
                          </span>
                        </div>
                        <div
                          className={`text-sm truncate ${
                            isUnread ? 'font-bold text-slate-950' : 'font-medium text-slate-800'
                          }`}
                        >
                          {msg.subject || '(No subject)'}
                        </div>
                        {msg.intro && (
                          <div className="text-xs text-slate-500 line-clamp-2">{msg.intro}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Clean Reader View with OTP & Link Extraction */}
          <div ref={readerCardRef} className="lg:col-span-7 glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
            {loadingDetail ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-[#007AFF]" />
                <span className="text-xs font-medium">Loading message…</span>
              </div>
            ) : !activeDetail ? (
              <div className="py-16 text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-white/80 border border-white flex items-center justify-center text-slate-400">
                  <MailOpen className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-slate-800">Select an email to read</div>
                <p className="text-xs text-slate-500">
                  Verification codes and confirmation links are highlighted automatically for 1-tap copy.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-200/70">
                  <div className="min-w-0 space-y-1">
                    <h2 className="font-display text-lg sm:text-xl font-bold text-slate-950 break-words">
                      {activeDetail.subject || '(No subject)'}
                    </h2>
                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-slate-800">
                        {activeDetail.from?.name || activeDetail.from?.address || 'Unknown sender'}
                      </span>
                      {activeDetail.from?.name && activeDetail.from?.address && (
                        <span className="font-mono text-slate-500">&lt;{activeDetail.from.address}&gt;</span>
                      )}
                      {activeDetail.createdAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-500">
                            {new Date(activeDetail.createdAt).toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        createNoteFromPayload(
                          activeDetail.subject || 'Temp Mail Message',
                          `From: ${activeDetail.from?.address || 'Unknown'}\n\n${
                            activeDetail.text || activeDetail.intro || ''
                          }`,
                          'Unfiled'
                        )
                      }
                      className="h-9 px-3 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                      title="Save email to Notes"
                    >
                      <NotebookPen className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Save Note</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(activeDetail.id)}
                      className="h-9 w-9 rounded-xl bg-white/85 hover:bg-rose-50 border border-white text-slate-400 hover:text-rose-600 flex items-center justify-center"
                      aria-label="Delete message"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Detected Verification Codes (1-Tap Copy) */}
                {extractedCodes.length > 0 && (
                  <div className="rounded-2xl bg-[#007AFF]/[0.08] border border-[#007AFF]/20 p-3.5 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#007AFF]">
                      <KeyRound className="w-4 h-4 shrink-0" />
                      <span>Detected Verification Code</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {extractedCodes.map((code) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => handleCopyCode(code)}
                          className="h-9 px-3.5 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white font-mono text-sm font-bold flex items-center gap-2 active:scale-95"
                        >
                          <span>{code}</span>
                          {copiedCode === code ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extracted Action / Confirmation Links */}
                {extractedLinks.length > 0 && (
                  <div className="rounded-2xl bg-white/75 border border-white p-3.5 space-y-2">
                    <div className="text-xs font-semibold text-slate-600">
                      Quick Links ({extractedLinks.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {extractedLinks.map((url, idx) => {
                        let hostLabel = url;
                        try {
                          const parsed = new URL(url);
                          hostLabel = `${parsed.hostname}${parsed.pathname.slice(0, 22)}`;
                        } catch {
                          // keep raw
                        }
                        return (
                          <a
                            key={`${url}-${idx}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-8 px-3 rounded-xl bg-white hover:bg-sky-50 border border-slate-200/80 text-xs font-medium text-[#007AFF] inline-flex items-center gap-1.5 max-w-full"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[220px]">{hostLabel}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reader Mode Toggle (HTML vs Plain Text) */}
                {activeDetail.html && activeDetail.html.length > 0 && activeDetail.text && (
                  <div className="flex items-center justify-end">
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-900/5">
                      <button
                        type="button"
                        onClick={() => setReaderMode('html')}
                        className={`h-7 px-3 rounded-lg text-xs font-semibold ${
                          readerMode === 'html' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Formatted
                      </button>
                      <button
                        type="button"
                        onClick={() => setReaderMode('text')}
                        className={`h-7 px-3 rounded-lg text-xs font-semibold ${
                          readerMode === 'text' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Plain Text
                      </button>
                    </div>
                  </div>
                )}

                {/* Sandboxed Email Body */}
                {readerMode === 'html' && activeDetail.html && activeDetail.html.length > 0 ? (
                  <div className="rounded-2xl overflow-hidden border border-slate-200/80 bg-white">
                    <iframe
                      title={activeDetail.subject || 'Email preview'}
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      srcDoc={buildSandboxedEmailDoc(activeDetail.html)}
                      className="w-full min-h-[340px] bg-white"
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white/80 border border-white p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed break-words">
                    {activeDetail.text || activeDetail.intro || 'This message has no text body.'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Quiet Footer Attribution */}
      <div className="px-2 flex items-center justify-between text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5 text-slate-400" />
          <span>Live disposable mailboxes via Mail.tm · No signup or API key needed</span>
        </span>
      </div>
    </div>
  );
};
