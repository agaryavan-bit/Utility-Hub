import React, { useMemo, useRef, useState } from 'react';
import {
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Flag,
  Inbox,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { ReminderPriority, ReminderRepeat } from '../../types/hub';
import { appAudioEngine } from '../../utils/appAudioEngine';
import { autoScrollToElement } from '../../utils/autoScroll';
import { triggerHaptic } from '../../utils/haptics';

type SmartFilter = 'today' | 'scheduled' | 'all' | 'flagged' | 'completed';

function getTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const LIST_COLORS = ['#007AFF', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#EF4444'];

export const RemindersModule: React.FC = () => {
  const {
    state,
    addReminder,
    updateReminder,
    toggleReminderCompleted,
    deleteReminder,
    addReminderList,
  } = useHub();

  const [smartFilter, setSmartFilter] = useState<SmartFilter | null>('today');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  // Add reminder form
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(getTodayIso());
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<ReminderPriority>('none');
  const [repeat, setRepeat] = useState<ReminderRepeat>('none');
  const [listId, setListId] = useState(state.reminderLists[0]?.id ?? '');
  const [flagged, setFlagged] = useState(false);

  // New list form
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);
  const [showNewList, setShowNewList] = useState(false);
  const tasksPanelRef = useRef<HTMLDivElement | null>(null);
  const newListRef = useRef<HTMLDivElement | null>(null);

  const today = getTodayIso();

  const counts = useMemo(() => {
    const active = state.reminders.filter((r) => !r.completed);
    return {
      today: active.filter((r) => r.dueDate && r.dueDate <= today).length,
      scheduled: active.filter((r) => Boolean(r.dueDate)).length,
      all: active.length,
      flagged: active.filter((r) => r.flagged).length,
      completed: state.reminders.filter((r) => r.completed).length,
    };
  }, [state.reminders, today]);

  const visibleReminders = useMemo(() => {
    return state.reminders
      .filter((r) => {
        if (selectedListId) return !r.completed && r.listId === selectedListId;
        switch (smartFilter) {
          case 'today':
            return !r.completed && Boolean(r.dueDate && r.dueDate <= today);
          case 'scheduled':
            return !r.completed && Boolean(r.dueDate);
          case 'flagged':
            return !r.completed && r.flagged;
          case 'completed':
            return r.completed;
          case 'all':
          default:
            return !r.completed;
        }
      })
      .sort((a, b) => {
        const pOrder: Record<ReminderPriority, number> = { high: 3, medium: 2, low: 1, none: 0 };
        if (pOrder[b.priority] !== pOrder[a.priority]) return pOrder[b.priority] - pOrder[a.priority];
        return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
      });
  }, [state.reminders, smartFilter, selectedListId, today]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addReminder({
      title: title.trim(),
      notes: notes.trim(),
      listId: selectedListId ?? listId,
      dueDate,
      dueTime,
      priority,
      repeat,
      flagged,
    });
    setTitle('');
    setNotes('');
    setDueTime('');
    setPriority('none');
    setRepeat('none');
    setFlagged(false);
  };

  const activeHeading = selectedListId
    ? state.reminderLists.find((l) => l.id === selectedListId)?.name ?? 'List'
    : smartFilter === 'today'
    ? 'Today'
    : smartFilter === 'scheduled'
    ? 'Scheduled'
    : smartFilter === 'flagged'
    ? 'Flagged'
    : smartFilter === 'completed'
    ? 'Completed'
    : 'All Reminders';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Sidebar: Smart Lists & Custom Lists */}
      <div className="lg:col-span-4 space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          {([
            { id: 'today', label: 'Today', count: counts.today, icon: Calendar, color: '#007AFF' },
            { id: 'scheduled', label: 'Scheduled', count: counts.scheduled, icon: Clock, color: '#EF4444' },
            { id: 'all', label: 'All Open', count: counts.all, icon: Inbox, color: '#334155' },
            { id: 'flagged', label: 'Flagged', count: counts.flagged, icon: Flag, color: '#F59E0B' },
          ] as const).map((card) => {
            const Icon = card.icon;
            const active = !selectedListId && smartFilter === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setSelectedListId(null);
                  setSmartFilter(card.id);
                  autoScrollToElement(tasksPanelRef);
                }}
                className={`glass-panel rounded-2xl p-4 text-left transition-all active:scale-[0.98] ${
                  active ? 'ring-2 ring-[#007AFF]/50 bg-white/85' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
                    style={{ backgroundColor: card.color }}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                    {card.count}
                  </span>
                </div>
                <div className="mt-2.5 text-xs font-semibold text-slate-700">{card.label}</div>
              </button>
            );
          })}
        </div>

        {/* Completed Quick Row */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection');
            setSelectedListId(null);
            setSmartFilter('completed');
            autoScrollToElement(tasksPanelRef);
          }}
          className={`w-full glass-panel rounded-2xl px-4 py-3 flex items-center justify-between transition-all ${
            !selectedListId && smartFilter === 'completed' ? 'ring-2 ring-[#007AFF]/50 bg-white/85' : ''
          }`}
        >
          <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Completed</span>
          </span>
          <span className="font-mono tabular-nums text-sm font-bold text-slate-600">{counts.completed}</span>
        </button>

        {/* Custom Lists */}
        <div className="glass-panel rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">My Lists</span>
            <button
              type="button"
              onClick={() => {
                setShowNewList((v) => {
                  const next = !v;
                  if (next) autoScrollToElement(newListRef);
                  return next;
                });
              }}
              className="text-xs font-semibold text-[#007AFF] flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add List</span>
            </button>
          </div>

          {showNewList && (
            <div ref={newListRef} className="p-3 rounded-2xl bg-white/75 border border-white space-y-2.5">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="List name…"
                className="w-full h-9 px-3 rounded-xl glass-input text-xs"
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {LIST_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setNewListColor(col)}
                      className={`w-5 h-5 rounded-full ${newListColor === col ? 'ring-2 ring-offset-1 ring-slate-800' : ''}`}
                      style={{ backgroundColor: col }}
                      aria-label={`Color ${col}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!newListName.trim()) return;
                    const created = addReminderList(newListName, newListColor);
                    setSelectedListId(created.id);
                    setNewListName('');
                    setShowNewList(false);
                    autoScrollToElement(tasksPanelRef);
                  }}
                  className="h-8 px-3 rounded-lg bg-[#007AFF] text-white text-xs font-semibold"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {state.reminderLists.length === 0 ? (
            <p className="text-xs text-slate-500 py-1">No custom lists yet. Click Add List to create one.</p>
          ) : (
            <div className="space-y-1">
              {state.reminderLists.map((l) => {
                const listCount = state.reminders.filter((r) => !r.completed && r.listId === l.id).length;
                const active = selectedListId === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setSelectedListId(l.id);
                      autoScrollToElement(tasksPanelRef);
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-sm transition-colors ${
                      active ? 'bg-white text-slate-950 font-semibold shadow-xs' : 'text-slate-700 hover:bg-white/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                      <span>{l.name}</span>
                    </span>
                    <span className="font-mono tabular-nums text-xs text-slate-500">{listCount}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Workspace: Quick Add + Reminder Items */}
      <div ref={tasksPanelRef} className="lg:col-span-8 glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">{activeHeading}</h1>
          <span className="font-mono tabular-nums text-sm text-slate-500">
            {visibleReminders.length} {visibleReminders.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {/* New Reminder Form */}
        {smartFilter !== 'completed' && (
          <form onSubmit={handleAdd} className="rounded-2xl bg-white/70 border border-white p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add a reminder…"
                className="flex-1 min-w-0 h-11 px-4 rounded-xl glass-input text-sm font-medium"
              />
              <button
                type="submit"
                disabled={!title.trim()}
                className="h-11 px-5 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold disabled:opacity-40 active:scale-95 transition-all whitespace-nowrap shrink-0"
              >
                Add Task
              </button>
            </div>

            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              className="w-full h-9 px-3.5 rounded-xl glass-input text-xs"
            />

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 px-2.5 rounded-xl glass-input font-mono text-xs"
              />
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                aria-label="Task start time"
                title="Task start time — plays an alarm sound when reached"
                className="h-9 px-2.5 rounded-xl glass-input font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  appAudioEngine.previewAlarmChime();
                }}
                title="Preview task start alarm sound"
                className="h-9 px-2.5 rounded-xl bg-white/75 hover:bg-white border border-white text-slate-600 hover:text-[#007AFF] text-xs font-medium flex items-center gap-1 transition-colors active:scale-95"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Test Sound</span>
              </button>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ReminderPriority)}
                className="h-9 px-2.5 rounded-xl glass-input text-xs font-medium"
              >
                <option value="none">No Priority</option>
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as ReminderRepeat)}
                className="h-9 px-2.5 rounded-xl glass-input text-xs font-medium"
              >
                <option value="none">No Repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              {!selectedListId && state.reminderLists.length > 0 && (
                <select
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                  className="h-9 px-2.5 rounded-xl glass-input text-xs font-medium"
                >
                  <option value="">No List</option>
                  {state.reminderLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setFlagged((f) => !f);
                }}
                className={`h-9 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 border ${
                  flagged
                    ? 'bg-amber-500/15 border-amber-300 text-amber-800'
                    : 'bg-white/75 border-white text-slate-600'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Flag</span>
              </button>
            </div>
          </form>
        )}

        {/* Reminder Rows */}
        {visibleReminders.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            All clear in {activeHeading}. Add a task above whenever something comes up.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70">
            {visibleReminders.map((rem) => {
              const list = state.reminderLists.find((l) => l.id === rem.listId);
              const isOverdue = !rem.completed && Boolean(rem.dueDate && rem.dueDate < today);
              return (
                <div key={rem.id} className="py-3.5 flex items-start gap-3.5 group">
                  <button
                    type="button"
                    onClick={() => toggleReminderCompleted(rem.id)}
                    aria-label={rem.completed ? 'Mark incomplete' : 'Mark complete'}
                    className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                      rem.completed
                        ? 'bg-[#007AFF] border-[#007AFF] text-white'
                        : 'border-slate-300 hover:border-[#007AFF] bg-white/80'
                    }`}
                  >
                    {rem.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm sm:text-base font-medium ${
                        rem.completed ? 'line-through text-slate-400' : 'text-slate-900'
                      }`}
                    >
                      {rem.title}
                    </div>
                    {rem.notes && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{rem.notes}</p>
                    )}

                    {/* Unboxed Clean Metadata */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      {list && <span className="font-medium text-slate-700">{list.name}</span>}
                      {rem.dueDate && (
                        <>
                          <span>·</span>
                          <span className={`font-mono ${isOverdue ? 'text-rose-600 font-semibold' : ''}`}>
                            {isOverdue ? 'Overdue · ' : ''}
                            {rem.dueDate === today ? 'Today' : rem.dueDate}
                            {rem.dueTime ? ` ${rem.dueTime}` : ''}
                          </span>
                        </>
                      )}
                      {rem.priority !== 'none' && (
                        <>
                          <span>·</span>
                          <span
                            className={`font-semibold capitalize ${
                              rem.priority === 'high'
                                ? 'text-rose-600'
                                : rem.priority === 'medium'
                                ? 'text-amber-600'
                                : 'text-sky-600'
                            }`}
                          >
                            {rem.priority} priority
                          </span>
                        </>
                      )}
                      {rem.repeat !== 'none' && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 capitalize">
                            <Repeat className="w-3 h-3" />
                            {rem.repeat}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        updateReminder({ ...rem, flagged: !rem.flagged });
                      }}
                      className={`p-2 rounded-xl transition-colors ${
                        rem.flagged ? 'text-amber-500 bg-amber-50' : 'text-slate-400 hover:bg-white/80'
                      }`}
                      aria-label="Toggle flag"
                    >
                      <Flag className={`w-4 h-4 ${rem.flagged ? 'fill-amber-500' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteReminder(rem.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-white/80"
                      aria-label="Delete reminder"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
