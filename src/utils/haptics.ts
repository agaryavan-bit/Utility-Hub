export type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

let audioCtx: AudioContext | null = null;
let hapticsEnabled = true;
let soundEnabled = true;

export function configureHaptics(opts: { haptics: boolean; sound: boolean }) {
  hapticsEnabled = opts.haptics;
  soundEnabled = opts.sound;
}

function playTactileTick(style: HapticStyle) {
  if (!soundEnabled || typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (style === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.055);
      gain.gain.setValueAtTime(0.032, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
      osc.start(now);
      osc.stop(now + 0.09);
      return;
    }

    if (style === 'warning' || style === 'error') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(style === 'error' ? 210 : 320, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.07);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.085);
      return;
    }

    const freqMap: Record<'light' | 'medium' | 'heavy' | 'selection', number> = {
      selection: 860,
      light: 720,
      medium: 520,
      heavy: 340,
    };
    const volMap: Record<'light' | 'medium' | 'heavy' | 'selection', number> = {
      selection: 0.014,
      light: 0.018,
      medium: 0.026,
      heavy: 0.034,
    };

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqMap[style], now);
    osc.frequency.exponentialRampToValueAtTime(freqMap[style] * 0.52, now + 0.028);
    gain.gain.setValueAtTime(volMap[style], now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
    osc.start(now);
    osc.stop(now + 0.035);
  } catch {
    // Gracefully ignore audio errors when autoplay is blocked
  }
}

export function triggerHaptic(style: HapticStyle = 'light') {
  if (!hapticsEnabled) return;

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    const patternMap: Record<HapticStyle, number | number[]> = {
      selection: 5,
      light: 9,
      medium: 16,
      heavy: 26,
      success: [10, 28, 14],
      warning: [18, 35, 18],
      error: [25, 35, 25, 35, 20],
    };
    try {
      navigator.vibrate(patternMap[style]);
    } catch {
      // Ignore unsupported environments
    }
  }

  playTactileTick(style);
}
