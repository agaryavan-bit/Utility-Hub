import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  ChevronLeft,
  Download,
  Flame,
  Layers,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { AnkiCard, AnkiCardType } from '../../types/hub';
import { autoScrollToElement, autoScrollToTop } from '../../utils/autoScroll';
import { triggerHaptic } from '../../utils/haptics';

const DECK_COLORS = ['#007AFF', '#F97316', '#10B981', '#8B5CF6', '#EC4899', '#0EA5E9'];

function formatClozeFront(text: string): string {
  return text.replace(/\{\{c\d+::([^:}]+)(?:::[^}]+)?\}\}/g, '[ … ]');
}

function formatClozeReveal(text: string): string {
  return text.replace(/\{\{c\d+::([^:}]+)(?:::[^}]+)?\}\}/g, '$1');
}

function previewNextInterval(card: AnkiCard, rating: 1 | 2 | 3 | 4): string {
  if (rating === 1) return '1m';
  if (rating === 2) {
    if (card.repetitions === 0) return '10m';
    return `${Math.max(1, Math.round(Math.max(1, card.interval) * 1.2))}d`;
  }
  if (rating === 3) {
    if (card.repetitions === 0) return '1d';
    if (card.repetitions === 1) return '6d';
    return `${Math.max(1, Math.round(card.interval * card.easeFactor))}d`;
  }
  if (card.repetitions === 0) return '4d';
  if (card.repetitions === 1) return '8d';
  return `${Math.max(2, Math.round(card.interval * card.easeFactor * 1.3))}d`;
}

export const AnkiDroidModule: React.FC = () => {
  const {
    state,
    addAnkiDeck,
    deleteAnkiDeck,
    addAnkiCards,
    deleteAnkiCard,
    reviewAnkiCard,
    showToast,
  } = useHub();

  const [view, setView] = useState<'decks' | 'study' | 'manage'>('decks');
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Create deck state
  const [showNewDeck, setShowNewDeck] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [deckDesc, setDeckDesc] = useState('');
  const [deckColor, setDeckColor] = useState(DECK_COLORS[0]);

  // Add card state
  const [cardType, setCardType] = useState<AnkiCardType>('basic');
  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');
  const [cardHint, setCardHint] = useState('');
  const [cardTags, setCardTags] = useState('');

  const newDeckRef = useRef<HTMLFormElement | null>(null);
  const ratingBarRef = useRef<HTMLDivElement | null>(null);
  const cardBrowserRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    autoScrollToTop();
  }, [view]);

  useEffect(() => {
    if (showNewDeck) {
      autoScrollToElement(newDeckRef);
    }
  }, [showNewDeck]);

  useEffect(() => {
    if (flipped) {
      autoScrollToElement(ratingBarRef, { align: 'bottom' });
    }
  }, [flipped]);

  const now = Date.now();
  const activeDeck = state.ankiDecks.find((d) => d.id === activeDeckId) ?? null;

  const deckCards = useMemo(
    () => (activeDeckId ? state.ankiCards.filter((c) => c.deckId === activeDeckId) : []),
    [state.ankiCards, activeDeckId]
  );

  const dueQueue = useMemo(
    () =>
      deckCards
        .filter((c) => c.dueDate <= Date.now())
        .sort((a, b) => a.dueDate - b.dueDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckCards, state.ankiStats.totalReviews]
  );

  const currentCard = dueQueue[0] ?? null;

  const handleCreateDeck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckName.trim()) return;
    addAnkiDeck(deckName, deckDesc, deckColor);
    setDeckName('');
    setDeckDesc('');
    setShowNewDeck(false);
  };

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDeckId || !cardFront.trim()) return;
    addAnkiCards(activeDeckId, [
      {
        type: cardType,
        front: cardFront,
        back: cardBack || (cardType === 'cloze' ? formatClozeReveal(cardFront) : ''),
        hint: cardHint,
        tags: cardTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      },
    ]);
    setCardFront('');
    setCardBack('');
    setCardHint('');
    setCardTags('');
    showToast({ title: 'Flashcard added to deck' });
    autoScrollToElement(cardBrowserRef);
  };

  const handleRate = (rating: 1 | 2 | 3 | 4) => {
    if (!currentCard) return;
    reviewAnkiCard(currentCard.id, rating);
    setFlipped(false);
    setShowHint(false);
  };

  const exportDeckJson = () => {
    if (!activeDeck) return;
    triggerHaptic('success');
    const payload = JSON.stringify({ deck: activeDeck, cards: deckCards }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDeck.name.toLowerCase().replace(/\s+/g, '-')}-anki.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ title: 'Deck exported as JSON' });
  };

  /* ==================== STUDY SESSION VIEW ==================== */
  if (view === 'study' && activeDeck) {
    return (
      <div className="space-y-5 max-w-3xl mx-auto">
        <div className="glass-panel rounded-3xl px-5 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setView('decks');
              setFlipped(false);
              setShowHint(false);
            }}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#007AFF]"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Decks</span>
          </button>
          <div className="text-center min-w-0">
            <div className="font-display font-bold text-sm sm:text-base text-slate-900 truncate">
              {activeDeck.name}
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              {dueQueue.length} due remaining
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setView('manage');
            }}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Cards
          </button>
        </div>

        {!currentCard ? (
          <div className="glass-panel rounded-3xl p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center mx-auto">
              <Layers className="w-7 h-7" />
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900">Deck Caught Up</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Every card due in {activeDeck.name} has been scheduled via SM-2 spaced repetition. Come back later or add new cards.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setView('decks')}
                className="h-11 px-5 rounded-2xl bg-[#007AFF] text-white text-sm font-semibold"
              >
                Back to Decks
              </button>
              <button
                type="button"
                onClick={() => setView('manage')}
                className="h-11 px-5 rounded-2xl bg-white/85 border border-white text-slate-800 text-sm font-semibold"
              >
                Add Cards
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* 3D Flipping Liquid Glass Flashcard */}
            <div className="perspective-1200">
              <motion.div
                onClick={() => {
                  triggerHaptic('light');
                  setFlipped((f) => !f);
                }}
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                className="relative min-h-[320px] sm:min-h-[360px] w-full preserve-3d cursor-pointer select-none"
              >
                {/* Front Face */}
                <div className="absolute inset-0 backface-hidden glass-panel-strong rounded-3xl p-7 sm:p-10 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="capitalize font-medium">{currentCard.type} card · Front</span>
                    <span className="font-mono tabular-nums">Ease {currentCard.easeFactor.toFixed(2)}</span>
                  </div>

                  <div className="my-auto py-6 text-center space-y-3">
                    <p className="font-display text-2xl sm:text-3xl font-bold text-slate-900 leading-snug text-balance">
                      {currentCard.type === 'cloze'
                        ? formatClozeFront(currentCard.front)
                        : currentCard.front}
                    </p>
                    {currentCard.hint && (
                      <div className="pt-2">
                        {showHint ? (
                          <p className="text-sm text-[#007AFF] font-medium">Hint: {currentCard.hint}</p>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('selection');
                              setShowHint(true);
                            }}
                            className="text-xs font-semibold text-slate-500 hover:text-[#007AFF]"
                          >
                            Show Hint
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-center text-xs text-slate-400">Tap card or press Show Answer</div>
                </div>

                {/* Back Face */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 glass-panel-strong rounded-3xl p-7 sm:p-10 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-[#007AFF]">Answer Revealed</span>
                    <span className="font-mono">{currentCard.tags.join(' · ')}</span>
                  </div>

                  <div className="my-auto py-4 text-center space-y-4">
                    <div className="text-sm text-slate-500">
                      {currentCard.type === 'cloze'
                        ? formatClozeReveal(currentCard.front)
                        : currentCard.front}
                    </div>
                    <div className="h-px w-20 bg-slate-200 mx-auto" />
                    <p className="font-display text-2xl sm:text-3xl font-bold text-slate-900 leading-snug">
                      {currentCard.back}
                    </p>
                  </div>

                  <div className="text-center text-xs text-slate-400">Rate recall accuracy below</div>
                </div>
              </motion.div>
            </div>

            {/* Study Action Controls */}
            {!flipped ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  setFlipped(true);
                }}
                className="w-full h-14 rounded-2xl bg-[#007AFF] hover:bg-[#0062CC] text-white font-display font-bold text-base shadow-lg shadow-[#007AFF]/20 active:scale-[0.98] transition-all"
              >
                Show Answer
              </button>
            ) : (
              <div ref={ratingBarRef} className="grid grid-cols-4 gap-2.5">
                {([
                  { rating: 1, label: 'Again', tone: 'bg-rose-500/14 text-rose-700 hover:bg-rose-500/22' },
                  { rating: 2, label: 'Hard', tone: 'bg-amber-500/15 text-amber-800 hover:bg-amber-500/22' },
                  { rating: 3, label: 'Good', tone: 'bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/22' },
                  { rating: 4, label: 'Easy', tone: 'bg-[#007AFF]/15 text-[#007AFF] hover:bg-[#007AFF]/22' },
                ] as const).map((btn) => (
                  <button
                    key={btn.rating}
                    type="button"
                    onClick={() => handleRate(btn.rating)}
                    className={`h-16 rounded-2xl border border-white/80 flex flex-col items-center justify-center transition-all active:scale-95 ${btn.tone}`}
                  >
                    <span className="font-display font-bold text-sm">{btn.label}</span>
                    <span className="font-mono tabular-nums text-[11px] opacity-80 mt-0.5">
                      {previewNextInterval(currentCard, btn.rating)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ==================== DECK CARD MANAGER VIEW ==================== */
  if (view === 'manage' && activeDeck) {
    return (
      <div className="space-y-5">
        <div className="glass-panel rounded-3xl p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setView('decks');
              }}
              className="h-9 px-3 rounded-xl bg-white/80 text-xs font-semibold text-[#007AFF] flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Decks</span>
            </button>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900">{activeDeck.name}</h1>
              <p className="text-xs text-slate-500">{deckCards.length} total cards</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportDeckJson}
              className="h-9 px-3.5 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-700 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setView('study');
              }}
              className="h-9 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Study Now</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Add Card Form */}
          <form onSubmit={handleAddCard} className="lg:col-span-5 glass-panel rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-slate-900">Add Flashcard</h2>
              <div className="flex items-center p-1 rounded-xl bg-slate-900/5">
                {(['basic', 'cloze'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCardType(t)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize ${
                      cardType === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {cardType === 'cloze' ? 'Cloze Text (wrap answer in {{c1::...}})' : 'Front (Prompt)'}
              </label>
              <textarea
                rows={3}
                value={cardFront}
                onChange={(e) => setCardFront(e.target.value)}
                placeholder={
                  cardType === 'cloze'
                    ? 'The powerhouse of the cell is the {{c1::mitochondria}}.'
                    : 'Enter question or vocabulary word…'
                }
                className="w-full p-3 rounded-xl glass-input text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {cardType === 'cloze' ? 'Extra Back Explanation (Optional)' : 'Back (Answer)'}
              </label>
              <textarea
                rows={3}
                value={cardBack}
                onChange={(e) => setCardBack(e.target.value)}
                placeholder="Answer or detailed notes…"
                className="w-full p-3 rounded-xl glass-input text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={cardHint}
                onChange={(e) => setCardHint(e.target.value)}
                placeholder="Optional hint"
                className="h-10 px-3 rounded-xl glass-input text-xs"
              />
              <input
                type="text"
                value={cardTags}
                onChange={(e) => setCardTags(e.target.value)}
                placeholder="Tags (comma sep)"
                className="h-10 px-3 rounded-xl glass-input text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={!cardFront.trim()}
              className="w-full h-11 rounded-xl bg-[#007AFF] text-white text-xs font-semibold disabled:opacity-40 active:scale-[0.98]"
            >
              Save Card to Deck
            </button>
          </form>

          {/* Card Browser */}
          <div ref={cardBrowserRef} className="lg:col-span-7 glass-panel rounded-3xl p-5 space-y-3">
            <h2 className="font-display font-bold text-slate-900">Card Browser</h2>
            {deckCards.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No cards in this deck yet. Create one on the left or convert a Note directly from Notes.
              </div>
            ) : (
              <div className="divide-y divide-slate-200/70 max-h-[460px] overflow-y-auto">
                {deckCards.map((c) => (
                  <div key={c.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{c.front}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{c.back}</div>
                      <div className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
                        {c.type} · {c.status} · Ease {c.easeFactor.toFixed(2)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteAnkiCard(c.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 shrink-0"
                      aria-label="Delete card"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ==================== DECKS OVERVIEW ==================== */
  return (
    <div className="space-y-5">
      {/* Header & Study Streak */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            AnkiDroid Studio
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            SM-2 spaced-repetition flashcards with Basic & Cloze cards
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-white/75 border border-white px-4 py-2 flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 font-semibold text-amber-600">
              <Flame className="w-4 h-4" />
              <span className="font-mono tabular-nums">{state.ankiStats.streakDays}d streak</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">
              Today: <strong className="font-mono tabular-nums text-slate-900">{state.ankiStats.reviewedToday}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowNewDeck((v) => !v);
            }}
            className="h-10 px-4 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New Deck</span>
          </button>
        </div>
      </div>

      {/* Create Deck Drawer */}
      {showNewDeck && (
        <form ref={newDeckRef} onSubmit={handleCreateDeck} className="glass-panel rounded-3xl p-5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-4">
            <label className="block text-xs text-slate-600 mb-1">Deck Name</label>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="e.g. Organic Chemistry"
              className="w-full h-10 px-3.5 rounded-xl glass-input text-sm"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-xs text-slate-600 mb-1">Description</label>
            <input
              type="text"
              value={deckDesc}
              onChange={(e) => setDeckDesc(e.target.value)}
              placeholder="Short topic summary…"
              className="w-full h-10 px-3.5 rounded-xl glass-input text-sm"
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-1.5 h-10">
            {DECK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDeckColor(c)}
                className={`w-6 h-6 rounded-full ${deckColor === c ? 'ring-2 ring-offset-1 ring-slate-900' : ''}`}
                style={{ backgroundColor: c }}
                aria-label={`Deck color ${c}`}
              />
            ))}
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!deckName.trim()}
              className="w-full h-10 rounded-xl bg-[#007AFF] text-white text-xs font-semibold disabled:opacity-40"
            >
              Create Deck
            </button>
          </div>
        </form>
      )}

      {/* Decks Grid */}
      {state.ankiDecks.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center space-y-3">
          <p className="text-sm text-slate-600">Create your first flashcard deck to start spaced-repetition study.</p>
          <button
            type="button"
            onClick={() => setShowNewDeck(true)}
            className="h-10 px-5 rounded-xl bg-[#007AFF] text-white text-xs font-semibold"
          >
            Create First Deck
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.ankiDecks.map((deck) => {
            const cards = state.ankiCards.filter((c) => c.deckId === deck.id);
            const newCount = cards.filter((c) => c.status === 'new').length;
            const learnCount = cards.filter((c) => c.status === 'learning' && c.dueDate <= now).length;
            const revCount = cards.filter((c) => c.status === 'review' && c.dueDate <= now).length;
            const totalDue = newCount + learnCount + revCount;

            return (
              <div key={deck.id} className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: deck.color }} />
                      <h2 className="font-display text-lg font-bold text-slate-900">{deck.name}</h2>
                    </div>
                    <p className="text-xs text-slate-600">{deck.description || 'Custom flashcard deck'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteAnkiDeck(deck.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-white/80"
                    aria-label={`Delete ${deck.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Classic Anki New / Learning / Due Counts */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white/65 border border-white py-2.5">
                    <div className="font-mono tabular-nums text-lg font-bold text-[#007AFF]">{newCount}</div>
                    <div className="text-[11px] text-slate-500">New</div>
                  </div>
                  <div className="rounded-xl bg-white/65 border border-white py-2.5">
                    <div className="font-mono tabular-nums text-lg font-bold text-rose-600">{learnCount}</div>
                    <div className="text-[11px] text-slate-500">Learning</div>
                  </div>
                  <div className="rounded-xl bg-white/65 border border-white py-2.5">
                    <div className="font-mono tabular-nums text-lg font-bold text-emerald-600">{revCount}</div>
                    <div className="text-[11px] text-slate-500">Due Review</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      setActiveDeckId(deck.id);
                      setFlipped(false);
                      setShowHint(false);
                      setView('study');
                    }}
                    className="flex-1 h-11 rounded-2xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm shadow-[#007AFF]/20 active:scale-[0.98] transition-all"
                  >
                    {totalDue > 0 ? <Play className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    <span>{totalDue > 0 ? `Study (${totalDue} due)` : 'Review Deck'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setActiveDeckId(deck.id);
                      setView('manage');
                    }}
                    className="h-11 px-4 rounded-2xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-800 flex items-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Cards ({cards.length})</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
