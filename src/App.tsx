import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { FloatingGlassDock } from './components/layout/FloatingGlassDock';
import { ReminderAlarmController } from './components/layout/ReminderAlarmController';
import { TopGlassBar } from './components/layout/TopGlassBar';
import { CrossToolModals } from './components/modals/CrossToolModals';
import { AnkiDroidModule } from './components/modules/AnkiDroidModule';
import { DashboardHub } from './components/modules/DashboardHub';
import { InterpreterModule } from './components/modules/InterpreterModule';
import { NotesModule } from './components/modules/NotesModule';
import { QrStudioModule } from './components/modules/QrStudioModule';
import { RemindersModule } from './components/modules/RemindersModule';
import { WeatherModule } from './components/modules/WeatherModule';
import { ToolyWorkspace } from './components/tooly/ToolyWorkspace';
import { HubProvider, useHub } from './context/HubContext';
import { autoScrollToTop } from './utils/autoScroll';

const ToastStack: React.FC = () => {
  const { toasts, dismissToast } = useHub();

  return (
    <div className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="pointer-events-auto glass-panel-strong rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900">{t.title}</div>
              {t.description && (
                <div className="text-[11px] text-slate-600 truncate mt-0.5">{t.description}</div>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {t.actionLabel && t.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    t.onAction?.();
                    dismissToast(t.id);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#007AFF] text-white text-[11px] font-semibold"
                >
                  {t.actionLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="p-1 text-slate-400 hover:text-slate-800"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

const HubViewport: React.FC = () => {
  const { activeModule, activeToolyCategory, activeToolySubToolId } = useHub();

  const viewKey =
    activeModule === 'hub' && activeToolyCategory
      ? `tooly-${activeToolyCategory}`
      : activeModule;

  useEffect(() => {
    autoScrollToTop();
  }, [viewKey]);

  const renderView = () => {
    if (activeModule === 'hub') {
      return activeToolyCategory ? (
        <ToolyWorkspace
          categoryId={activeToolyCategory}
          initialSubToolId={activeToolySubToolId}
        />
      ) : (
        <DashboardHub />
      );
    }
    if (activeModule === 'interpreter') return <InterpreterModule />;
    if (activeModule === 'qr') return <QrStudioModule />;
    if (activeModule === 'weather') return <WeatherModule />;
    if (activeModule === 'notes') return <NotesModule />;
    if (activeModule === 'reminders') return <RemindersModule />;
    if (activeModule === 'anki') return <AnkiDroidModule />;
    return <DashboardHub />;
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Bright Frosted Liquid Glass Soft Pastel Mesh Canvas */}
      <div className="liquid-mesh-bg" aria-hidden="true" />

      <div className="relative z-10 flex-1 flex flex-col">
        <TopGlassBar />

        <div className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 pt-3 pb-10 sm:pb-12 flex items-start gap-3 sm:gap-5">
          <FloatingGlassDock />

          <main className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={viewKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        <ReminderAlarmController />
        <CrossToolModals />
        <ToastStack />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <HubProvider>
      <HubViewport />
    </HubProvider>
  );
}
