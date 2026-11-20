import React, { useMemo, useRef, useState } from 'react';
import {
  BellPlus,
  CheckSquare,
  FolderPlus,
  Layers,
  Pin,
  Plus,
  QrCode,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import { makeId, useHub } from '../../context/HubContext';
import { NoteItem, NoteTint } from '../../types/hub';
import { autoScrollToElement } from '../../utils/autoScroll';
import { triggerHaptic } from '../../utils/haptics';

const TINT_STYLES: Record<NoteTint, { swatch: string; bg: string }> = {
  pearl: { swatch: '#FFFFFF', bg: 'bg-white/75' },
  sky: { swatch: '#BAE6FD', bg: 'bg-sky-100/65' },
  mint: { swatch: '#A7F3D0', bg: 'bg-emerald-100/60' },
  amber: { swatch: '#FDE68A', bg: 'bg-amber-100/65' },
  lavender: { swatch: '#DDD6FE', bg: 'bg-violet-100/60' },
  rose: { swatch: '#FECDD3', bg: 'bg-rose-100/60' },
};

function parseNoteToCards(note: NoteItem): { front: string; back: string }[] {
  const lines = note.content.split('\n').map((l) => l.trim()).filter(Boolean);
  const cards: { front: string; back: string }[] = [];

  // Pattern 1: Q: ... / A: ...
  for (let i = 0; i < lines.length; i++) {
    const qMatch = lines[i].match(/^Q:\s*(.+)$/i);
    if (qMatch && lines[i + 1]) {
      const aMatch = lines[i + 1].match(/^A:\s*(.+)$/i);
      if (aMatch) {
        cards.push({ front: qMatch[1].trim(), back: aMatch[1].trim() });
        i += 1;
        continue;
      }
    }
    // Pattern 2: Term - Definition or Term :: Definition
    const pairMatch = lines[i].match(/^([^:–—-]{3,80})\s*(?:::|—|–|\s-\s)\s*(.{3,})$/);
    if (pairMatch) {
      cards.push({ front: pairMatch[1].trim(), back: pairMatch[2].trim() });
    }
  }

  if (cards.length === 0) {
    cards.push({
      front: note.title.trim() || 'Study Note Question',
      back: note.content.trim() || 'Add answer details here',
    });
  }
  return cards;
}

export const NotesModule: React.FC = () => {
  const {
    state,
    createNote,
    saveNote,
    deleteNote,
    addNoteFolder,
    sendToQr,
    openNoteToAnki,
    openQuickReminder,
  } = useHub();

  const [folder, setFolder] = useState('All Notes');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(state.notes[0]?.id ?? '');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const folderInputRef = useRef<HTMLDivElement | null>(null);
  const checklistEndRef = useRef<HTMLDivElement | null>(null);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.notes
      .filter((n) => (folder === 'All Notes' ? true : n.folder === folder))
      .filter(
        (n) =>
          !q ||
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [state.notes, folder, search]);

  const activeNote =
    state.notes.find((n) => n.id === selectedId) ?? filteredNotes[0] ?? null;

  const handleCreate = () => {
    const created = createNote(folder);
    setSelectedId(created.id);
    autoScrollToElement(editorRef);
  };

  const updateActive = (patch: Partial<NoteItem>) => {
    if (!activeNote) return;
    saveNote({ ...activeNote, ...patch });
  };

  const addChecklistItem = () => {
    if (!activeNote || !newChecklistText.trim()) return;
    triggerHaptic('selection');
    updateActive({
      checklist: [...activeNote.checklist, { id: makeId('chk'), text: newChecklistText.trim(), done: false }],
    });
    setNewChecklistText('');
    autoScrollToElement(checklistEndRef, { align: 'bottom' });
  };

  const wordCount = activeNote?.content.trim() ? activeNote.content.trim().split(/\s+/).length : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Column: Folders & Note List */}
      <div className="lg:col-span-4 glass-panel rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-bold text-slate-900">Notes</h1>
          <button
            type="button"
            onClick={handleCreate}
            className="h-9 px-3.5 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
        </div>

        {/* Folder Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {state.noteFolders.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setFolder(f);
              }}
              className={`h-8 px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                folder === f ? 'bg-slate-900 text-white' : 'bg-white/75 text-slate-600 hover:bg-white'
              }`}
            >
              {f}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setAddingFolder((v) => {
                const next = !v;
                if (next) autoScrollToElement(folderInputRef);
                return next;
              });
            }}
            className="h-8 w-8 rounded-xl bg-white/75 text-slate-600 hover:bg-white flex items-center justify-center shrink-0"
            aria-label="Add folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>

        {addingFolder && (
          <div ref={folderInputRef} className="flex gap-1.5">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  addNoteFolder(newFolderName.trim());
                  setFolder(newFolderName.trim());
                  setNewFolderName('');
                  setAddingFolder(false);
                }
              }}
              placeholder="Folder name…"
              className="flex-1 h-9 px-3 rounded-xl glass-input text-xs"
            />
            <button
              type="button"
              onClick={() => {
                if (!newFolderName.trim()) return;
                addNoteFolder(newFolderName.trim());
                setFolder(newFolderName.trim());
                setNewFolderName('');
                setAddingFolder(false);
              }}
              className="h-9 px-3 rounded-xl bg-[#007AFF] text-white text-xs font-semibold"
            >
              Add
            </button>
          </div>
        )}

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter notes…"
            className="w-full h-10 pl-10 pr-3 rounded-xl glass-input text-sm"
          />
        </div>

        {/* Notes List */}
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-0.5">
          {filteredNotes.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-xs text-slate-500">No notes match this filter yet.</p>
              <button
                type="button"
                onClick={handleCreate}
                className="text-xs font-semibold text-[#007AFF]"
              >
                Create your first note
              </button>
            </div>
          ) : (
            filteredNotes.map((note) => {
              const selected = note.id === activeNote?.id;
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setSelectedId(note.id);
                    autoScrollToElement(editorRef);
                  }}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                    selected
                      ? 'bg-white border-[#007AFF]/40 shadow-sm'
                      : `${TINT_STYLES[note.tint].bg} border-white/85 hover:bg-white/90`
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display font-semibold text-sm text-slate-900 truncate">
                      {note.title || 'Untitled Note'}
                    </span>
                    {note.pinned && <Pin className="w-3.5 h-3.5 text-[#007AFF] shrink-0 mt-0.5" />}
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2 mt-1">
                    {note.content || 'Empty note'}
                  </p>
                  <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <span>{note.folder}</span>
                    <span>·</span>
                    <span className="font-mono">
                      {new Date(note.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Note Editor & Cross-Tool Integration Toolbar */}
      <div ref={editorRef} className="lg:col-span-8 glass-panel rounded-3xl p-5 sm:p-7 min-h-[540px] flex flex-col">
        {activeNote ? (
          <>
            {/* Cross-Tool Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200/70">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    sendToQr(
                      `${activeNote.title ? activeNote.title + '\n\n' : ''}${activeNote.content}`,
                      'text',
                      activeNote.title || 'Note QR'
                    )
                  }
                  className="h-9 px-3 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-[#007AFF] flex items-center gap-1.5 active:scale-95"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>To QR</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openNoteToAnki({
                      sourceTitle: activeNote.title || 'Study Note',
                      cards: parseNoteToCards(activeNote),
                    })
                  }
                  className="h-9 px-3 rounded-xl bg-indigo-500/12 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-700 flex items-center gap-1.5 active:scale-95"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Make Anki Cards</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openQuickReminder({
                      title: activeNote.title || 'Review note',
                      notes: activeNote.content.slice(0, 180),
                    })
                  }
                  className="h-9 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/18 text-xs font-semibold text-rose-700 flex items-center gap-1.5 active:scale-95"
                >
                  <BellPlus className="w-3.5 h-3.5" />
                  <span>Remind</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={activeNote.folder}
                  onChange={(e) => updateActive({ folder: e.target.value })}
                  className="h-9 px-2.5 rounded-xl bg-white/75 border border-white text-xs font-medium text-slate-700"
                >
                  <option value="Unfiled">Unfiled</option>
                  {state.noteFolders
                    .filter((f) => f !== 'All Notes' && f !== 'Unfiled')
                    .map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    updateActive({ pinned: !activeNote.pinned });
                  }}
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center ${
                    activeNote.pinned
                      ? 'bg-[#007AFF] text-white border-[#007AFF]'
                      : 'bg-white/80 text-slate-600 border-white'
                  }`}
                  aria-label="Pin note"
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteNote(activeNote.id);
                    setSelectedId('');
                  }}
                  className="h-9 w-9 rounded-xl bg-white/80 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-white flex items-center justify-center"
                  aria-label="Delete note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Editor Body */}
            <div className="flex-1 py-4 space-y-4">
              <input
                type="text"
                value={activeNote.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                placeholder="Note title…"
                className="w-full bg-transparent font-display text-2xl font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />

              <textarea
                rows={9}
                value={activeNote.content}
                onChange={(e) => updateActive({ content: e.target.value })}
                placeholder="Write freely… Tip: Use 'Q: ...' and 'A: ...' lines or 'Term - Definition' to convert straight into AnkiDroid flashcards."
                className="w-full bg-transparent text-sm sm:text-base text-slate-800 leading-relaxed placeholder:text-slate-400 focus:outline-none resize-y"
              />

              {/* Checklist Section */}
              <div className="pt-4 border-t border-slate-200/70 space-y-2.5">
                <div className="text-xs font-semibold text-slate-500">Checklist</div>
                {activeNote.checklist.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 group">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        updateActive({
                          checklist: activeNote.checklist.map((c) =>
                            c.id === item.id ? { ...c, done: !c.done } : c
                          ),
                        });
                      }}
                      className="flex items-center gap-2.5 text-sm text-left flex-1 min-w-0"
                    >
                      {item.done ? (
                        <CheckSquare className="w-4 h-4 text-[#007AFF] shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className={item.done ? 'line-through text-slate-400' : 'text-slate-800'}>
                        {item.text}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateActive({
                          checklist: activeNote.checklist.filter((c) => c.id !== item.id),
                        })
                      }
                      className="p-1 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Delete checklist item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <div ref={checklistEndRef} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newChecklistText}
                    onChange={(e) => setNewChecklistText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
                    placeholder="Add checklist item…"
                    className="flex-1 h-9 px-3 rounded-xl glass-input text-xs"
                  />
                  <button
                    type="button"
                    onClick={addChecklistItem}
                    className="h-9 px-3.5 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-700"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Metadata & Tint Picker */}
            <div className="pt-3 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {(Object.keys(TINT_STYLES) as NoteTint[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      updateActive({ tint: t });
                    }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      activeNote.tint === t ? 'border-[#007AFF] scale-110' : 'border-slate-300/80'
                    }`}
                    style={{ backgroundColor: TINT_STYLES[t].swatch }}
                    aria-label={`Set tint ${t}`}
                  />
                ))}
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                {wordCount} words · {activeNote.content.length} chars
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3">
            <p className="text-sm text-slate-600">Select a note or start a fresh one.</p>
            <button
              type="button"
              onClick={handleCreate}
              className="h-10 px-5 rounded-xl bg-[#007AFF] text-white text-xs font-semibold"
            >
              Create Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
