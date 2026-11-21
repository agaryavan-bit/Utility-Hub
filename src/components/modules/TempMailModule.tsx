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
  PenSquare,
  QrCode,
  RefreshCw,
  Reply,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { autoScrollToElement } from '../../utils/autoScroll';
import { triggerHaptic } from '../../utils/haptics';

type TempMailProvider = 'mailtm' | 'guerrilla' | 'maildrop';
type ProviderPreference = 'auto' | 'guerrilla' | 'maildrop';
type TempMailViewTab = 'inbox' | 'compose' | 'sent';

interface TempMailAccount {
  id: string;
  address: string;
  token: string;
  provider: TempMailProvider;
  mailbox?: string;
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

interface SentMailRecord {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  method: 'direct' | 'mail_app' | 'gmail';
  sentAt: string;
}

const TEMP_MAIL_SESSION_KEY = 'tooly_temp_mail_session_v1';
const TEMP_MAIL_SENT_KEY = 'tooly_temp_mail_sent_v1';
const MAILDROP_ENDPOINT = 'https://api.maildrop.cc/graphql';
const GUERRILLA_ENDPOINT = 'https://api.guerrillamail.com/ajax.php';
const GUERRILLA_DOMAINS = ['sharklasers.com', 'grr.la', 'guerrillamailblock.com'] as const;

async function safeParseJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function generateLocalHandle(customPrefix?: string): string {
  const cleanPrefix = (customPrefix || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 18);

  const bytes = new Uint8Array(3);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const randHex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  if (cleanPrefix) return `${cleanPrefix}${randHex.slice(0, 4)}`;

  const words = ['swift', 'clear', 'glass', 'nova', 'breeze', 'pulse', 'mint', 'sky', 'echo', 'halo'];
  const word = words[bytes[0] % words.length];
  return `${word}${randHex.slice(0, 5)}`;
}

function parseHeaderFrom(raw?: string): TempMailAddress {
  if (!raw) return { address: 'Unknown sender' };
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, '').trim();
    return { name: name || undefined, address: match[2].trim() };
  }
  return { address: raw.trim() };
}

function extractReadableTextFromMime(rawData?: string, html?: string): string {
  if (rawData) {
    const splitIdx = rawData.indexOf('\r\n\r\n');
    const lfSplitIdx = rawData.indexOf('\n\n');
    const bodyStart = splitIdx !== -1 ? splitIdx + 4 : lfSplitIdx !== -1 ? lfSplitIdx + 2 : 0;
    const candidate = rawData.slice(bodyStart).trim();
    if (candidate && !candidate.includes('Content-Type: multipart/')) {
      return candidate;
    }
  }
  if (html) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return rawData || '';
}

function loadSavedSession(): TempMailAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TEMP_MAIL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TempMailAccount>;
    if (parsed && parsed.id && parsed.address && parsed.token) {
      const inferredProvider: TempMailProvider =
        parsed.provider ||
        (parsed.address.endsWith('@maildrop.cc')
          ? 'maildrop'
          : parsed.address.includes('guerrilla') ||
            parsed.address.includes('sharklasers') ||
            parsed.address.includes('grr.la')
          ? 'guerrilla'
          : 'mailtm');
      return {
        id: parsed.id,
        address: parsed.address,
        token: parsed.token,
        provider: inferredProvider,
        mailbox: parsed.mailbox || parsed.address.split('@')[0],
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
    // ignore storage quota errors
  }
}

function loadSentHistory(): SentMailRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TEMP_MAIL_SENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SentMailRecord[]) : [];
  } catch {
    return [];
  }
}

function saveSentHistory(records: SentMailRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TEMP_MAIL_SENT_KEY, JSON.stringify(records.slice(0, 40)));
  } catch {
    // ignore storage quota errors
  }
}

function formatMailTime(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
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

  const keywordRegex =
    /(?:code|otp|pin|passcode|verification|confirm|token)[^A-Za-z0-9]{0,16}([0-9]{4,8}|[0-9]{3}-[0-9]{3})/gi;
  let m: RegExpExecArray | null;
  while ((m = keywordRegex.exec(combined)) !== null) {
    found.add(m[1]);
  }

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

// ==================== Provider Helpers (Backend Mail.tm + Fast Direct Browser APIs) ====================

async function createMailTmViaBackend(prefix?: string): Promise<TempMailAccount> {
  const res = await fetch('/api/tempmail/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ prefix: prefix || undefined }),
  });
  const data = await safeParseJson<Partial<TempMailAccount> & { error?: string }>(res);
  if (!res.ok || !data || !data.id || !data.address || !data.token) {
    throw new Error(data?.error || `Backend unavailable (${res.status})`);
  }
  return {
    id: data.id,
    address: data.address,
    token: data.token,
    provider: 'mailtm',
    mailbox: data.address.split('@')[0],
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

async function createGuerrillaDirect(prefix?: string): Promise<TempMailAccount> {
  const res = await fetch(
    `${GUERRILLA_ENDPOINT}?f=get_email_address&lang=en&_t=${Date.now()}`,
    { cache: 'no-store' }
  );
  const data = await safeParseJson<{ email_addr?: string; sid_token?: string }>(res);
  if (!res.ok || !data?.email_addr || !data?.sid_token) {
    throw new Error('Guerrilla Mail connection failed');
  }

  let mailboxUser = data.email_addr.split('@')[0];
  let sidToken = data.sid_token;

  if (prefix) {
    const cleanUser = generateLocalHandle(prefix).replace(/[^a-z0-9]/g, '').slice(0, 20);
    if (cleanUser) {
      const setRes = await fetch(
        `${GUERRILLA_ENDPOINT}?f=set_email_user&email_user=${encodeURIComponent(
          cleanUser
        )}&lang=en&sid_token=${encodeURIComponent(sidToken)}&_t=${Date.now()}`,
        { cache: 'no-store' }
      );
      const setData = await safeParseJson<{ email_addr?: string; sid_token?: string }>(setRes);
      if (setRes.ok && setData?.email_addr) {
        mailboxUser = setData.email_addr.split('@')[0];
        sidToken = setData.sid_token || sidToken;
      }
    }
  }

  // @sharklasers.com routes directly to the exact same Guerrilla Mail inbox with much higher acceptance
  return {
    id: `gm_${sidToken.slice(0, 12)}`,
    address: `${mailboxUser}@sharklasers.com`,
    token: sidToken,
    mailbox: mailboxUser,
    provider: 'guerrilla',
    createdAt: new Date().toISOString(),
  };
}

async function createMaildropDirect(prefix?: string): Promise<TempMailAccount> {
  const mailbox = generateLocalHandle(prefix).replace(/[^a-z0-9]/g, '').slice(0, 22);
  const res = await fetch(MAILDROP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      query: 'query($mailbox: String!) { inbox(mailbox: $mailbox) { id } }',
      variables: { mailbox },
    }),
  });
  const data = await safeParseJson<{ data?: { inbox?: unknown[] }; errors?: { message: string }[] }>(
    res
  );
  if (!res.ok || !data?.data || data.errors?.length) {
    throw new Error('Maildrop connection failed');
  }
  return {
    id: `md_${mailbox}`,
    address: `${mailbox}@maildrop.cc`,
    token: mailbox,
    mailbox,
    provider: 'maildrop',
    createdAt: new Date().toISOString(),
  };
}

async function listMessagesForAccount(
  targetAccount: TempMailAccount
): Promise<{ messages: TempMailSummary[]; expired?: boolean }> {
  if (targetAccount.provider === 'guerrilla') {
    // Call get_email_list with cache-buster so mobile browsers always pull fresh messages
    const res = await fetch(
      `${GUERRILLA_ENDPOINT}?f=get_email_list&offset=0&sid_token=${encodeURIComponent(
        targetAccount.token
      )}&_t=${Date.now()}`,
      { cache: 'no-store' }
    );
    const data = await safeParseJson<{
      list?: Array<{
        mail_id: string | number;
        mail_from?: string;
        mail_subject?: string;
        mail_excerpt?: string;
        mail_read?: number | string;
        mail_timestamp?: number | string;
        mail_date?: string;
      }>;
    }>(res);
    if (!res.ok || !data) {
      throw new Error('Unable to sync inbox right now.');
    }
    const list = (data.list || [])
      // Filter out Guerrilla's built-in synthetic welcome message (id = 1)
      .filter((item) => String(item.mail_id) !== '1')
      .map((item) => {
        const tsNum = Number(item.mail_timestamp);
        const iso =
          Number.isFinite(tsNum) && tsNum > 100000
            ? new Date(tsNum * 1000).toISOString()
            : item.mail_date;
        return {
          id: String(item.mail_id),
          from: { address: item.mail_from || 'Unknown sender' },
          subject: item.mail_subject || '(No subject)',
          intro: item.mail_excerpt || '',
          seen: Number(item.mail_read) === 1,
          createdAt: iso,
        };
      });
    return { messages: list };
  }

  if (targetAccount.provider === 'maildrop') {
    const mailbox = targetAccount.mailbox || targetAccount.address.split('@')[0];
    const res = await fetch(MAILDROP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        query:
          'query($mailbox: String!) { inbox(mailbox: $mailbox) { id headerfrom subject date } }',
        variables: { mailbox },
      }),
    });
    const data = await safeParseJson<{
      data?: {
        inbox?: Array<{ id: string; headerfrom?: string; subject?: string; date?: string }>;
      };
    }>(res);
    if (!res.ok || !data?.data?.inbox) {
      throw new Error('Unable to sync Maildrop inbox right now.');
    }
    const messages: TempMailSummary[] = data.data.inbox.map((item) => ({
      id: item.id,
      from: parseHeaderFrom(item.headerfrom),
      subject: item.subject || '(No subject)',
      createdAt: item.date,
      seen: false,
    }));
    return { messages };
  }

  // Mail.tm via Express backend
  const res = await fetch(`/api/tempmail/messages?_t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${targetAccount.token}` },
    cache: 'no-store',
  });
  if (res.status === 401) {
    return { messages: [], expired: true };
  }
  const data = await safeParseJson<{ messages?: TempMailSummary[]; error?: string }>(res);
  if (!res.ok || !data) {
    throw new Error(data?.error || 'Unable to sync inbox right now.');
  }
  return { messages: data.messages || [] };
}

async function fetchMessageDetailForAccount(
  targetAccount: TempMailAccount,
  msgId: string
): Promise<TempMailDetail> {
  if (targetAccount.provider === 'guerrilla') {
    const res = await fetch(
      `${GUERRILLA_ENDPOINT}?f=fetch_email&email_id=${encodeURIComponent(
        msgId
      )}&sid_token=${encodeURIComponent(targetAccount.token)}&_t=${Date.now()}`,
      { cache: 'no-store' }
    );
    const m = await safeParseJson<{
      mail_id?: string | number;
      mail_from?: string;
      mail_subject?: string;
      mail_body?: string;
      mail_timestamp?: number | string;
    }>(res);
    if (!res.ok || !m) {
      throw new Error('Could not load message contents.');
    }
    const body = m.mail_body || '';
    const looksHtml = /<[a-z][\s\S]*>/i.test(body);
    const tsNum = Number(m.mail_timestamp);
    return {
      id: String(m.mail_id || msgId),
      from: { address: m.mail_from || 'Unknown sender' },
      subject: m.mail_subject || '(No subject)',
      createdAt:
        Number.isFinite(tsNum) && tsNum > 100000 ? new Date(tsNum * 1000).toISOString() : undefined,
      html: looksHtml ? [body] : [],
      text: looksHtml ? extractReadableTextFromMime(undefined, body) : body,
      seen: true,
    };
  }

  if (targetAccount.provider === 'maildrop') {
    const mailbox = targetAccount.mailbox || targetAccount.address.split('@')[0];
    const res = await fetch(MAILDROP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        query:
          'query($mailbox: String!, $id: String!) { message(mailbox: $mailbox, id: $id) { id headerfrom subject date data html } }',
        variables: { mailbox, id: msgId },
      }),
    });
    const parsed = await safeParseJson<{
      data?: {
        message?: {
          id: string;
          headerfrom?: string;
          subject?: string;
          date?: string;
          data?: string;
          html?: string;
        };
      };
    }>(res);
    const m = parsed?.data?.message;
    if (!res.ok || !m) {
      throw new Error('Could not load message contents.');
    }
    return {
      id: m.id,
      from: parseHeaderFrom(m.headerfrom),
      subject: m.subject || '(No subject)',
      createdAt: m.date,
      html: m.html ? [m.html] : [],
      text: extractReadableTextFromMime(m.data, m.html),
      seen: true,
    };
  }

  const res = await fetch(`/api/tempmail/messages/${encodeURIComponent(msgId)}`, {
    headers: { Authorization: `Bearer ${targetAccount.token}` },
    cache: 'no-store',
  });
  const detail = await safeParseJson<TempMailDetail & { error?: string }>(res);
  if (!res.ok || !detail) {
    throw new Error(detail?.error || 'Could not load message.');
  }
  return detail;
}

function deleteMessageForAccount(targetAccount: TempMailAccount, msgId: string): void {
  if (targetAccount.provider === 'guerrilla') {
    fetch(
      `${GUERRILLA_ENDPOINT}?f=del_email&email_ids[]=${encodeURIComponent(
        msgId
      )}&sid_token=${encodeURIComponent(targetAccount.token)}`
    ).catch(() => {});
    return;
  }

  if (targetAccount.provider === 'maildrop') {
    const mailbox = targetAccount.mailbox || targetAccount.address.split('@')[0];
    fetch(MAILDROP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'mutation($mailbox: String!, $id: String!) { delete(mailbox: $mailbox, id: $id) }',
        variables: { mailbox, id: msgId },
      }),
    }).catch(() => {});
    return;
  }

  fetch(`/api/tempmail/messages/${encodeURIComponent(msgId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${targetAccount.token}` },
  }).catch(() => {});
}

export const TempMailModule: React.FC = () => {
  const { createNoteFromPayload, sendToQr, showToast } = useHub();

  const [account, setAccount] = useState<TempMailAccount | null>(() => loadSavedSession());
  const [providerPref, setProviderPref] = useState<ProviderPreference>('auto');
  const [customPrefix, setCustomPrefix] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [viewTab, setViewTab] = useState<TempMailViewTab>('inbox');

  const [messages, setMessages] = useState<TempMailSummary[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<TempMailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [readerMode, setReaderMode] = useState<'html' | 'text'>('html');

  // Compose & Sent state
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [includeReplyFooter, setIncludeReplyFooter] = useState(true);
  const [sendingDirect, setSendingDirect] = useState(false);
  const [composeNotice, setComposeNotice] = useState<string | null>(null);
  const [sentHistory, setSentHistory] = useState<SentMailRecord[]>(() => loadSentHistory());

  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const initialFetchDoneRef = useRef<boolean>(false);
  const readerCardRef = useRef<HTMLDivElement | null>(null);
  const composeCardRef = useRef<HTMLDivElement | null>(null);

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
        const result = await listMessagesForAccount(targetAccount);
        if (result.expired) {
          setErrorMsg('Temporary inbox expired. Generate a fresh address.');
          setAccount(null);
          saveSession(null);
          setMessages([]);
          setActiveDetail(null);
          setSelectedId(null);
          return;
        }

        const list = result.messages;
        setErrorMsg(null);
        setMessages(list);
        setLastSyncedAt(Date.now());

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
      } catch (err) {
        if (!silent) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to check inbox right now.');
        }
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [showToast]
  );

  const handleGenerateAddress = async (forcedPref?: ProviderPreference) => {
    if (creating) return;
    setCreating(true);
    setErrorMsg(null);
    triggerHaptic('medium');

    const prefix = customPrefix.trim() || undefined;
    const pref = forcedPref || providerPref;

    try {
      let fresh: TempMailAccount | null = null;

      if (pref === 'maildrop') {
        fresh = await createMaildropDirect(prefix);
      } else if (pref === 'guerrilla') {
        fresh = await createGuerrillaDirect(prefix);
      } else {
        // Auto (Fastest):
        // 1. Try Mail.tm via Node backend first (instant, private, zero greylisting)
        try {
          fresh = await createMailTmViaBackend(prefix);
        } catch {
          // Static host (Render Static Site / GitHub Pages) -> proceed to zero-greylist Guerrilla Mail
        }

        // 2. Direct browser fallback #1: Guerrilla Mail (@sharklasers.com — fast, zero greylisting, ACAO: *)
        if (!fresh) {
          try {
            fresh = await createGuerrillaDirect(prefix);
          } catch {
            // Try Maildrop as final backup
          }
        }

        // 3. Direct browser fallback #2: Maildrop (@maildrop.cc)
        if (!fresh) {
          fresh = await createMaildropDirect(prefix);
        }
      }

      knownMessageIdsRef.current = new Set();
      initialFetchDoneRef.current = false;
      setReadIds(new Set());
      setAccount(fresh);
      saveSession(fresh);
      setMessages([]);
      setSelectedId(null);
      setActiveDetail(null);
      setCustomPrefix('');
      setViewTab('inbox');

      await copyAddress(fresh.address);
      void fetchInbox(fresh, true);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to create Temp Mail address right now. Please check your internet connection and retry.';
      setErrorMsg(msg);
      triggerHaptic('error');
    } finally {
      setCreating(false);
    }
  };

  const handleSwitchGuerrillaDomain = (domain: (typeof GUERRILLA_DOMAINS)[number]) => {
    if (!account || account.provider !== 'guerrilla') return;
    const user = account.mailbox || account.address.split('@')[0];
    const updated: TempMailAccount = {
      ...account,
      address: `${user}@${domain}`,
    };
    setAccount(updated);
    saveSession(updated);
    void copyAddress(updated.address);
  };

  const handleBurnAddress = async () => {
    if (!account) return;
    triggerHaptic('warning');
    const prev = account;
    setAccount(null);
    saveSession(null);
    setMessages([]);
    setReadIds(new Set());
    setSelectedId(null);
    setActiveDetail(null);
    setLastSyncedAt(null);
    setErrorMsg(null);
    knownMessageIdsRef.current = new Set();
    initialFetchDoneRef.current = false;

    showToast({ title: 'Disposable inbox deleted', description: prev.address });

    if (prev.provider === 'mailtm') {
      fetch(`/api/tempmail/account/${encodeURIComponent(prev.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${prev.token}` },
      }).catch(() => {});
    }
  };

  const handleOpenMessage = async (msg: TempMailSummary) => {
    if (!account) return;
    triggerHaptic('selection');
    setSelectedId(msg.id);
    setLoadingDetail(true);
    setErrorMsg(null);
    autoScrollToElement(readerCardRef);

    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(msg.id);
      return next;
    });
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, seen: true } : m)));

    try {
      const detail = await fetchMessageDetailForAccount(account, msg.id);
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
    deleteMessageForAccount(account, msgId);
    showToast({ title: 'Message removed' });
  };

  const openReplyInCompose = (detail: TempMailDetail) => {
    const replyTo = detail.from?.address || '';
    const subj = detail.subject || '';
    setComposeTo(replyTo);
    setComposeSubject(subj.toLowerCase().startsWith('re:') ? subj : `Re: ${subj}`);
    setComposeBody('');
    setComposeNotice(null);
    setViewTab('compose');
    triggerHaptic('selection');
    autoScrollToElement(composeCardRef);
  };

  // Auto-refresh polling every 5 seconds while an active Temp Mail inbox exists
  useEffect(() => {
    if (!account) return;
    void fetchInbox(account, false);
    if (!autoRefresh) return;

    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchInbox(account, true);
    }, 5000);

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

  // ==================== Compose & Send Helpers ====================

  const trimmedTo = composeTo.trim();
  const isValidRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedTo);

  const finalComposeBody = useMemo(() => {
    const base = composeBody.trim();
    if (includeReplyFooter && account?.address) {
      return `${base}${base ? '\n\n' : ''}—\nReply to my temporary inbox: ${account.address}`;
    }
    return base;
  }, [composeBody, includeReplyFooter, account?.address]);

  const mailtoHref = useMemo(() => {
    const params = new URLSearchParams();
    if (composeSubject.trim()) params.set('subject', composeSubject.trim());
    if (finalComposeBody) params.set('body', finalComposeBody);
    const qs = params.toString().replace(/\+/g, '%20');
    return `mailto:${encodeURIComponent(trimmedTo)}${qs ? `?${qs}` : ''}`;
  }, [trimmedTo, composeSubject, finalComposeBody]);

  const gmailHref = useMemo(() => {
    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: trimmedTo,
      su: composeSubject.trim(),
      body: finalComposeBody,
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
  }, [trimmedTo, composeSubject, finalComposeBody]);

  const recordSentMessage = (method: SentMailRecord['method']) => {
    const entry: SentMailRecord = {
      id: `sent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      from: account?.address || 'Your Email App',
      to: trimmedTo,
      subject: composeSubject.trim() || '(No subject)',
      body: finalComposeBody,
      method,
      sentAt: new Date().toISOString(),
    };
    setSentHistory((prev) => {
      const next = [entry, ...prev].slice(0, 40);
      saveSentHistory(next);
      return next;
    });
  };

  const handleSendDirect = async () => {
    if (!isValidRecipient) {
      setComposeNotice('Please enter a valid recipient email address (e.g. name@example.com).');
      triggerHaptic('error');
      return;
    }
    if (!composeBody.trim() && !composeSubject.trim()) {
      setComposeNotice('Please enter a subject or message before sending.');
      triggerHaptic('error');
      return;
    }

    setSendingDirect(true);
    setComposeNotice(null);
    triggerHaptic('medium');

    try {
      // Ensure we have a Guerrilla Mail session token for direct anonymous relay
      let sidToken = account?.provider === 'guerrilla' ? account.token : '';
      let fromAddr = account?.address || '';

      if (!sidToken) {
        const initRes = await fetch(
          `${GUERRILLA_ENDPOINT}?f=get_email_address&lang=en&_t=${Date.now()}`,
          { cache: 'no-store' }
        );
        const initData = await safeParseJson<{ email_addr?: string; sid_token?: string }>(initRes);
        if (initData?.sid_token) {
          sidToken = initData.sid_token;
          if (!fromAddr && initData.email_addr) fromAddr = initData.email_addr;
        }
      }

      if (!sidToken) {
        throw new Error('Direct relay unavailable right now.');
      }

      const form = new URLSearchParams({
        f: 'send_email',
        sid_token: sidToken,
        to: trimmedTo,
        from: fromAddr,
        subject: composeSubject.trim() || '(No subject)',
        body: finalComposeBody || composeSubject.trim(),
      });

      const sendRes = await fetch(GUERRILLA_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const result = await safeParseJson<{
        valid?: boolean;
        needs_captcha?: boolean;
        error?: string | null;
      }>(sendRes);

      if (result?.valid) {
        recordSentMessage('direct');
        triggerHaptic('success');
        showToast({ title: 'Message sent directly', description: `To: ${trimmedTo}` });
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
        setComposeNotice(null);
        setViewTab('sent');
        return;
      }

      if (result?.needs_captcha) {
        setComposeNotice(
          'External recipients (like Gmail/Outlook) block unverified anonymous SMTP to stop spam. Tap "Send via Mail App" or "Open in Gmail" below — your message and Temp Mail reply address are already pre-filled!'
        );
        triggerHaptic('warning');
        return;
      }

      throw new Error(result?.error || 'Direct relay could not deliver to this recipient.');
    } catch {
      setComposeNotice(
        'Direct anonymous relay is restricted for this recipient. Tap "Send via Mail App" or "Open in Gmail" below to send immediately with your Temp Mail reply address attached.'
      );
      triggerHaptic('warning');
    } finally {
      setSendingDirect(false);
    }
  };

  const handleCopyDraft = () => {
    const formatted = `To: ${trimmedTo}\nSubject: ${composeSubject.trim()}\n\n${finalComposeBody}`;
    navigator.clipboard.writeText(formatted);
    triggerHaptic('success');
    showToast({ title: 'Message draft copied' });
  };

  const handleDeleteSent = (id: string) => {
    triggerHaptic('warning');
    setSentHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveSentHistory(next);
      return next;
    });
  };

  const providerName =
    account?.provider === 'guerrilla'
      ? 'Guerrilla Mail (Fast)'
      : account?.provider === 'maildrop'
      ? 'Maildrop'
      : 'Mail.tm';

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
              Fast free disposable inbox for verification codes, links, and messaging
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setComposeNotice(null);
                setViewTab((curr) => (curr === 'compose' ? 'inbox' : 'compose'));
                autoScrollToElement(composeCardRef);
              }}
              className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors active:scale-95 ${
                viewTab === 'compose'
                  ? 'bg-[#007AFF] text-white shadow-xs shadow-[#007AFF]/20'
                  : 'bg-white/85 hover:bg-white border border-white text-[#007AFF]'
              }`}
            >
              <PenSquare className="w-3.5 h-3.5" />
              <span>Compose</span>
            </button>

            {account && (
              <>
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
                  Auto {autoRefresh ? 'On' : 'Off'}
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
              </>
            )}
          </div>
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
                  Free instant inbox with no signup or API key. Incoming OTP codes and verification
                  links arrive here automatically.
                </p>
              </div>
            </div>

            {/* Provider Selector (Auto picks fastest zero-greylist service) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 mr-1">Server:</span>
              {(
                [
                  { id: 'auto', label: 'Auto (Fastest)' },
                  { id: 'guerrilla', label: 'SharkLasers / Guerrilla' },
                  { id: 'maildrop', label: 'Maildrop' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setProviderPref(opt.id);
                  }}
                  className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    providerPref === opt.id
                      ? 'bg-[#007AFF] text-white'
                      : 'bg-slate-900/[0.05] text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={customPrefix}
                onChange={(e) => setCustomPrefix(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateAddress()}
                placeholder="Optional custom prefix (e.g. shopping)…"
                className="w-full sm:flex-1 min-w-0 h-11 shrink-0 px-4 rounded-xl glass-input text-sm"
              />
              <button
                type="button"
                onClick={() => handleGenerateAddress()}
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
                <div className="text-[11px] font-medium text-slate-500 flex flex-wrap items-center gap-1.5">
                  <span>Active Temporary Address</span>
                  <span aria-hidden="true">·</span>
                  <span>{providerName}</span>
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
                  onClick={() => handleGenerateAddress()}
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

            {/* Instant Alias Switcher for Guerrilla Mail (all domains share the exact same live inbox!) */}
            {account.provider === 'guerrilla' && (
              <div className="pt-2.5 border-t border-slate-200/70 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500 mr-1">
                  Domain alias (same inbox):
                </span>
                {GUERRILLA_DOMAINS.map((dom) => {
                  const isSelected = account.address.endsWith(`@${dom}`);
                  return (
                    <button
                      key={dom}
                      type="button"
                      onClick={() => handleSwitchGuerrillaDomain(dom)}
                      className={`h-7 px-2.5 rounded-lg text-[11px] font-mono font-semibold transition-colors ${
                        isSelected
                          ? 'bg-[#007AFF]/12 text-[#007AFF] border border-[#007AFF]/25'
                          : 'bg-slate-900/[0.04] text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      @{dom}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Helpful 1-tap upgrade prompt if user had an older Maildrop session saved */}
            {account.provider === 'maildrop' && (
              <div className="pt-2.5 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 bg-amber-500/10 rounded-xl px-3 py-2">
                <span>
                  Maildrop delays or filters some senders (greylisting). Switch to SharkLasers for
                  faster 2–5s delivery:
                </span>
                <button
                  type="button"
                  onClick={() => handleGenerateAddress('guerrilla')}
                  disabled={creating}
                  className="h-7 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold shrink-0"
                >
                  Switch to Fast Inbox
                </button>
              </div>
            )}
          </div>
        )}

        {/* Segmented Sub-View Switcher (Inbox · Compose · Sent) */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/65 border border-white w-fit">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setViewTab('inbox');
            }}
            className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewTab === 'inbox' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Inbox</span>
            {account && (
              <span className="font-mono text-[11px] text-slate-500">({messages.length})</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setViewTab('compose');
              autoScrollToElement(composeCardRef);
            }}
            className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewTab === 'compose' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Message</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setViewTab('sent');
            }}
            className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewTab === 'sent' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Sent</span>
            {sentHistory.length > 0 && (
              <span className="font-mono text-[11px] text-slate-500">({sentHistory.length})</span>
            )}
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-2xl bg-rose-500/12 border border-rose-200/80 px-4 py-3 text-xs font-medium text-rose-800">
            {errorMsg}
          </div>
        )}
      </div>

      {/* VIEW 1: COMPOSE & SEND MESSAGE TO A RECIPIENT */}
      {viewTab === 'compose' && (
        <div ref={composeCardRef} className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Send a Message to a Recipient
              </h2>
              <p className="text-xs text-slate-500">
                Compose once and send directly, through your phone’s Mail app, or via Gmail
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {account && (
              <div className="rounded-xl bg-white/65 border border-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0 truncate">
                  <span className="text-slate-500 mr-1.5">Temp Inbox:</span>
                  <span className="font-mono font-semibold text-slate-900">{account.address}</span>
                </div>
                <label className="inline-flex items-center gap-2 text-slate-700 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeReplyFooter}
                    onChange={(e) => setIncludeReplyFooter(e.target.checked)}
                    className="rounded border-slate-300 text-[#007AFF] focus:ring-[#007AFF]"
                  />
                  <span>Add Reply-To footer</span>
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 px-1">
                  Recipient Email (To)
                </label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => {
                    setComposeTo(e.target.value);
                    if (composeNotice) setComposeNotice(null);
                  }}
                  placeholder="recipient@example.com"
                  className="w-full h-11 px-4 rounded-xl glass-input text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 px-1">Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Message subject…"
                  className="w-full h-11 px-4 rounded-xl glass-input text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 px-1">Message</label>
              <textarea
                rows={5}
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Write your message to the recipient…"
                className="w-full p-4 rounded-2xl glass-input text-sm resize-y min-h-[120px]"
              />
            </div>

            {composeNotice && (
              <div className="rounded-2xl bg-amber-500/12 border border-amber-200/80 px-4 py-3 text-xs font-medium text-amber-900 leading-relaxed">
                {composeNotice}
              </div>
            )}

            {/* Send Action Row */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <a
                href={isValidRecipient ? mailtoHref : undefined}
                onClick={(e) => {
                  if (!isValidRecipient) {
                    e.preventDefault();
                    setComposeNotice('Enter a valid recipient email address first.');
                    triggerHaptic('error');
                    return;
                  }
                  recordSentMessage('mail_app');
                  triggerHaptic('success');
                  showToast({
                    title: 'Opening Mail App',
                    description: `Pre-filled message to ${trimmedTo}`,
                  });
                }}
                className="h-11 px-5 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold inline-flex items-center gap-2 shadow-sm shadow-[#007AFF]/25 active:scale-95 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send via Mail App</span>
              </a>

              <a
                href={isValidRecipient ? gmailHref : undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!isValidRecipient) {
                    e.preventDefault();
                    setComposeNotice('Enter a valid recipient email address first.');
                    triggerHaptic('error');
                    return;
                  }
                  recordSentMessage('gmail');
                  triggerHaptic('success');
                  showToast({
                    title: 'Opening Gmail Compose',
                    description: `To: ${trimmedTo}`,
                  });
                }}
                className="h-11 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-800 inline-flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#007AFF]" />
                <span>Open in Gmail</span>
              </a>

              <button
                type="button"
                onClick={handleSendDirect}
                disabled={sendingDirect}
                className="h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-2 shadow-xs shadow-emerald-600/20 active:scale-95 disabled:opacity-60"
              >
                {sendingDirect ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>{sendingDirect ? 'Sending…' : 'Try Direct Relay'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyDraft}
                className="h-11 px-3.5 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 active:scale-95"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Draft</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: SENT LOG */}
      {viewTab === 'sent' && (
        <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">Sent Messages</h2>
            <span className="font-mono text-xs text-slate-500">
              {sentHistory.length} {sentHistory.length === 1 ? 'message' : 'messages'}
            </span>
          </div>

          {sentHistory.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-11 h-11 mx-auto rounded-2xl bg-white/80 border border-white flex items-center justify-center text-slate-400">
                <Send className="w-5 h-5" />
              </div>
              <div className="text-sm font-semibold text-slate-800">No sent messages yet</div>
              <p className="text-xs text-slate-500">
                Tap Send Message above to compose and email any recipient.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sentHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl bg-white/75 border border-white p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500 truncate">
                        To: <span className="font-mono font-semibold text-slate-800">{item.to}</span>
                      </div>
                      <div className="font-display font-bold text-sm text-slate-950 truncate mt-0.5">
                        {item.subject}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatMailTime(item.sentAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setComposeTo(item.to);
                          setComposeSubject(item.subject);
                          setComposeBody(item.body);
                          setViewTab('compose');
                        }}
                        className="h-7 px-2.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200/80 text-[11px] font-semibold text-[#007AFF]"
                      >
                        Reuse
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSent(item.id)}
                        className="h-7 w-7 rounded-lg bg-white hover:bg-rose-50 border border-slate-200/80 text-slate-400 hover:text-rose-600 flex items-center justify-center"
                        aria-label="Delete sent record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {item.body && (
                    <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">
                      {item.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: SPLIT INBOX & CLEAN MESSAGE READER */}
      {viewTab === 'inbox' && account && (
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
                  Paste <span className="font-mono text-slate-700">{account.address}</span> wherever
                  you need a code or send a test email to it. Checks every 5 seconds automatically.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/70">
                {messages.map((msg) => {
                  const isSelected = selectedId === msg.id;
                  const isUnread = msg.seen === false && !readIds.has(msg.id);
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

          {/* Right: Clean Reader View with OTP, Quick Links & 1-Tap Reply */}
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
                      onClick={() => openReplyInCompose(activeDetail)}
                      className="h-9 px-3 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95"
                      title="Reply to sender"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Reply</span>
                    </button>
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
          <span>Live disposable mailboxes · Fast delivery with no signup or API key</span>
        </span>
      </div>
    </div>
  );
};
