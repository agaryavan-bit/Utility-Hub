import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, Check, Clock, X } from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { ReminderItem } from '../../types/hub';
import { appAudioEngine } from '../../utils/appAudioEngine';
import { triggerHaptic } from '../../utils/haptics';

const FIRED_STORAGE_KEY = 'tooly_fired_task_alarms_v1';

function getTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function parseLocalStartMs(dateIso: string, timeHm: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeHm);
  if (!dateMatch || !timeMatch) return null;
  const dt = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
    0
  );
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

function loadFiredAlarmKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(FIRED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((v): v is string => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveFiredAlarmKeys(keys: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(FIRED_STORAGE_KEY, JSON.stringify(Array.from(keys).slice(-200)));
  } catch {
    // ignore storage limits
  }
}

export const ReminderAlarmController: React.FC = () => {
  const { state, toggleReminderCompleted, updateReminder, showToast } = useHub();
  const [ringingReminder, setRingingReminder] = useState<ReminderItem | null>(null);
  const firedKeysRef = useRef<Set<string>>(loadFiredAlarmKeys());

  // 1. Start the continuous soft ambient song while open, and immediately stop when closed/backgrounded
  useEffect(() => {
    if (!document.hidden && document.visibilityState === 'visible') {
      appAudioEngine.unlockAndStartSong();
    }

    const handleUserUnlock = () => {
      if (document.hidden || document.visibilityState !== 'visible') return;
      appAudioEngine.unlockAndStartSong();
    };

    const handleVisibilityChange = () => {
      if (document.hidden || document.visibilityState !== 'visible') {
        appAudioEngine.pauseSongForBackground();
      } else {
        appAudioEngine.resumeFromBackground();
      }
    };

    const handleFreeze = () => {
      appAudioEngine.pauseSongForBackground();
    };

    const handlePageHide = () => {
      appAudioEngine.pauseSongForBackground();
    };

    const handlePageShow = () => {
      if (!document.hidden && document.visibilityState === 'visible') {
        appAudioEngine.resumeFromBackground();
      }
    };

    const handleAppClose = () => {
      appAudioEngine.stopAllOnClose();
    };

    window.addEventListener('pointerdown', handleUserUnlock, { passive: true });
    window.addEventListener('keydown', handleUserUnlock, { passive: true });
    window.addEventListener('touchstart', handleUserUnlock, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('freeze', handleFreeze);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('beforeunload', handleAppClose);
    window.addEventListener('unload', handleAppClose);

    return () => {
      window.removeEventListener('pointerdown', handleUserUnlock);
      window.removeEventListener('keydown', handleUserUnlock);
      window.removeEventListener('touchstart', handleUserUnlock);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('freeze', handleFreeze);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('beforeunload', handleAppClose);
      window.removeEventListener('unload', handleAppClose);
      appAudioEngine.pauseSongForBackground();
    };
  }, []);

  const dismissAlarm = useCallback(() => {
    triggerHaptic('light');
    setRingingReminder(null);
    appAudioEngine.stopReminderAlarm();
  }, []);

  const completeRingingTask = useCallback(() => {
    if (!ringingReminder) return;
    const id = ringingReminder.id;
    setRingingReminder(null);
    appAudioEngine.stopReminderAlarm();
    toggleReminderCompleted(id);
  }, [ringingReminder, toggleReminderCompleted]);

  const snoozeRingingTask = useCallback(() => {
    if (!ringingReminder) return;
    const target = ringingReminder;
    const snoozed = new Date(Date.now() + 5 * 60_000);
    const nextDate = `${snoozed.getFullYear()}-${String(snoozed.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(snoozed.getDate()).padStart(2, '0')}`;
    const nextTime = `${String(snoozed.getHours()).padStart(2, '0')}:${String(
      snoozed.getMinutes()
    ).padStart(2, '0')}`;

    setRingingReminder(null);
    appAudioEngine.stopReminderAlarm();
    updateReminder({
      ...target,
      dueDate: nextDate,
      dueTime: nextTime,
    });
    triggerHaptic('selection');
    showToast({
      title: 'Snoozed for 5 minutes',
      description: `${target.title} · starts at ${nextTime}`,
    });
  }, [ringingReminder, updateReminder, showToast]);

  // If the ringing task is manually completed or deleted from the list, stop ringing & resume song
  useEffect(() => {
    if (!ringingReminder) return;
    const current = state.reminders.find((r) => r.id === ringingReminder.id);
    if (!current || current.completed) {
      setRingingReminder(null);
      appAudioEngine.stopReminderAlarm();
    }
  }, [state.reminders, ringingReminder]);

  // 2. Poll every second to trigger the alarm the moment any task reaches its scheduled start time
  useEffect(() => {
    const checkDueTasks = () => {
      const now = Date.now();
      const today = getTodayIso();

      for (const rem of state.reminders) {
        if (rem.completed || !rem.dueTime) continue;
        const dateStr = rem.dueDate || today;
        const startMs = parseLocalStartMs(dateStr, rem.dueTime);
        if (startMs === null) continue;

        const alarmKey = `${rem.id}|${dateStr}|${rem.dueTime}`;
        if (firedKeysRef.current.has(alarmKey)) continue;

        const delta = now - startMs;
        // Fire as soon as start time is reached (within the active start minute)
        if (delta >= 0 && delta < 60_000) {
          firedKeysRef.current.add(alarmKey);
          saveFiredAlarmKeys(firedKeysRef.current);

          setRingingReminder(rem);
          triggerHaptic('success');
          appAudioEngine.startReminderAlarm(() => {
            setRingingReminder((curr) => (curr?.id === rem.id ? null : curr));
          });
          break;
        }
      }
    };

    checkDueTasks();
    const interval = window.setInterval(checkDueTasks, 1000);
    return () => window.clearInterval(interval);
  }, [state.reminders]);

  return (
    <AnimatePresence>
      {ringingReminder && (
        <motion.div
          role="alertdialog"
          aria-live="assertive"
          aria-label={`Task starting: ${ringingReminder.title}`}
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1.5rem)] max-w-md"
        >
          <div className="glass-panel-strong rounded-3xl p-4 sm:p-5 border border-rose-200/80 shadow-[0_24px_56px_-14px_rgba(239,68,68,0.28)] space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <motion.div
                  animate={{ rotate: [-12, 12, -10, 10, 0] }}
                  transition={{ repeat: Infinity, duration: 1.2, repeatDelay: 0.6 }}
                  className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-500/30"
                >
                  <BellRing className="w-5 h-5" />
                </motion.div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                    <span>Task Starting Now</span>
                    {ringingReminder.dueTime && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{ringingReminder.dueTime}</span>
                      </>
                    )}
                  </div>
                  <h2 className="font-display text-base sm:text-lg font-bold text-slate-950 leading-snug mt-0.5 break-words">
                    {ringingReminder.title}
                  </h2>
                  {ringingReminder.notes && (
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                      {ringingReminder.notes}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={dismissAlarm}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-white/70 shrink-0"
                aria-label="Dismiss reminder alarm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={completeRingingTask}
                className="flex-1 h-10 px-3.5 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.6]" />
                <span>Mark Done</span>
              </button>
              <button
                type="button"
                onClick={snoozeRingingTask}
                className="h-10 px-3.5 rounded-xl bg-white/85 hover:bg-white border border-white text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all whitespace-nowrap"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Snooze 5m</span>
              </button>
              <button
                type="button"
                onClick={dismissAlarm}
                className="h-10 px-3.5 rounded-xl bg-slate-900/5 hover:bg-slate-900/10 text-slate-700 text-xs font-semibold active:scale-95 transition-all"
              >
                Stop
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
