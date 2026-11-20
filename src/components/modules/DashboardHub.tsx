import React, { useState } from 'react';
import {
  ArrowLeftRight,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  Code2,
  Dices,
  FileText,
  Heart,
  HeartPulse,
  Image as ImageIcon,
  Landmark,
  Languages,
  Layers,
  NotebookPen,
  Palette,
  Pin,
  QrCode,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { getCategoryById, getSubToolById, TOOLY_CATEGORIES } from '../../data/toolyCatalog';
import { ToolyCategoryId } from '../../types/hub';
import { triggerHaptic } from '../../utils/haptics';
import { describeWeatherCode, formatTemp, WeatherGlyph } from './WeatherModule';

const CATEGORY_ICONS: Record<ToolyCategoryId, React.ComponentType<{ className?: string }>> = {
  general: Wrench,
  text: FileText,
  generator: Sparkles,
  calculation: Calculator,
  image: ImageIcon,
  unit: ArrowLeftRight,
  finance: Landmark,
  randomizer: Dices,
  health: HeartPulse,
  development: Code2,
  colors: Palette,
};

export const DashboardHub: React.FC = () => {
  const {
    state,
    setActiveModule,
    openToolyCategory,
    openToolySubTool,
    togglePinTool,
    toggleFavoriteCategory,
  } = useHub();

  const [catFilter, setCatFilter] = useState<'all' | 'favorites'>('all');

  const activeCity =
    state.weatherCities.find((c) => c.id === state.activeWeatherCityId) ?? state.weatherCities[0];
  const weather = activeCity ? state.weatherCache[activeCity.id] : undefined;
  const unit = state.preferences.tempUnit;

  const today = new Date().toISOString().slice(0, 10);
  const dueReminders = state.reminders.filter((r) => !r.completed && (!r.dueDate || r.dueDate <= today));
  const dueAnkiCards = state.ankiCards.filter((c) => c.dueDate <= Date.now());
  const pinnedTools = state.pinnedToolIds
    .map((id) => getSubToolById(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const visibleCategories =
    catFilter === 'favorites'
      ? TOOLY_CATEGORIES.filter((c) => state.favoriteCategories.includes(c.id))
      : TOOLY_CATEGORIES;

  return (
    <div className="space-y-6">
      {/* Unified Live Glance Strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Live Weather Glance */}
        <button
          type="button"
          onClick={() => setActiveModule('weather')}
          className="glass-panel glass-interactive rounded-3xl p-5 text-left flex items-center justify-between gap-4"
        >
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-medium text-slate-500">
              Weather{activeCity ? ` · ${activeCity.name}` : ''}
            </div>
            <div className="font-mono tabular-nums text-3xl font-bold text-slate-950">
              {weather ? formatTemp(weather.current.temperature, unit) : '—'}
            </div>
            <div className="text-xs text-slate-600 truncate">
              {weather
                ? `${describeWeatherCode(weather.current.weatherCode).label} · Humidity ${Math.round(weather.current.humidity)}%`
                : activeCity
                ? 'Syncing live forecast…'
                : 'Tap to add your city'}
            </div>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/80 border border-white flex items-center justify-center shrink-0">
            <WeatherGlyph
              code={weather?.current.weatherCode ?? 1}
              isDay={weather?.current.isDay ?? true}
              className="w-8 h-8"
            />
          </div>
        </button>

        {/* Reminders Glance */}
        <button
          type="button"
          onClick={() => setActiveModule('reminders')}
          className="glass-panel glass-interactive rounded-3xl p-5 text-left flex items-center justify-between gap-4"
        >
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-medium text-slate-500">Reminders · Today</div>
            <div className="font-mono tabular-nums text-3xl font-bold text-slate-950">
              {dueReminders.length}
            </div>
            <div className="text-xs text-slate-600 truncate">
              {dueReminders[0]?.title ?? 'No reminders yet · Tap to add'}
            </div>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-rose-500/12 border border-white flex items-center justify-center shrink-0 text-rose-600">
            <CheckCircle2 className="w-7 h-7" />
          </div>
        </button>

        {/* AnkiDroid Study Glance */}
        <button
          type="button"
          onClick={() => setActiveModule('anki')}
          className="glass-panel glass-interactive rounded-3xl p-5 text-left flex items-center justify-between gap-4"
        >
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-medium text-slate-500">AnkiDroid · Study Queue</div>
            <div className="font-mono tabular-nums text-3xl font-bold text-slate-950">
              {dueAnkiCards.length}
            </div>
            <div className="text-xs text-slate-600 truncate">
              {state.ankiDecks.length > 0
                ? `${state.ankiStats.streakDays}d streak · ${state.ankiDecks.length} ${state.ankiDecks.length === 1 ? 'deck' : 'decks'}`
                : 'No decks yet · Tap to create'}
            </div>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/12 border border-white flex items-center justify-center shrink-0 text-indigo-600">
            <Layers className="w-7 h-7" />
          </div>
        </button>
      </section>

      {/* Pinned Utilities Strip */}
      <section className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Pinned Utilities</h2>
            <p className="text-xs text-slate-500">
              One-tap launch for your daily Tooly sub-tools and connected apps
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveModule('interpreter')}
              className="h-9 px-3.5 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs shadow-[#007AFF]/20 active:scale-95"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>Interpreter</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('qr')}
              className="h-9 px-3.5 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-[#007AFF] flex items-center gap-1.5 active:scale-95"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR Studio</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('notes')}
              className="h-9 px-3.5 rounded-xl bg-white/85 hover:bg-white border border-white text-xs font-semibold text-slate-800 flex items-center gap-1.5 active:scale-95"
            >
              <NotebookPen className="w-3.5 h-3.5" />
              <span>Notes ({state.notes.length})</span>
            </button>
          </div>
        </div>

        {pinnedTools.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">
            Open any Tooly category below and click Pin Tool to keep your favorites right here.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {pinnedTools.map((tool) => {
              const cat = getCategoryById(tool.categoryId);
              return (
                <div
                  key={tool.id}
                  className="group relative rounded-2xl bg-white/75 hover:bg-white border border-white/95 p-3.5 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => openToolySubTool(tool.id)}
                    className="w-full text-left space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cat.accentHex }}
                      />
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#007AFF] transition-colors" />
                    </div>
                    <div className="font-display font-semibold text-sm text-slate-900 truncate">
                      {tool.shortName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{cat.name}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePinTool(tool.id)}
                    aria-label={`Unpin ${tool.shortName}`}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xs"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Tooly 11 Categories Grid (Faithful to Tooly Screenshot in Liquid Glass) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Tooly Suite
            </h1>
            <p className="text-sm text-slate-600">
              11 utility categories · 52 interactive tools · Tap any card to open its sub-tabs
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/60 border border-white self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setCatFilter('all');
              }}
              className={`h-9 px-4 rounded-xl text-xs font-semibold transition-all ${
                catFilter === 'all' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
              }`}
            >
              All ({TOOLY_CATEGORIES.length})
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setCatFilter('favorites');
              }}
              className={`h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                catFilter === 'favorites' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <span>Favorites ({state.favoriteCategories.length})</span>
            </button>
          </div>
        </div>

        {visibleCategories.length === 0 ? (
          <div className="glass-panel rounded-3xl p-10 text-center space-y-2">
            <p className="text-sm text-slate-600">No favorite categories starred yet.</p>
            <button
              type="button"
              onClick={() => setCatFilter('all')}
              className="text-xs font-semibold text-[#007AFF]"
            >
              View all 11 categories
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
            {visibleCategories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.id];
              const isFav = state.favoriteCategories.includes(cat.id);
              return (
                <div
                  key={cat.id}
                  className="glass-panel glass-interactive rounded-3xl p-5 flex flex-col justify-between relative group"
                >
                  <button
                    type="button"
                    onClick={() => toggleFavoriteCategory(cat.id)}
                    aria-label={isFav ? `Unfavorite ${cat.name}` : `Favorite ${cat.name}`}
                    className={`absolute top-3.5 right-3.5 w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                      isFav ? 'text-rose-500 bg-rose-50/90' : 'text-slate-400 hover:bg-white/80'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => openToolyCategory(cat.id)}
                    className="w-full text-left flex flex-col items-start space-y-4"
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center border border-white/90 shadow-xs"
                      style={{ backgroundColor: cat.softBg, color: cat.accentHex }}
                    >
                      <Icon className="w-7 h-7 stroke-[2.1]" />
                    </div>

                    <div className="space-y-1 w-full">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-bold text-base text-slate-900 leading-tight">
                          {cat.name}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {cat.subtitle}
                      </p>
                      <div className="pt-1 text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                        <span className="font-mono tabular-nums">{cat.subTools.length} tools</span>
                        {cat.isNew && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-600 font-semibold">New</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Notes Strip */}
      {state.notes.length > 0 && (
        <section className="glass-panel rounded-3xl p-5 sm:p-6 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-slate-900">Recent Notes</h2>
            <button
              type="button"
              onClick={() => setActiveModule('notes')}
              className="text-xs font-semibold text-[#007AFF] flex items-center gap-1"
            >
              <span>Open Notes</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {state.notes.slice(0, 2).map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => setActiveModule('notes')}
                className="rounded-2xl bg-white/70 hover:bg-white border border-white p-4 text-left transition-colors space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold text-sm text-slate-900 truncate">
                    {note.title || 'Untitled Note'}
                  </span>
                  {note.pinned && <Pin className="w-3.5 h-3.5 text-[#007AFF] shrink-0" />}
                </div>
                <p className="text-xs text-slate-600 line-clamp-2">{note.content || 'Empty note'}</p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
