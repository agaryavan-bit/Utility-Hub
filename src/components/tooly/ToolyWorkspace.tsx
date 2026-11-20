import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Heart, Pin, PinOff } from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { getCategoryById } from '../../data/toolyCatalog';
import { ToolyCategoryId } from '../../types/hub';
import { autoScrollToElement } from '../../utils/autoScroll';
import { triggerHaptic } from '../../utils/haptics';
import { FinanceAndRandomTools } from './tools/FinanceAndRandomTools';
import { GeneralAndTextTools } from './tools/GeneralAndTextTools';
import { GeneratorAndCalcTools } from './tools/GeneratorAndCalcTools';
import { HealthDevColorTools } from './tools/HealthDevColorTools';
import { ImageAndUnitTools } from './tools/ImageAndUnitTools';

export const ToolyWorkspace: React.FC<{ categoryId: ToolyCategoryId; initialSubToolId: string | null }> = ({
  categoryId,
  initialSubToolId,
}) => {
  const { state, togglePinTool, toggleFavoriteCategory } = useHub();
  const category = getCategoryById(categoryId);
  const toolPanelRef = useRef<HTMLDivElement | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string>(
    initialSubToolId && category.subTools.some((t) => t.id === initialSubToolId)
      ? initialSubToolId
      : category.subTools[0].id
  );

  useEffect(() => {
    if (initialSubToolId && category.subTools.some((t) => t.id === initialSubToolId)) {
      setSelectedSubId(initialSubToolId);
    } else if (!category.subTools.some((t) => t.id === selectedSubId)) {
      setSelectedSubId(category.subTools[0].id);
    }
  }, [categoryId, initialSubToolId, category.subTools, selectedSubId]);

  const activeSubTool = category.subTools.find((t) => t.id === selectedSubId) ?? category.subTools[0];
  const isPinned = state.pinnedToolIds.includes(activeSubTool.id);
  const isFavCat = state.favoriteCategories.includes(category.id);

  const renderToolBody = () => {
    switch (category.id) {
      case 'general':
      case 'text':
        return <GeneralAndTextTools subToolId={activeSubTool.id} />;
      case 'generator':
      case 'calculation':
        return <GeneratorAndCalcTools subToolId={activeSubTool.id} />;
      case 'image':
      case 'unit':
        return <ImageAndUnitTools subToolId={activeSubTool.id} />;
      case 'finance':
      case 'randomizer':
        return <FinanceAndRandomTools subToolId={activeSubTool.id} />;
      case 'health':
      case 'development':
      case 'colors':
        return <HealthDevColorTools subToolId={activeSubTool.id} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      {/* Category Header + Sub-tabs */}
      <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: category.accentHex }}
              />
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {category.name}
              </h1>
            </div>
            <p className="text-sm text-slate-600">{category.subtitle}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => togglePinTool(activeSubTool.id)}
              className={`h-10 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 whitespace-nowrap ${
                isPinned
                  ? 'bg-[#007AFF] text-white shadow-sm shadow-[#007AFF]/20'
                  : 'bg-white/80 hover:bg-white border border-white text-slate-800'
              }`}
            >
              {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              <span>{isPinned ? 'Pinned to Home' : 'Pin Tool'}</span>
            </button>

            <button
              type="button"
              onClick={() => toggleFavoriteCategory(category.id)}
              className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-all active:scale-95 ${
                isFavCat
                  ? 'bg-rose-50 border-rose-200 text-rose-500'
                  : 'bg-white/80 hover:bg-white border-white text-slate-500'
              }`}
              aria-label={isFavCat ? 'Remove favorite category' : 'Favorite category'}
            >
              <Heart className={`w-4 h-4 ${isFavCat ? 'fill-rose-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Sub-Tabs Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {category.subTools.map((sub) => {
            const active = sub.id === activeSubTool.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setSelectedSubId(sub.id);
                  autoScrollToElement(toolPanelRef);
                }}
                className={`relative h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  active ? 'text-slate-950' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId={`subtab-${category.id}`}
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-white shadow-xs border border-white"
                  />
                )}
                <span className="relative z-10">{sub.shortName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Sub-Tool Surface */}
      <motion.div
        ref={toolPanelRef}
        key={activeSubTool.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel rounded-3xl p-5 sm:p-7 space-y-5"
      >
        <div className="border-b border-slate-200/70 pb-4">
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">{activeSubTool.name}</h2>
          <p className="text-sm text-slate-600 mt-0.5">{activeSubTool.description}</p>
        </div>

        {renderToolBody()}
      </motion.div>
    </div>
  );
};
