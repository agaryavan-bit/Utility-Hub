export type ScrollTarget =
  | HTMLElement
  | { current: HTMLElement | null }
  | null
  | undefined;

/**
 * Smoothly scrolls an element (or React ref) into the readable viewport
 * (accounting for the sticky TopGlassBar and bottom FloatingGlassDock)
 * whenever it sits below or outside the current visible area.
 */
export function autoScrollToElement(
  target: ScrollTarget,
  options?: { force?: boolean; offsetTop?: number; align?: 'auto' | 'top' | 'bottom' }
) {
  if (!target || typeof window === 'undefined') return;

  const prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = prefersReduced ? 'auto' : 'smooth';

  const topSafeMargin = options?.offsetTop ?? 88; // sticky top glass bar height + gap
  const bottomSafeMargin = 108; // floating bottom glass dock height + gap
  const align = options?.align ?? 'auto';

  // Wait two animation frames so React commits newly mounted/animated DOM nodes
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = 'current' in target ? target.current : target;
      if (!el || !el.isConnected) return;

      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const visibleTop = topSafeMargin;
      const visibleBottom = viewportHeight - bottomSafeMargin;
      const visibleHeight = Math.max(120, visibleBottom - visibleTop);

      const isAboveView = rect.top < visibleTop;
      const isBelowView = rect.bottom > visibleBottom;

      if (!options?.force && !isAboveView && !isBelowView) {
        return;
      }

      let targetY: number;
      if (align === 'bottom') {
        targetY = window.scrollY + (rect.bottom - visibleBottom);
      } else if (align === 'top' || isAboveView || rect.height > visibleHeight || rect.top > visibleBottom - 72) {
        targetY = window.scrollY + rect.top - visibleTop;
      } else {
        // Element starts in view and fits in viewport, just scroll down enough to clear the dock
        targetY = window.scrollY + (rect.bottom - visibleBottom);
      }

      window.scrollTo({ top: Math.max(0, targetY), behavior });
    });
  });
}

export function autoScrollToTop() {
  if (typeof window === 'undefined') return;
  const prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (window.scrollY > 12) {
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
  }
}
