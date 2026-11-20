import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Languages,
  Layers,
  LayoutGrid,
  Mail,
  NotebookPen,
  QrCode,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { ActiveModule } from '../../types/hub';
import { triggerHaptic } from '../../utils/haptics';

interface VerticalTabItem {
  id: ActiveModule;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

const VERTICAL_TABS: VerticalTabItem[] = [
  { id: 'hub', label: 'Tooly', shortLabel: 'Tooly', icon: LayoutGrid, accent: '#007AFF' },
  { id: 'interpreter', label: 'Voice', shortLabel: 'Voice', icon: Languages, accent: '#0284C7' },
  { id: 'tempmail', label: 'Temp Mail', shortLabel: 'Temp Mail', icon: Mail, accent: '#10B981' },
  { id: 'qr', label: 'QR Studio', shortLabel: 'QR', icon: QrCode, accent: '#0EA5E9' },
  { id: 'weather', label: 'Weather', shortLabel: 'Weather', icon: CloudSun, accent: '#F59E0B' },
  { id: 'notes', label: 'Notes', shortLabel: 'Notes', icon: NotebookPen, accent: '#EAB308' },
  { id: 'reminders', label: 'Tasks', shortLabel: 'Tasks', icon: CheckCircle2, accent: '#EF4444' },
  { id: 'anki', label: 'AnkiDroid', shortLabel: 'Anki', icon: Layers, accent: '#6366F1' },
];

const SLIDER_STORAGE_KEY = 'tooly_vertical_tabs_slider_open_v1';

function loadSliderOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SLIDER_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export const FloatingGlassDock: React.FC = () => {
  const { activeModule, setActiveModule, state } = useHub();

  const [expanded, setExpanded] = useState<boolean>(() => loadSliderOpen());
  const swipeStartXRef = useRef<number | null>(null);

  const setSliderOpen = (next: boolean) => {
    setExpanded(next);
    try {
      window.localStorage.setItem(SLIDER_STORAGE_KEY, String(next));
    } catch {
      // ignore storage issues
    }
  };

  const toggleSlider = () => {
    triggerHaptic('selection');
    setSliderOpen(!expanded);
  };

  const handleTabClick = (mod: ActiveModule) => {
    setActiveModule(mod);
    // On narrow mobile screens, auto-slide closed after picking a tab so full width stays clear
    if (typeof window !== 'undefined' && window.innerWidth < 640 && expanded) {
      setSliderOpen(false);
    }
  };

  // Allow natural horizontal swipe gesture on the rail to slide open/closed without moving its anchor
  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    swipeStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    if (swipeStartXRef.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? swipeStartXRef.current;
    const dx = endX - swipeStartXRef.current;
    swipeStartXRef.current = null;
    if (dx > 28 && !expanded) {
      triggerHaptic('selection');
      setSliderOpen(true);
    } else if (dx < -28 && expanded) {
      triggerHaptic('selection');
      setSliderOpen(false);
    }
  };

  const openRemindersCount = state.reminders.filter((r) => !r.completed).length;
  const dueAnkiCount = state.ankiCards.filter((c) => c.dueDate <= Date.now()).length;

  return (
    <aside
      aria-label="Vertical tabs navigation slider"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="sticky top-[76px] z-30 shrink-0 self-start select-none"
    >
      <div
        className={`relative glass-dock rounded-[24px] p-1.5 flex flex-col gap-1 transition-[width] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          expanded ? 'w-[178px] sm:w-[198px]' : 'w-[70px] sm:w-[76px]'
        }`}
      >
        {/* Top Vertical-Tabs Slider Toggle Control */}
        <button
          type="button"
          onClick={toggleSlider}
          aria-expanded={expanded}
          aria-label={expanded ? 'Slide vertical tabs closed' : 'Slide vertical tabs open'}
          title={expanded ? 'Slide closed' : 'Slide open'}
          className={`h-9 rounded-[14px] px-2 flex items-center text-slate-600 hover:text-slate-950 hover:bg-white/75 transition-colors active:scale-95 border-b border-slate-900/[0.05] mb-0.5 ${
            expanded ? 'justify-between' : 'justify-center'
          }`}
        >
          {expanded && (
            <span className="text-[11px] font-semibold tracking-tight text-slate-500 pl-1 whitespace-nowrap overflow-hidden">
              Vertical Tabs
            </span>
          )}
          <span className="w-6 h-6 rounded-lg bg-slate-900/[0.05] flex items-center justify-center shrink-0">
            {expanded ? (
              <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
            )}
          </span>
        </button>

        {/* Vertical Sliding Tab Track */}
        <nav className="flex flex-col gap-1 max-h-[calc(100vh-148px)] overflow-y-auto no-scrollbar">
          {VERTICAL_TABS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            const badgeCount =
              item.id === 'reminders'
                ? openRemindersCount
                : item.id === 'anki'
                ? dueAnkiCount
                : 0;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabClick(item.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                title={!expanded ? item.label : undefined}
                className={`relative w-full rounded-[16px] flex items-center transition-colors active:scale-[0.97] overflow-hidden ${
                  expanded
                    ? 'min-h-[42px] px-2.5 gap-2.5 justify-start flex-row'
                    : 'min-h-[50px] py-1.5 px-1.5 gap-0.5 justify-center flex-col'
                } ${
                  isActive
                    ? 'text-[#007AFF]'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-white/50'
                }`}
              >
                {/* Smooth Sliding Liquid Glass Selection Capsule */}
                {isActive && (
                  <motion.span
                    layoutId="liquid-vertical-slider-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    className="absolute inset-0 rounded-[16px] bg-white/92 shadow-[0_4px_14px_rgba(0,122,255,0.14),inset_0_1px_0_rgba(255,255,255,1)] border border-white"
                  />
                )}

                {/* Vertical Slider Active Edge Accent Bar */}
                {isActive && (
                  <motion.span
                    layoutId="liquid-vertical-slider-bar"
                    transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                    className="absolute left-0.5 top-2.5 bottom-2.5 w-[2.5px] rounded-full bg-[#007AFF] z-10"
                  />
                )}

                <span className="relative z-10 flex items-center justify-center shrink-0">
                  <Icon
                    className={`w-[18px] h-[18px] transition-transform duration-150 ${
                      isActive ? 'scale-105 stroke-[2.25]' : 'stroke-[1.9]'
                    }`}
                  />
                  {!expanded && badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full bg-slate-900 text-white font-mono text-[9.5px] font-semibold flex items-center justify-center tabular-nums leading-none">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </span>

                {expanded ? (
                  <>
                    <span
                      className={`relative z-10 text-[13px] truncate flex-1 text-left whitespace-nowrap ${
                        isActive ? 'font-semibold text-slate-950' : 'font-medium text-slate-700'
                      }`}
                    >
                      {item.label}
                    </span>
                    {badgeCount > 0 && (
                      <span className="relative z-10 font-mono text-[11px] font-semibold tabular-nums text-slate-500 shrink-0">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </>
                ) : (
                  <span
                    className={`relative z-10 text-[9.5px] leading-[1.15] tracking-tight text-center max-w-full truncate pl-0.5 ${
                      isActive ? 'font-bold text-[#007AFF]' : 'font-semibold text-slate-600'
                    }`}
                  >
                    {item.shortLabel}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Subtle Right-Edge Slider Pull Pill */}
        <button
          type="button"
          onClick={toggleSlider}
          aria-label={expanded ? 'Collapse vertical tabs slider' : 'Expand vertical tabs slider'}
          className="hidden sm:flex absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-11 rounded-full bg-white/90 hover:bg-white border border-slate-200/80 shadow-sm items-center justify-center text-slate-500 hover:text-[#007AFF] transition-colors active:scale-95"
        >
          {expanded ? (
            <ChevronLeft className="w-3 h-3 stroke-[2.5]" />
          ) : (
            <ChevronRight className="w-3 h-3 stroke-[2.5]" />
          )}
        </button>
      </div>
    </aside>
  );
};
