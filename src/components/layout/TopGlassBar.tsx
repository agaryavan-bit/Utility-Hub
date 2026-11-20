import React from 'react';
import { ChevronLeft, Search, SlidersHorizontal } from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { getCategoryById } from '../../data/toolyCatalog';
import { triggerHaptic } from '../../utils/haptics';

const MODULE_TITLES: Record<string, string> = {
  hub: 'Tooly',
  qr: 'QR Studio',
  weather: 'Weather',
  notes: 'Notes',
  reminders: 'Reminders',
  anki: 'AnkiDroid',
};

export const TopGlassBar: React.FC = () => {
  const {
    activeModule,
    activeToolyCategory,
    closeToolyCategory,
    setActiveModule,
    setSearchOpen,
    setSettingsOpen,
  } = useHub();

  const category = activeToolyCategory ? getCategoryById(activeToolyCategory) : null;

  return (
    <header className="sticky top-0 z-30 w-full px-4 sm:px-6 pt-3 pb-2">
      <div className="mx-auto max-w-7xl glass-panel rounded-2xl px-4 sm:px-5 h-14 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Brand / Contextual Back */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {activeModule === 'hub' && category ? (
            <button
              type="button"
              onClick={closeToolyCategory}
              className="flex items-center gap-1.5 -ml-1.5 px-2.5 h-10 rounded-xl text-sm font-semibold text-[#007AFF] hover:bg-white/60 transition-colors active:scale-95 whitespace-nowrap"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.4]" />
              <span>Hub</span>
              <span className="text-slate-400 font-normal">/</span>
              <span className="text-slate-900 truncate max-w-[140px] sm:max-w-none">{category.name}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveModule('hub')}
              className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 group"
            >
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#007AFF] via-[#38BDF8] to-[#6366F1] text-white flex items-center justify-center shadow-sm shadow-[#007AFF]/25 font-display font-extrabold text-sm tracking-tight group-active:scale-95 transition-transform">
                T
              </span>
              <span className="font-display font-bold text-lg tracking-tight text-slate-900">
                {MODULE_TITLES[activeModule]}
              </span>
            </button>
          )}
        </div>

        {/* Zone 2: Unified Global Search */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection');
            setSearchOpen(true);
          }}
          className="flex-1 max-w-md h-10 px-3.5 rounded-xl glass-input flex items-center justify-between gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors min-w-0"
          aria-label="Search tools, notes, reminders, and flashcards"
        >
          <span className="flex items-center gap-2 min-w-0 truncate">
            <Search className="w-4 h-4 shrink-0 text-slate-400" />
            <span className="truncate">Search 50+ tools, notes, decks…</span>
          </span>
          <kbd className="hidden sm:inline-flex items-center font-mono text-[11px] text-slate-500 px-1.5 py-0.5 rounded-md bg-white/75 border border-slate-200/80 shrink-0">
            ⌘K
          </kbd>
        </button>

        {/* Zone 3: Single Primary Action (Preferences & Backup) */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSettingsOpen(true);
            }}
            className="h-10 px-3.5 rounded-xl bg-white/70 hover:bg-white/95 border border-white/90 text-slate-700 hover:text-slate-950 text-sm font-medium flex items-center gap-2 shadow-xs transition-all active:scale-95 whitespace-nowrap shrink-0"
            aria-label="Preferences and Backup"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Preferences</span>
          </button>
        </div>
      </div>
    </header>
  );
};
