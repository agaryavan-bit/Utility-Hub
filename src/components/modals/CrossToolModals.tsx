import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BellPlus,
  CheckCircle2,
  CloudSun,
  Download,
  Languages,
  Layers,
  NotebookPen,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Volume2,
  Vibrate,
  Wrench,
  X,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { ALL_SUB_TOOLS, getCategoryById } from '../../data/toolyCatalog';
import { ReminderPriority } from '../../types/hub';
import { triggerHaptic } from '../../utils/haptics';

/* ==================== GLOBAL COMMAND SEARCH MODAL ==================== */

const GlobalSearchModal: React.FC = () => {
  const {
    state,
    searchOpen,
    setSearchOpen,
    setActiveModule,
    openToolySubTool,
  } = useHub();

  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!searchOpen) setQuery('');
  }, [searchOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tools = ALL_SUB_TOOLS.filter((t) => {
      if (!q) return state.pinnedToolIds.includes(t.id);
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }).slice(0, 8);

    const notes = q
      ? state.notes
          .filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
          .slice(0, 4)
      : [];

    const reminders = q
      ? state.reminders
          .filter((r) => !r.completed && r.title.toLowerCase().includes(q))
          .slice(0, 4)
      : [];

    const decks = q
      ? state.ankiDecks
          .filter((d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q))
          .slice(0, 4)
      : [];

    const matchesInterpreter =
      Boolean(q) &&
      ['interpreter', 'translate', 'translator', 'voice', 'mic', 'microphone', 'speech', 'hindi', 'chinese', 'marathi', 'tulu', 'telugu', 'language'].some(
        (kw) => kw.includes(q) || q.includes(kw)
      );

    return { tools, notes, reminders, decks, matchesInterpreter };
  }, [query, state.pinnedToolIds, state.notes, state.reminders, state.ankiDecks]);

  return (
    <AnimatePresence>
      {searchOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSearchOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm flex items-start justify-center p-4 pt-16 sm:pt-24"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl glass-panel-strong rounded-3xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200/70">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
                placeholder="Jump to any tool, note, reminder, or Anki deck…"
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800"
                aria-label="Close search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-3 space-y-4">
              {/* Quick Apps */}
              {!query.trim() && (
                <div>
                  <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-slate-500">Integrated Apps</div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {([
                      { id: 'interpreter', label: 'Voice', icon: Languages },
                      { id: 'qr', label: 'QR', icon: QrCode },
                      { id: 'weather', label: 'Weather', icon: CloudSun },
                      { id: 'notes', label: 'Notes', icon: NotebookPen },
                      { id: 'reminders', label: 'Tasks', icon: CheckCircle2 },
                      { id: 'anki', label: 'Anki', icon: Layers },
                    ] as const).map((app) => {
                      const Icon = app.icon;
                      return (
                        <button
                          key={app.id}
                          type="button"
                          onClick={() => {
                            setActiveModule(app.id);
                            setSearchOpen(false);
                          }}
                          className="p-2.5 rounded-xl bg-white/75 hover:bg-white flex flex-col items-center gap-1 text-xs font-semibold text-slate-800"
                        >
                          <Icon className="w-4 h-4 text-[#007AFF]" />
                          <span>{app.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {results.matchesInterpreter && (
                <div>
                  <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-slate-500">Voice Interpreter</div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModule('interpreter');
                      setSearchOpen(false);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl hover:bg-white/85 flex items-center justify-between gap-3 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Languages className="w-4 h-4 text-[#007AFF] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">50-Language Voice Interpreter</div>
                        <div className="text-xs text-slate-500 truncate">
                          Speak into mic to translate English, Chinese, Hindi, Marathi, Tulu, Telugu & more
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {/* Tooly Tools */}
              {results.tools.length > 0 && (
                <div>
                  <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-slate-500">
                    {query.trim() ? 'Matching Tooly Utilities' : 'Pinned Utilities'}
                  </div>
                  <div className="space-y-1">
                    {results.tools.map((t) => {
                      const cat = getCategoryById(t.categoryId);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            openToolySubTool(t.id);
                            setSearchOpen(false);
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-white/85 flex items-center justify-between gap-3 text-left transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Wrench className="w-4 h-4 shrink-0" style={{ color: cat.accentHex }} />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900 truncate">{t.name}</div>
                              <div className="text-xs text-slate-500 truncate">{t.description}</div>
                            </div>
                          </div>
                          <span className="text-[11px] text-slate-500 shrink-0">{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes Matches */}
              {results.notes.length > 0 && (
                <div>
                  <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-slate-500">Notes</div>
                  <div className="space-y-1">
                    {results.notes.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setActiveModule('notes');
                          setSearchOpen(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-white/85 text-left flex items-center gap-2.5"
                      >
                        <NotebookPen className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-sm font-medium text-slate-800 truncate">{n.title || 'Untitled Note'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reminders Matches */}
              {results.reminders.length > 0 && (
                <div>
                  <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-slate-500">Reminders</div>
                  <div className="space-y-1">
                    {results.reminders.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setActiveModule('reminders');
                          setSearchOpen(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-white/85 text-left flex items-center gap-2.5"
                      >
                        <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
                        <span className="text-sm font-medium text-slate-800 truncate">{r.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Anki Decks Matches */}
              {results.decks.length > 0 && (
                <div>
                  <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-slate-500">AnkiDroid Decks</div>
                  <div className="space-y-1">
                    {results.decks.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setActiveModule('anki');
                          setSearchOpen(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-white/85 text-left flex items-center gap-2.5"
                      >
                        <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="text-sm font-medium text-slate-800 truncate">{d.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {query.trim() &&
                !results.matchesInterpreter &&
                results.tools.length === 0 &&
                results.notes.length === 0 &&
                results.reminders.length === 0 &&
                results.decks.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-500">
                    No matching tools or workspace items found for "{query}".
                  </div>
                )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ==================== NOTE -> ANKIDROID CONVERTER MODAL ==================== */

const NoteToAnkiModal: React.FC = () => {
  const {
    state,
    noteToAnkiDraft,
    closeNoteToAnki,
    addAnkiDeck,
    addAnkiCards,
    setActiveModule,
    showToast,
  } = useHub();

  const [cards, setCards] = useState<{ front: string; back: string }[]>([]);
  const [targetDeckId, setTargetDeckId] = useState<string>('');
  const [newDeckName, setNewDeckName] = useState('');

  useEffect(() => {
    if (!noteToAnkiDraft) return;
    setCards(noteToAnkiDraft.cards);
    setTargetDeckId(state.ankiDecks[0]?.id ?? '__new__');
    setNewDeckName(noteToAnkiDraft.sourceTitle);
  }, [noteToAnkiDraft, state.ankiDecks]);

  const handleCommit = () => {
    const valid = cards.filter((c) => c.front.trim().length > 0);
    if (valid.length === 0) return;

    let deckId = targetDeckId;
    if (deckId === '__new__' || !deckId) {
      const created = addAnkiDeck(newDeckName || 'Note Flashcards', 'Converted from Notes', '#6366F1');
      deckId = created.id;
    }

    addAnkiCards(deckId, valid);
    closeNoteToAnki();
    showToast({
      title: `Added ${valid.length} Anki ${valid.length === 1 ? 'card' : 'cards'}`,
      description: 'Ready for spaced-repetition study.',
      actionLabel: 'Study Now',
      onAction: () => setActiveModule('anki'),
    });
  };

  return (
    <AnimatePresence>
      {noteToAnkiDraft && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeNoteToAnki}
          className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl glass-panel-strong rounded-3xl p-6 space-y-5 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">
                  Convert Note to AnkiDroid Flashcards
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Source: {noteToAnkiDraft.sourceTitle} · Review or tweak cards before adding
                </p>
              </div>
              <button
                type="button"
                onClick={closeNoteToAnki}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-800"
                aria-label="Close converter"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Deck Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Destination Deck</label>
                <select
                  value={targetDeckId}
                  onChange={(e) => setTargetDeckId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl glass-input text-sm font-medium"
                >
                  {state.ankiDecks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                  <option value="__new__">+ Create New Deck</option>
                </select>
              </div>
              {targetDeckId === '__new__' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">New Deck Name</label>
                  <input
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl glass-input text-sm"
                  />
                </div>
              )}
            </div>

            {/* Parsed Cards List */}
            <div className="space-y-3">
              {cards.map((c, idx) => (
                <div key={idx} className="rounded-2xl bg-white/75 border border-white p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">Card {idx + 1}</span>
                    {cards.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCards((p) => p.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600"
                        aria-label="Remove draft card"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={c.front}
                    onChange={(e) =>
                      setCards((p) => p.map((x, i) => (i === idx ? { ...x, front: e.target.value } : x)))
                    }
                    placeholder="Front (Question)"
                    className="w-full h-9 px-3 rounded-xl glass-input text-xs font-medium"
                  />
                  <input
                    type="text"
                    value={c.back}
                    onChange={(e) =>
                      setCards((p) => p.map((x, i) => (i === idx ? { ...x, back: e.target.value } : x)))
                    }
                    placeholder="Back (Answer)"
                    className="w-full h-9 px-3 rounded-xl glass-input text-xs"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={() => setCards((p) => [...p, { front: '', back: '' }])}
                className="h-9 px-3.5 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-700 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Card</span>
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/70">
              <button
                type="button"
                onClick={closeNoteToAnki}
                className="h-10 px-4 rounded-xl bg-white/80 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommit}
                className="h-10 px-5 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Add {cards.length} Cards to AnkiDroid</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ==================== QUICK CREATE REMINDER MODAL ==================== */

const QuickReminderModal: React.FC = () => {
  const { state, quickReminderDraft, closeQuickReminder, addReminder, setActiveModule, showToast } = useHub();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState('18:00');
  const [priority, setPriority] = useState<ReminderPriority>('medium');
  const [listId, setListId] = useState(state.reminderLists[0]?.id ?? '');

  useEffect(() => {
    if (!quickReminderDraft) return;
    setTitle(quickReminderDraft.title);
    setNotes(quickReminderDraft.notes);
    setDueDate(quickReminderDraft.dueDate || new Date().toISOString().slice(0, 10));
    setDueTime(quickReminderDraft.dueTime || '18:00');
    setListId(quickReminderDraft.listId || state.reminderLists[0]?.id || '');
  }, [quickReminderDraft, state.reminderLists]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addReminder({
      title: title.trim(),
      notes: notes.trim(),
      listId,
      dueDate,
      dueTime,
      priority,
      repeat: 'none',
      flagged: false,
    });
    closeQuickReminder();
    showToast({
      title: 'Reminder scheduled',
      description: title.trim(),
      actionLabel: 'Open Tasks',
      onAction: () => setActiveModule('reminders'),
    });
  };

  return (
    <AnimatePresence>
      {quickReminderDraft && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeQuickReminder}
          className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.form
            onSubmit={handleSave}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass-panel-strong rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                <BellPlus className="w-5 h-5 text-[#007AFF]" />
                <span>Create Reminder</span>
              </h2>
              <button
                type="button"
                onClick={closeQuickReminder}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800"
                aria-label="Close reminder modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Reminder title…"
                className="w-full h-11 px-3.5 rounded-xl glass-input text-sm font-medium"
              />
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes or scanned link…"
                className="w-full p-3 rounded-xl glass-input text-xs"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-10 px-3 rounded-xl glass-input font-mono text-xs"
                />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="h-10 px-3 rounded-xl glass-input font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <select
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                  className="h-10 px-3 rounded-xl glass-input text-xs font-medium"
                >
                  <option value="">No List</option>
                  {state.reminderLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ReminderPriority)}
                  className="h-10 px-3 rounded-xl glass-input text-xs font-medium"
                >
                  <option value="none">No Priority</option>
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeQuickReminder}
                className="h-10 px-4 rounded-xl bg-white/80 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="h-10 px-5 rounded-xl bg-[#007AFF] text-white text-xs font-semibold disabled:opacity-40"
              >
                Save Reminder
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ==================== PREFERENCES & OFFLINE BACKUP MODAL ==================== */

const PreferencesModal: React.FC = () => {
  const {
    state,
    settingsOpen,
    setSettingsOpen,
    updatePreferences,
    exportBackupJson,
    importBackupJson,
    resetAllData,
    showToast,
  } = useHub();

  const [confirmReset, setConfirmReset] = useState(false);

  const handleDownloadBackup = () => {
    triggerHaptic('success');
    const json = exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tooly-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ title: 'Backup exported', description: 'Saved complete local workspace JSON.' });
  };

  const handleImportFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const ok = importBackupJson(reader.result);
        if (!ok) showToast({ title: 'Invalid backup file' });
      }
    };
    reader.readAsText(file);
  };

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            setSettingsOpen(false);
            setConfirmReset(false);
          }}
          className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass-panel-strong rounded-3xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-slate-900">Preferences & Data</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800"
                aria-label="Close preferences"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tactile Feedback Toggles */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-500">Haptics & Interaction</div>

              <label className="rounded-2xl bg-white/75 border border-white p-3.5 flex items-center justify-between cursor-pointer">
                <span className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
                  <Vibrate className="w-4 h-4 text-[#007AFF]" />
                  <span>Haptic Feedback</span>
                </span>
                <input
                  type="checkbox"
                  checked={state.preferences.hapticsEnabled}
                  onChange={(e) => updatePreferences({ hapticsEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[#007AFF]"
                />
              </label>

              <label className="rounded-2xl bg-white/75 border border-white p-3.5 flex items-center justify-between cursor-pointer">
                <span className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
                  <Volume2 className="w-4 h-4 text-[#007AFF]" />
                  <span>Subtle Tactile Clicks (Desktop)</span>
                </span>
                <input
                  type="checkbox"
                  checked={state.preferences.soundHapticsEnabled}
                  onChange={(e) => updatePreferences({ soundHapticsEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[#007AFF]"
                />
              </label>
            </div>

            {/* Offline Backup */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200/70">
              <div className="text-xs font-semibold text-slate-500">Local Storage Backup</div>
              <p className="text-xs text-slate-600">
                All notes, reminders, AnkiDroid decks, weather cities, and pinned tools are saved locally in your browser for instant offline access.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="h-10 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
                <label className="h-10 rounded-xl bg-white/85 hover:bg-white border border-white text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import JSON</span>
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => handleImportFile(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            {/* Clear Local Data */}
            <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between">
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear All Local Data</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 w-full justify-between">
                  <span className="text-xs font-semibold text-rose-700">Delete all saved data?</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="h-8 px-3 rounded-lg bg-white text-xs font-semibold text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetAllData();
                        setConfirmReset(false);
                        setSettingsOpen(false);
                      }}
                      className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-semibold"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const CrossToolModals: React.FC = () => {
  return (
    <>
      <GlobalSearchModal />
      <NoteToAnkiModal />
      <QuickReminderModal />
      <PreferencesModal />
    </>
  );
};
