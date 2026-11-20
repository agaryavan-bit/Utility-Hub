import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSubToolById } from '../data/toolyCatalog';
import {
  ActiveModule,
  AnkiCard,
  AnkiDeck,
  HubPreferences,
  InterpreterHistoryItem,
  NoteItem,
  NoteTint,
  NoteToAnkiDraft,
  PersistedHubState,
  QrHistoryItem,
  QrPayloadType,
  QuickReminderDraft,
  ReminderItem,
  ReminderList,
  ToastMessage,
  ToolyCategoryId,
  WeatherCity,
  WeatherForecastCache,
} from '../types/hub';
import { configureHaptics, triggerHaptic } from '../utils/haptics';

const STORAGE_KEY = 'tooly_hub_state_v2';

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysIso(days: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function makeId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function createInitialState(): PersistedHubState {
  return {
    version: 2,
    pinnedToolIds: [],
    favoriteCategories: [],
    noteFolders: ['All Notes'],
    notes: [],
    reminderLists: [],
    reminders: [],
    ankiDecks: [],
    ankiCards: [],
    ankiStats: {
      reviewedToday: 0,
      lastReviewDate: '',
      streakDays: 0,
      totalReviews: 0,
    },
    qrHistory: [],
    interpreterHistory: [],
    weatherCities: [],
    activeWeatherCityId: '',
    weatherCache: {},
    preferences: {
      hapticsEnabled: true,
      soundHapticsEnabled: true,
      tempUnit: 'C',
    },
  };
}

function loadPersistedState(): PersistedHubState {
  if (typeof window === 'undefined') return createInitialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as Partial<PersistedHubState>;
    const defaults = createInitialState();
    return {
      ...defaults,
      ...parsed,
      preferences: {
        ...defaults.preferences,
        ...(parsed.preferences ?? {}),
      },
      ankiStats: {
        ...defaults.ankiStats,
        ...(parsed.ankiStats ?? {}),
      },
    };
  } catch {
    return createInitialState();
  }
}

interface PendingQrDraft {
  type: QrPayloadType;
  payload: string;
  label?: string;
  nonce: number;
}

interface HubContextValue {
  state: PersistedHubState;
  activeModule: ActiveModule;
  setActiveModule: (mod: ActiveModule) => void;
  activeToolyCategory: ToolyCategoryId | null;
  activeToolySubToolId: string | null;
  openToolyCategory: (catId: ToolyCategoryId, subToolId?: string) => void;
  closeToolyCategory: () => void;
  openToolySubTool: (subToolId: string) => void;

  // Modals & Overlays
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  quickReminderDraft: QuickReminderDraft | null;
  openQuickReminder: (draft: QuickReminderDraft) => void;
  closeQuickReminder: () => void;
  noteToAnkiDraft: NoteToAnkiDraft | null;
  openNoteToAnki: (draft: NoteToAnkiDraft) => void;
  closeNoteToAnki: () => void;

  // Cross-Tool Handoffs
  pendingQrDraft: PendingQrDraft | null;
  clearPendingQrDraft: () => void;
  sendToQr: (payload: string, type?: QrPayloadType, label?: string) => void;
  createNoteFromPayload: (title: string, content: string, folder?: string) => NoteItem;

  // Tooly Pins & Favorites
  togglePinTool: (subToolId: string) => void;
  toggleFavoriteCategory: (catId: ToolyCategoryId) => void;

  // Notes CRUD
  saveNote: (note: NoteItem) => void;
  createNote: (folder?: string, tint?: NoteTint) => NoteItem;
  deleteNote: (id: string) => void;
  addNoteFolder: (name: string) => void;

  // Reminders CRUD
  addReminder: (rem: Omit<ReminderItem, 'id' | 'createdAt' | 'completed'>) => ReminderItem;
  updateReminder: (rem: ReminderItem) => void;
  toggleReminderCompleted: (id: string) => void;
  deleteReminder: (id: string) => void;
  addReminderList: (name: string, color: string) => ReminderList;

  // AnkiDroid CRUD
  addAnkiDeck: (name: string, description: string, color: string) => AnkiDeck;
  deleteAnkiDeck: (deckId: string) => void;
  addAnkiCards: (
    deckId: string,
    cards: { front: string; back: string; type?: 'basic' | 'cloze'; hint?: string; tags?: string[] }[]
  ) => void;
  updateAnkiCard: (card: AnkiCard) => void;
  deleteAnkiCard: (cardId: string) => void;
  reviewAnkiCard: (cardId: string, rating: 1 | 2 | 3 | 4) => void;

  // QR History
  addQrHistory: (item: Omit<QrHistoryItem, 'id' | 'timestamp'>) => void;
  clearQrHistory: () => void;

  // Interpreter History
  addInterpreterHistory: (item: Omit<InterpreterHistoryItem, 'id' | 'timestamp'>) => InterpreterHistoryItem;
  deleteInterpreterHistory: (id: string) => void;
  clearInterpreterHistory: () => void;

  // Weather
  weatherLoading: boolean;
  weatherError: string | null;
  setActiveWeatherCityId: (cityId: string) => void;
  addWeatherCity: (city: WeatherCity) => void;
  removeWeatherCity: (cityId: string) => void;
  refreshWeatherForCity: (city: WeatherCity, force?: boolean) => Promise<void>;

  // Preferences & Backup
  updatePreferences: (patch: Partial<HubPreferences>) => void;
  exportBackupJson: () => string;
  importBackupJson: (jsonText: string) => boolean;
  resetAllData: () => void;

  // Toasts
  toasts: ToastMessage[];
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const HubContext = createContext<HubContextValue | null>(null);

export const HubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PersistedHubState>(() => loadPersistedState());
  const [activeModule, setActiveModuleState] = useState<ActiveModule>('hub');
  const [activeToolyCategory, setActiveToolyCategory] = useState<ToolyCategoryId | null>(null);
  const [activeToolySubToolId, setActiveToolySubToolId] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickReminderDraft, setQuickReminderDraft] = useState<QuickReminderDraft | null>(null);
  const [noteToAnkiDraft, setNoteToAnkiDraft] = useState<NoteToAnkiDraft | null>(null);
  const [pendingQrDraft, setPendingQrDraft] = useState<PendingQrDraft | null>(null);

  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Persist to localStorage whenever state updates
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Handle quota gracefully
    }
  }, [state]);

  // Keep haptic config synchronized
  useEffect(() => {
    configureHaptics({
      haptics: state.preferences.hapticsEnabled,
      sound: state.preferences.soundHapticsEnabled,
    });
  }, [state.preferences.hapticsEnabled, state.preferences.soundHapticsEnabled]);

  // Global Cmd/Ctrl + K shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        triggerHaptic('selection');
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = makeId('toast');
      setToasts((prev) => [...prev.slice(-2), { ...toast, id }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 3600);
    },
    [dismissToast]
  );

  const setActiveModule = useCallback((mod: ActiveModule) => {
    triggerHaptic('selection');
    setActiveModuleState(mod);
    if (mod !== 'hub') {
      setActiveToolyCategory(null);
      setActiveToolySubToolId(null);
    }
  }, []);

  const openToolyCategory = useCallback((catId: ToolyCategoryId, subToolId?: string) => {
    triggerHaptic('light');
    setActiveModuleState('hub');
    setActiveToolyCategory(catId);
    setActiveToolySubToolId(subToolId ?? null);
  }, []);

  const closeToolyCategory = useCallback(() => {
    triggerHaptic('light');
    setActiveToolyCategory(null);
    setActiveToolySubToolId(null);
  }, []);

  const openToolySubTool = useCallback((subToolId: string) => {
    const tool = getSubToolById(subToolId);
    if (!tool) return;
    triggerHaptic('light');
    setActiveModuleState('hub');
    setActiveToolyCategory(tool.categoryId);
    setActiveToolySubToolId(tool.id);
  }, []);

  // Cross-Tool Handoffs
  const sendToQr = useCallback(
    (payload: string, type: QrPayloadType = 'text', label?: string) => {
      const trimmed = payload.trim();
      if (!trimmed) return;
      const detectedType: QrPayloadType =
        type === 'text' && /^https?:\/\//i.test(trimmed) ? 'url' : type;
      triggerHaptic('medium');
      setPendingQrDraft({ type: detectedType, payload: trimmed, label, nonce: Date.now() });
      setActiveModuleState('qr');
      setActiveToolyCategory(null);
      showToast({ title: 'Sent to QR Studio', description: 'Live QR code generated from your content.' });
    },
    [showToast]
  );

  const clearPendingQrDraft = useCallback(() => setPendingQrDraft(null), []);

  const openQuickReminder = useCallback((draft: QuickReminderDraft) => {
    triggerHaptic('light');
    setQuickReminderDraft(draft);
  }, []);

  const closeQuickReminder = useCallback(() => setQuickReminderDraft(null), []);

  const openNoteToAnki = useCallback((draft: NoteToAnkiDraft) => {
    triggerHaptic('light');
    setNoteToAnkiDraft(draft);
  }, []);

  const closeNoteToAnki = useCallback(() => setNoteToAnkiDraft(null), []);

  // Tooly Pins & Favorites
  const togglePinTool = useCallback(
    (subToolId: string) => {
      triggerHaptic('medium');
      const tool = getSubToolById(subToolId);
      setState((prev) => {
        const exists = prev.pinnedToolIds.includes(subToolId);
        const next = exists
          ? prev.pinnedToolIds.filter((id) => id !== subToolId)
          : [subToolId, ...prev.pinnedToolIds].slice(0, 12);
        return { ...prev, pinnedToolIds: next };
      });
      if (tool) {
        const wasPinned = state.pinnedToolIds.includes(subToolId);
        showToast({
          title: wasPinned ? `Unpinned ${tool.shortName}` : `Pinned ${tool.shortName}`,
          description: wasPinned ? 'Removed from Home Dashboard' : 'Quick-launch added to Home Dashboard',
        });
      }
    },
    [showToast, state.pinnedToolIds]
  );

  const toggleFavoriteCategory = useCallback((catId: ToolyCategoryId) => {
    triggerHaptic('light');
    setState((prev) => {
      const exists = prev.favoriteCategories.includes(catId);
      return {
        ...prev,
        favoriteCategories: exists
          ? prev.favoriteCategories.filter((c) => c !== catId)
          : [...prev.favoriteCategories, catId],
      };
    });
  }, []);

  // Notes CRUD
  const createNote = useCallback((folder = 'Unfiled', tint: NoteTint = 'pearl'): NoteItem => {
    triggerHaptic('light');
    const now = Date.now();
    const note: NoteItem = {
      id: makeId('note'),
      title: '',
      content: '',
      checklist: [],
      folder: folder === 'All Notes' ? 'Unfiled' : folder,
      tint,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => ({ ...prev, notes: [note, ...prev.notes] }));
    return note;
  }, []);

  const createNoteFromPayload = useCallback(
    (title: string, content: string, folder = 'Unfiled'): NoteItem => {
      triggerHaptic('success');
      const now = Date.now();
      const note: NoteItem = {
        id: makeId('note'),
        title,
        content,
        checklist: [],
        folder,
        tint: 'sky',
        pinned: false,
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => ({ ...prev, notes: [note, ...prev.notes] }));
      showToast({
        title: 'Saved to Notes',
        description: title,
        actionLabel: 'Open Notes',
        onAction: () => setActiveModule('notes'),
      });
      return note;
    },
    [setActiveModule, showToast]
  );

  const saveNote = useCallback((updated: NoteItem) => {
    setState((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => (n.id === updated.id ? { ...updated, updatedAt: Date.now() } : n)),
    }));
  }, []);

  const deleteNote = useCallback(
    (id: string) => {
      triggerHaptic('warning');
      setState((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }));
      showToast({ title: 'Note deleted' });
    },
    [showToast]
  );

  const addNoteFolder = useCallback((name: string) => {
    const clean = name.trim();
    if (!clean) return;
    triggerHaptic('light');
    setState((prev) => ({
      ...prev,
      noteFolders: prev.noteFolders.includes(clean) ? prev.noteFolders : [...prev.noteFolders, clean],
    }));
  }, []);

  // Reminders CRUD
  const addReminder = useCallback(
    (rem: Omit<ReminderItem, 'id' | 'createdAt' | 'completed'>): ReminderItem => {
      triggerHaptic('success');
      const item: ReminderItem = {
        ...rem,
        id: makeId('rem'),
        completed: false,
        createdAt: Date.now(),
      };
      setState((prev) => ({ ...prev, reminders: [item, ...prev.reminders] }));
      return item;
    },
    []
  );

  const updateReminder = useCallback((rem: ReminderItem) => {
    setState((prev) => ({
      ...prev,
      reminders: prev.reminders.map((r) => (r.id === rem.id ? rem : r)),
    }));
  }, []);

  const toggleReminderCompleted = useCallback(
    (id: string) => {
      triggerHaptic('success');
      let toggledTitle = '';
      let nowDone = false;
      setState((prev) => ({
        ...prev,
        reminders: prev.reminders.map((r) => {
          if (r.id !== id) return r;
          toggledTitle = r.title;
          nowDone = !r.completed;
          return {
            ...r,
            completed: nowDone,
            completedAt: nowDone ? Date.now() : undefined,
          };
        }),
      }));
      if (nowDone && toggledTitle) {
        showToast({
          title: 'Reminder completed',
          description: toggledTitle,
          actionLabel: 'Undo',
          onAction: () => {
            triggerHaptic('light');
            setState((prev) => ({
              ...prev,
              reminders: prev.reminders.map((r) =>
                r.id === id ? { ...r, completed: false, completedAt: undefined } : r
              ),
            }));
          },
        });
      }
    },
    [showToast]
  );

  const deleteReminder = useCallback(
    (id: string) => {
      triggerHaptic('warning');
      setState((prev) => ({ ...prev, reminders: prev.reminders.filter((r) => r.id !== id) }));
      showToast({ title: 'Reminder removed' });
    },
    [showToast]
  );

  const addReminderList = useCallback((name: string, color: string): ReminderList => {
    triggerHaptic('light');
    const list: ReminderList = { id: makeId('rlist'), name: name.trim() || 'Custom', color };
    setState((prev) => ({ ...prev, reminderLists: [...prev.reminderLists, list] }));
    return list;
  }, []);

  // AnkiDroid CRUD & Real SM-2 Spaced Repetition
  const addAnkiDeck = useCallback((name: string, description: string, color: string): AnkiDeck => {
    triggerHaptic('success');
    const deck: AnkiDeck = {
      id: makeId('deck'),
      name: name.trim() || 'Untitled Deck',
      description: description.trim(),
      color,
      createdAt: Date.now(),
    };
    setState((prev) => ({ ...prev, ankiDecks: [deck, ...prev.ankiDecks] }));
    return deck;
  }, []);

  const deleteAnkiDeck = useCallback(
    (deckId: string) => {
      triggerHaptic('warning');
      setState((prev) => ({
        ...prev,
        ankiDecks: prev.ankiDecks.filter((d) => d.id !== deckId),
        ankiCards: prev.ankiCards.filter((c) => c.deckId !== deckId),
      }));
      showToast({ title: 'Deck deleted' });
    },
    [showToast]
  );

  const addAnkiCards = useCallback(
    (
      deckId: string,
      cards: { front: string; back: string; type?: 'basic' | 'cloze'; hint?: string; tags?: string[] }[]
    ) => {
      triggerHaptic('success');
      const now = Date.now();
      const created: AnkiCard[] = cards
        .filter((c) => c.front.trim().length > 0)
        .map((c, idx) => ({
          id: makeId(`card${idx}`),
          deckId,
          type: c.type ?? (c.front.includes('{{c1::') ? 'cloze' : 'basic'),
          front: c.front.trim(),
          back: c.back.trim(),
          hint: c.hint?.trim() ?? '',
          tags: c.tags ?? [],
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
          dueDate: now - 1000,
          status: 'new',
          createdAt: now + idx,
        }));
      if (created.length === 0) return;
      setState((prev) => ({ ...prev, ankiCards: [...created, ...prev.ankiCards] }));
    },
    []
  );

  const updateAnkiCard = useCallback((card: AnkiCard) => {
    setState((prev) => ({
      ...prev,
      ankiCards: prev.ankiCards.map((c) => (c.id === card.id ? card : c)),
    }));
  }, []);

  const deleteAnkiCard = useCallback((cardId: string) => {
    triggerHaptic('warning');
    setState((prev) => ({
      ...prev,
      ankiCards: prev.ankiCards.filter((c) => c.id !== cardId),
    }));
  }, []);

  const reviewAnkiCard = useCallback((cardId: string, rating: 1 | 2 | 3 | 4) => {
    triggerHaptic(rating === 1 ? 'warning' : 'success');
    const now = Date.now();
    const today = todayIso();

    setState((prev) => {
      const nextCards = prev.ankiCards.map((card) => {
        if (card.id !== cardId) return card;

        let ease = card.easeFactor;
        let reps = card.repetitions;
        let intervalDays = card.interval;
        let status: AnkiCard['status'] = card.status;
        let dueMs = now;

        if (rating === 1) {
          // Again: reset reps, re-show in 1 minute
          reps = 0;
          ease = Math.max(1.3, ease - 0.2);
          intervalDays = 1 / 1440;
          status = 'learning';
          dueMs = now + 60_000;
        } else if (rating === 2) {
          // Hard
          ease = Math.max(1.3, ease - 0.15);
          if (reps === 0) {
            intervalDays = 10 / 1440; // 10 minutes
            status = 'learning';
            dueMs = now + 10 * 60_000;
          } else {
            intervalDays = Math.max(1, Math.round(Math.max(1, card.interval) * 1.2));
            status = 'review';
            dueMs = now + intervalDays * 86400_000;
          }
          reps += 1;
        } else if (rating === 3) {
          // Good (classic SM-2)
          if (reps === 0) {
            intervalDays = 1;
          } else if (reps === 1) {
            intervalDays = 6;
          } else {
            intervalDays = Math.max(1, Math.round(card.interval * ease));
          }
          reps += 1;
          status = 'review';
          dueMs = now + intervalDays * 86400_000;
        } else {
          // Easy
          ease = Math.min(3.2, ease + 0.15);
          if (reps === 0) {
            intervalDays = 4;
          } else if (reps === 1) {
            intervalDays = 8;
          } else {
            intervalDays = Math.max(2, Math.round(card.interval * ease * 1.3));
          }
          reps += 1;
          status = 'review';
          dueMs = now + intervalDays * 86400_000;
        }

        return {
          ...card,
          easeFactor: Number(ease.toFixed(2)),
          repetitions: reps,
          interval: intervalDays,
          status,
          dueDate: dueMs,
        };
      });

      const isSameDay = prev.ankiStats.lastReviewDate === today;
      const yesterday = addDaysIso(-1);
      const nextStreak = isSameDay
        ? Math.max(1, prev.ankiStats.streakDays)
        : prev.ankiStats.lastReviewDate === yesterday
        ? prev.ankiStats.streakDays + 1
        : 1;

      return {
        ...prev,
        ankiCards: nextCards,
        ankiStats: {
          reviewedToday: isSameDay ? prev.ankiStats.reviewedToday + 1 : 1,
          lastReviewDate: today,
          streakDays: nextStreak,
          totalReviews: prev.ankiStats.totalReviews + 1,
        },
      };
    });
  }, []);

  // QR History
  const addQrHistory = useCallback((item: Omit<QrHistoryItem, 'id' | 'timestamp'>) => {
    setState((prev) => {
      const deduped = prev.qrHistory.filter(
        (h) => !(h.payload === item.payload && h.mode === item.mode)
      );
      return {
        ...prev,
        qrHistory: [{ ...item, id: makeId('qr'), timestamp: Date.now() }, ...deduped].slice(0, 30),
      };
    });
  }, []);

  const clearQrHistory = useCallback(() => {
    triggerHaptic('warning');
    setState((prev) => ({ ...prev, qrHistory: [] }));
  }, []);

  // Interpreter History
  const addInterpreterHistory = useCallback(
    (item: Omit<InterpreterHistoryItem, 'id' | 'timestamp'>): InterpreterHistoryItem => {
      const created: InterpreterHistoryItem = {
        ...item,
        id: makeId('tr'),
        timestamp: Date.now(),
      };
      setState((prev) => ({
        ...prev,
        interpreterHistory: [created, ...prev.interpreterHistory].slice(0, 50),
      }));
      return created;
    },
    []
  );

  const deleteInterpreterHistory = useCallback((id: string) => {
    triggerHaptic('warning');
    setState((prev) => ({
      ...prev,
      interpreterHistory: prev.interpreterHistory.filter((h) => h.id !== id),
    }));
  }, []);

  const clearInterpreterHistory = useCallback(() => {
    triggerHaptic('warning');
    setState((prev) => ({ ...prev, interpreterHistory: [] }));
  }, []);

  // Weather live Open-Meteo Sync
  const refreshWeatherForCity = useCallback(
    async (city: WeatherCity, force = false) => {
      const cached = state.weatherCache[city.id];
      if (!force && cached && Date.now() - cached.fetchedAt < 10 * 60_000) {
        return;
      }

      setWeatherLoading(true);
      setWeatherError(null);
      try {
        const forecastUrl =
          `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}` +
          `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m` +
          `&hourly=temperature_2m,precipitation_probability,weather_code,is_day,uv_index,visibility` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max` +
          `&timezone=auto&forecast_days=7`;

        const aqiUrl =
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.latitude}&longitude=${city.longitude}` +
          `&current=us_aqi,pm2_5,pm10`;

        const [forecastRes, aqiRes] = await Promise.all([
          fetch(forecastUrl),
          fetch(aqiUrl).catch(() => null),
        ]);

        if (!forecastRes.ok) throw new Error('Unable to reach weather service');
        const data = await forecastRes.json();
        const aqiData = aqiRes && aqiRes.ok ? await aqiRes.json() : null;

        // Match closest current hour index for UV & visibility
        const currentIsoPrefix = String(data.current?.time ?? '').slice(0, 13);
        const hourTimes: string[] = data.hourly?.time ?? [];
        let startIdx = hourTimes.findIndex((t) => t.startsWith(currentIsoPrefix));
        if (startIdx < 0) startIdx = 0;

        const hourlySlice = hourTimes.slice(startIdx, startIdx + 24).map((t, i) => {
          const idx = startIdx + i;
          return {
            time: t,
            temperature: Number(data.hourly?.temperature_2m?.[idx] ?? 0),
            weatherCode: Number(data.hourly?.weather_code?.[idx] ?? 0),
            precipitationProb: Number(data.hourly?.precipitation_probability?.[idx] ?? 0),
            isDay: Boolean(data.hourly?.is_day?.[idx] ?? 1),
          };
        });

        const dailyDates: string[] = data.daily?.time ?? [];
        const daily = dailyDates.map((date, i) => ({
          date,
          weatherCode: Number(data.daily?.weather_code?.[i] ?? 0),
          tempMax: Number(data.daily?.temperature_2m_max?.[i] ?? 0),
          tempMin: Number(data.daily?.temperature_2m_min?.[i] ?? 0),
          precipitationProb: Number(data.daily?.precipitation_probability_max?.[i] ?? 0),
          sunrise: String(data.daily?.sunrise?.[i] ?? ''),
          sunset: String(data.daily?.sunset?.[i] ?? ''),
          uvMax: Number(data.daily?.uv_index_max?.[i] ?? 0),
        }));

        const payload: WeatherForecastCache = {
          cityId: city.id,
          fetchedAt: Date.now(),
          current: {
            temperature: Number(data.current?.temperature_2m ?? 0),
            apparentTemperature: Number(data.current?.apparent_temperature ?? 0),
            humidity: Number(data.current?.relative_humidity_2m ?? 0),
            windSpeed: Number(data.current?.wind_speed_10m ?? 0),
            windDirection: Number(data.current?.wind_direction_10m ?? 0),
            pressure: Number(data.current?.surface_pressure ?? 1013),
            weatherCode: Number(data.current?.weather_code ?? 0),
            isDay: Boolean(data.current?.is_day ?? 1),
            uvIndex: Number(data.hourly?.uv_index?.[startIdx] ?? 0),
            visibility: Number(data.hourly?.visibility?.[startIdx] ?? 10000),
            cloudCover: Number(data.current?.cloud_cover ?? 0),
          },
          hourly: hourlySlice,
          daily,
          aqi: aqiData?.current
            ? {
                usAqi: Number(aqiData.current.us_aqi ?? 25),
                pm25: Number(aqiData.current.pm2_5 ?? 5),
                pm10: Number(aqiData.current.pm10 ?? 10),
              }
            : undefined,
        };

        setState((prev) => ({
          ...prev,
          weatherCache: {
            ...prev.weatherCache,
            [city.id]: payload,
          },
        }));
      } catch (err) {
        setWeatherError(err instanceof Error ? err.message : 'Weather unavailable offline');
      } finally {
        setWeatherLoading(false);
      }
    },
    [state.weatherCache]
  );

  // Auto-fetch active weather city on initial mount so the Dashboard Weather Glance is live
  useEffect(() => {
    const activeCity =
      state.weatherCities.find((c) => c.id === state.activeWeatherCityId) ?? state.weatherCities[0];
    if (activeCity) {
      refreshWeatherForCity(activeCity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeWeatherCityId]);

  const setActiveWeatherCityId = useCallback((cityId: string) => {
    triggerHaptic('selection');
    setState((prev) => ({ ...prev, activeWeatherCityId: cityId }));
  }, []);

  const addWeatherCity = useCallback((city: WeatherCity) => {
    triggerHaptic('success');
    setState((prev) => {
      const exists = prev.weatherCities.some(
        (c) => Math.abs(c.latitude - city.latitude) < 0.05 && Math.abs(c.longitude - city.longitude) < 0.05
      );
      if (exists) {
        const match = prev.weatherCities.find(
          (c) => Math.abs(c.latitude - city.latitude) < 0.05 && Math.abs(c.longitude - city.longitude) < 0.05
        );
        return { ...prev, activeWeatherCityId: match?.id ?? prev.activeWeatherCityId };
      }
      return {
        ...prev,
        weatherCities: [city, ...prev.weatherCities],
        activeWeatherCityId: city.id,
      };
    });
  }, []);

  const removeWeatherCity = useCallback((cityId: string) => {
    triggerHaptic('warning');
    setState((prev) => {
      const next = prev.weatherCities.filter((c) => c.id !== cityId);
      return {
        ...prev,
        weatherCities: next,
        activeWeatherCityId: prev.activeWeatherCityId === cityId ? next[0]?.id ?? '' : prev.activeWeatherCityId,
      };
    });
  }, []);

  // Preferences & Backup
  const updatePreferences = useCallback((patch: Partial<HubPreferences>) => {
    triggerHaptic('selection');
    setState((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, ...patch },
    }));
  }, []);

  const exportBackupJson = useCallback(() => {
    return JSON.stringify(state, null, 2);
  }, [state]);

  const importBackupJson = useCallback(
    (jsonText: string): boolean => {
      try {
        const parsed = JSON.parse(jsonText) as Partial<PersistedHubState>;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.notes)) {
          return false;
        }
        const defaults = createInitialState();
        setState({
          ...defaults,
          ...parsed,
          preferences: { ...defaults.preferences, ...(parsed.preferences ?? {}) },
        });
        triggerHaptic('success');
        showToast({ title: 'Backup restored', description: 'All notes, decks, reminders, and pins updated.' });
        return true;
      } catch {
        triggerHaptic('error');
        return false;
      }
    },
    [showToast]
  );

  const resetAllData = useCallback(() => {
    triggerHaptic('warning');
    const fresh = createInitialState();
    setState(fresh);
    showToast({ title: 'Workspace cleared', description: 'All local items removed.' });
  }, [showToast]);

  const value = useMemo<HubContextValue>(
    () => ({
      state,
      activeModule,
      setActiveModule,
      activeToolyCategory,
      activeToolySubToolId,
      openToolyCategory,
      closeToolyCategory,
      openToolySubTool,
      searchOpen,
      setSearchOpen,
      settingsOpen,
      setSettingsOpen,
      quickReminderDraft,
      openQuickReminder,
      closeQuickReminder,
      noteToAnkiDraft,
      openNoteToAnki,
      closeNoteToAnki,
      pendingQrDraft,
      clearPendingQrDraft,
      sendToQr,
      createNoteFromPayload,
      togglePinTool,
      toggleFavoriteCategory,
      saveNote,
      createNote,
      deleteNote,
      addNoteFolder,
      addReminder,
      updateReminder,
      toggleReminderCompleted,
      deleteReminder,
      addReminderList,
      addAnkiDeck,
      deleteAnkiDeck,
      addAnkiCards,
      updateAnkiCard,
      deleteAnkiCard,
      reviewAnkiCard,
      addQrHistory,
      clearQrHistory,
      addInterpreterHistory,
      deleteInterpreterHistory,
      clearInterpreterHistory,
      weatherLoading,
      weatherError,
      setActiveWeatherCityId,
      addWeatherCity,
      removeWeatherCity,
      refreshWeatherForCity,
      updatePreferences,
      exportBackupJson,
      importBackupJson,
      resetAllData,
      toasts,
      showToast,
      dismissToast,
    }),
    [
      state,
      activeModule,
      setActiveModule,
      activeToolyCategory,
      activeToolySubToolId,
      openToolyCategory,
      closeToolyCategory,
      openToolySubTool,
      searchOpen,
      settingsOpen,
      quickReminderDraft,
      openQuickReminder,
      closeQuickReminder,
      noteToAnkiDraft,
      openNoteToAnki,
      closeNoteToAnki,
      pendingQrDraft,
      clearPendingQrDraft,
      sendToQr,
      createNoteFromPayload,
      togglePinTool,
      toggleFavoriteCategory,
      saveNote,
      createNote,
      deleteNote,
      addNoteFolder,
      addReminder,
      updateReminder,
      toggleReminderCompleted,
      deleteReminder,
      addReminderList,
      addAnkiDeck,
      deleteAnkiDeck,
      addAnkiCards,
      updateAnkiCard,
      deleteAnkiCard,
      reviewAnkiCard,
      addQrHistory,
      clearQrHistory,
      addInterpreterHistory,
      deleteInterpreterHistory,
      clearInterpreterHistory,
      weatherLoading,
      weatherError,
      setActiveWeatherCityId,
      addWeatherCity,
      removeWeatherCity,
      refreshWeatherForCity,
      updatePreferences,
      exportBackupJson,
      importBackupJson,
      resetAllData,
      toasts,
      showToast,
      dismissToast,
    ]
  );

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
};

export function useHub(): HubContextValue {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error('useHub must be used within HubProvider');
  return ctx;
}
