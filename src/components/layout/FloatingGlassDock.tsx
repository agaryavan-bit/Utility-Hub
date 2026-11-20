import React from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  CloudSun,
  Layers,
  LayoutGrid,
  NotebookPen,
  QrCode,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { ActiveModule } from '../../types/hub';

interface DockItem {
  id: ActiveModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

const DOCK_ITEMS: DockItem[] = [
  { id: 'hub', label: 'Tooly', icon: LayoutGrid, accent: '#007AFF' },
  { id: 'qr', label: 'QR', icon: QrCode, accent: '#0EA5E9' },
  { id: 'weather', label: 'Weather', icon: CloudSun, accent: '#F59E0B' },
  { id: 'notes', label: 'Notes', icon: NotebookPen, accent: '#EAB308' },
  { id: 'reminders', label: 'Tasks', icon: CheckCircle2, accent: '#EF4444' },
  { id: 'anki', label: 'Anki', icon: Layers, accent: '#6366F1' },
];

export const FloatingGlassDock: React.FC = () => {
  const { activeModule, setActiveModule, state } = useHub();

  const openRemindersCount = state.reminders.filter((r) => !r.completed).length;
  const dueAnkiCount = state.ankiCards.filter((c) => c.dueDate <= Date.now()).length;

  return (
    <nav
      aria-label="Primary application dock"
      className="fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-xl"
    >
      <div className="glass-dock rounded-[26px] p-1.5 grid grid-cols-6 items-center gap-0.5 sm:gap-1">
        {DOCK_ITEMS.map((item) => {
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
              onClick={() => setActiveModule(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center min-h-[52px] sm:min-h-[54px] rounded-[20px] transition-colors active:scale-95 select-none ${
                isActive ? 'text-[#007AFF]' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="liquid-dock-active-pill"
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-0 rounded-[20px] bg-white/88 shadow-[0_4px_14px_rgba(0,122,255,0.14),inset_0_1px_0_rgba(255,255,255,1)] border border-white/95"
                />
              )}

              <span className="relative z-10 flex items-center justify-center">
                <Icon
                  className={`w-5 h-5 transition-transform duration-150 ${
                    isActive ? 'scale-105 stroke-[2.25]' : 'stroke-[1.9]'
                  }`}
                />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-slate-900 text-white font-mono text-[10px] font-semibold flex items-center justify-center tabular-nums leading-none">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </span>

              <span
                className={`relative z-10 mt-1 text-[10.5px] sm:text-[11px] leading-none whitespace-nowrap ${
                  isActive ? 'font-semibold text-[#007AFF]' : 'font-medium text-slate-600'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
