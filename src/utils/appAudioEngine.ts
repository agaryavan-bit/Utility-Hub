/**
 * Unified Web Audio engine for Tooly:
 * 1. Continuous soft ambient background song while the app is open and visible.
 * 2. Immediately stops/suspends the song when a reminder is ringing, when the app
 *    is sent to the background (visibility hidden / freeze / pagehide), or when closed.
 * 3. Melodic task-start alarm chime that pauses the background song while ringing
 *    and seamlessly resumes it once dismissed/completed/snoozed.
 */

type AudioStateListener = () => void;

class AppAudioEngine {
  private ctx: AudioContext | null = null;
  private songMasterGain: GainNode | null = null;
  private songDelayNode: DelayNode | null = null;
  private songFilterNode: BiquadFilterNode | null = null;
  private alarmMasterGain: GainNode | null = null;

  private activeSongOscillators = new Set<OscillatorNode>();
  private songActive = false;
  private songLoopTimer: number | null = null;
  private songStepIndex = 0;

  private alarmRinging = false;
  private alarmLoopTimer: number | null = null;
  private alarmAutoStopTimer: number | null = null;

  private backgrounded = false;
  private closed = false;
  private listeners = new Set<AudioStateListener>();

  // Gentle 8-bar progression (Cmaj9 -> Am9 -> Fmaj9 -> G6 -> Em7 -> Am9 -> Dm9 -> G13sus4)
  private readonly chords: number[][] = [
    [261.63, 329.63, 392.0, 493.88, 587.33],
    [220.0, 261.63, 329.63, 392.0, 493.88],
    [174.61, 220.0, 261.63, 329.63, 392.0],
    [196.0, 246.94, 293.66, 329.63, 440.0],
    [164.81, 246.94, 293.66, 329.63, 493.88],
    [220.0, 261.63, 329.63, 392.0, 493.88],
    [146.83, 220.0, 261.63, 329.63, 349.23],
    [196.0, 261.63, 293.66, 329.63, 440.0],
  ];

  // Delicate pentatonic felt-piano melody notes per chord bar
  private readonly melodyBars: (number | null)[][] = [
    [523.25, null, 587.33, 659.25, null, 783.99, 659.25, null],
    [659.25, null, 523.25, 493.88, null, 587.33, 523.25, null],
    [440.0, null, 523.25, 659.25, null, 587.33, 523.25, null],
    [587.33, null, 493.88, 440.0, null, 392.0, null, null],
    [587.33, null, 659.25, 783.99, null, 659.25, 587.33, null],
    [523.25, null, 493.88, 440.0, null, 523.25, 659.25, null],
    [587.33, null, 523.25, 440.0, null, 523.25, null, null],
    [493.88, null, 440.0, 392.0, null, 440.0, 523.25, null],
  ];

  private isDocumentHidden(): boolean {
    if (typeof document === 'undefined') return false;
    return document.hidden || document.visibilityState !== 'visible';
  }

  private ensureContext(): AudioContext | null {
    if (this.closed || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      // Soft ambient song bus: Low-pass warmth + gentle stereo echo
      this.songMasterGain = this.ctx.createGain();
      this.songMasterGain.gain.value = 0.0001;

      this.songFilterNode = this.ctx.createBiquadFilter();
      this.songFilterNode.type = 'lowpass';
      this.songFilterNode.frequency.value = 1350;
      this.songFilterNode.Q.value = 0.6;

      this.songDelayNode = this.ctx.createDelay(1.0);
      this.songDelayNode.delayTime.value = 0.42;
      const delayFeedback = this.ctx.createGain();
      delayFeedback.gain.value = 0.24;
      const delayWet = this.ctx.createGain();
      delayWet.gain.value = 0.28;

      this.songFilterNode.connect(this.songMasterGain);
      this.songFilterNode.connect(this.songDelayNode);
      this.songDelayNode.connect(delayFeedback);
      delayFeedback.connect(this.songDelayNode);
      this.songDelayNode.connect(delayWet);
      delayWet.connect(this.songMasterGain);

      this.songMasterGain.connect(this.ctx.destination);

      // Clear task-alarm bus
      this.alarmMasterGain = this.ctx.createGain();
      this.alarmMasterGain.gain.value = 0.34;
      this.alarmMasterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private trackSongOscillator(osc: OscillatorNode): void {
    this.activeSongOscillators.add(osc);
    osc.onended = () => {
      this.activeSongOscillators.delete(osc);
    };
  }

  private stopAllSongOscillatorsNow(): void {
    this.activeSongOscillators.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      try {
        osc.disconnect();
      } catch {
        // ignore
      }
    });
    this.activeSongOscillators.clear();
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  public subscribe(listener: AudioStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public isSongPlaying(): boolean {
    return (
      this.songActive &&
      !this.alarmRinging &&
      !this.backgrounded &&
      !this.isDocumentHidden() &&
      this.ctx?.state === 'running'
    );
  }

  public isAlarmActive(): boolean {
    return this.alarmRinging;
  }

  /**
   * Unlocks Web Audio and ensures the soft background song plays smoothly
   * whenever the app is visible and no reminder alarm is ringing.
   */
  public unlockAndStartSong(): void {
    if (this.closed || this.backgrounded || this.isDocumentHidden()) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const resumeAndRun = () => {
      if (this.closed || this.backgrounded || this.isDocumentHidden()) return;
      if (!this.alarmRinging) {
        this.startSongInternal();
      }
      this.notify();
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(resumeAndRun).catch(() => {});
    } else {
      resumeAndRun();
    }
  }

  /**
   * Immediately halts the soft song and suspends Web Audio whenever the app is closed,
   * minimized, switched away from, or sent to the background.
   */
  public pauseSongForBackground(): void {
    this.backgrounded = true;
    this.songActive = false;

    if (this.songLoopTimer !== null) {
      window.clearInterval(this.songLoopTimer);
      this.songLoopTimer = null;
    }

    this.stopAllSongOscillatorsNow();

    if (this.ctx && this.songMasterGain) {
      const now = this.ctx.currentTime;
      this.songMasterGain.gain.cancelScheduledValues(now);
      this.songMasterGain.gain.setValueAtTime(0.0001, now);

      // Suspend AudioContext immediately so zero music plays while running in the background
      // (unless an alarm chime is actively ringing right now)
      if (!this.alarmRinging && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    }
    this.notify();
  }

  /**
   * Resumes the soft song smoothly when the user returns to the open app.
   */
  public resumeFromBackground(): void {
    if (this.closed || this.isDocumentHidden()) return;
    this.backgrounded = false;
    if (!this.alarmRinging) {
      this.unlockAndStartSong();
    }
    this.notify();
  }

  private startSongInternal(): void {
    if (this.closed || this.alarmRinging || this.backgrounded || this.isDocumentHidden()) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.songMasterGain || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    this.songMasterGain.gain.cancelScheduledValues(now);
    this.songMasterGain.gain.setValueAtTime(
      Math.max(0.0001, this.songMasterGain.gain.value),
      now
    );
    this.songMasterGain.gain.linearRampToValueAtTime(0.14, now + 1.0);

    if (this.songActive && this.songLoopTimer !== null) return;
    this.songActive = true;

    const playStep = () => {
      if (
        !this.songActive ||
        this.alarmRinging ||
        this.backgrounded ||
        this.closed ||
        this.isDocumentHidden()
      ) {
        if (this.isDocumentHidden()) {
          this.pauseSongForBackground();
        }
        return;
      }
      if (!this.ctx || this.ctx.state !== 'running' || !this.songFilterNode) return;

      const barIndex = Math.floor(this.songStepIndex / 8) % this.chords.length;
      const beatInBar = this.songStepIndex % 8;
      const t = this.ctx.currentTime + 0.03;

      if (beatInBar === 0) {
        this.scheduleWarmChord(this.chords[barIndex], t, 3.7);
      }

      if (beatInBar === 4) {
        this.scheduleSoftTone(this.chords[barIndex][0] * 0.5, t, 1.9, 0.085, 'sine');
      }

      const melodyFreq = this.melodyBars[barIndex][beatInBar];
      if (melodyFreq) {
        this.scheduleFeltPianoNote(melodyFreq, t, 1.55, 0.11);
      }

      this.songStepIndex = (this.songStepIndex + 1) % (this.chords.length * 8);
    };

    playStep();
    this.songLoopTimer = window.setInterval(playStep, 460);
    this.notify();
  }

  private pauseSongForAlarmInternal(): void {
    this.songActive = false;
    if (this.songLoopTimer !== null) {
      window.clearInterval(this.songLoopTimer);
      this.songLoopTimer = null;
    }
    this.stopAllSongOscillatorsNow();
    if (this.ctx && this.songMasterGain && this.ctx.state === 'running') {
      const now = this.ctx.currentTime;
      this.songMasterGain.gain.cancelScheduledValues(now);
      this.songMasterGain.gain.setValueAtTime(
        Math.max(0.0001, this.songMasterGain.gain.value),
        now
      );
      this.songMasterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    }
    this.notify();
  }

  private scheduleWarmChord(freqs: number[], startTime: number, duration: number): void {
    if (!this.ctx || !this.songFilterNode) return;
    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(0.0001, startTime);
    chordGain.gain.linearRampToValueAtTime(0.055, startTime + 0.85);
    chordGain.gain.setValueAtTime(0.05, startTime + duration - 1.0);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    chordGain.connect(this.songFilterNode);

    freqs.slice(0, 4).forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.detune.setValueAtTime((idx - 1.5) * 4, startTime);
      osc.connect(chordGain);
      this.trackSongOscillator(osc);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });
  }

  private scheduleSoftTone(
    freq: number,
    startTime: number,
    duration: number,
    peakGain: number,
    type: OscillatorType
  ): void {
    if (!this.ctx || !this.songFilterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.songFilterNode);
    this.trackSongOscillator(osc);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.04);
  }

  private scheduleFeltPianoNote(
    freq: number,
    startTime: number,
    duration: number,
    peakGain: number
  ): void {
    if (!this.ctx || !this.songFilterNode) return;
    const fundamental = this.ctx.createOscillator();
    const overtone = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    const overtoneGain = this.ctx.createGain();

    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(freq, startTime);

    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 2, startTime);
    overtoneGain.gain.value = 0.14;

    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.025);
    env.gain.exponentialRampToValueAtTime(peakGain * 0.35, startTime + 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    fundamental.connect(env);
    overtone.connect(overtoneGain);
    overtoneGain.connect(env);
    env.connect(this.songFilterNode);

    this.trackSongOscillator(fundamental);
    this.trackSongOscillator(overtone);
    fundamental.start(startTime);
    overtone.start(startTime);
    fundamental.stop(startTime + duration + 0.04);
    overtone.stop(startTime + duration + 0.04);
  }

  private playAlarmChimePhrase(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.alarmMasterGain) return;

    const triggerNotes = () => {
      if (!this.ctx || !this.alarmMasterGain) return;
      const base = this.ctx.currentTime + 0.02;
      const notes = [
        { freq: 523.25, offset: 0.0, dur: 0.45 },
        { freq: 659.25, offset: 0.16, dur: 0.45 },
        { freq: 783.99, offset: 0.32, dur: 0.5 },
        { freq: 1046.5, offset: 0.48, dur: 0.85 },
      ];

      notes.forEach(({ freq, offset, dur }) => {
        if (!this.ctx || !this.alarmMasterGain) return;
        const start = base + offset;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const g1 = this.ctx.createGain();
        const g2 = this.ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, start);
        g1.gain.setValueAtTime(0.0001, start);
        g1.gain.linearRampToValueAtTime(0.55, start + 0.015);
        g1.gain.exponentialRampToValueAtTime(0.0001, start + dur);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 2, start);
        g2.gain.setValueAtTime(0.0001, start);
        g2.gain.linearRampToValueAtTime(0.16, start + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.0001, start + dur * 0.65);

        osc1.connect(g1);
        osc2.connect(g2);
        g1.connect(this.alarmMasterGain);
        g2.connect(this.alarmMasterGain);

        osc1.start(start);
        osc2.start(start);
        osc1.stop(start + dur + 0.05);
        osc2.stop(start + dur + 0.05);
      });
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(triggerNotes).catch(() => {});
    } else {
      triggerNotes();
    }
  }

  public startReminderAlarm(onAutoStop?: () => void): void {
    if (this.closed) return;
    this.alarmRinging = true;
    this.pauseSongForAlarmInternal();

    if (this.alarmLoopTimer !== null) {
      window.clearInterval(this.alarmLoopTimer);
      this.alarmLoopTimer = null;
    }
    if (this.alarmAutoStopTimer !== null) {
      window.clearTimeout(this.alarmAutoStopTimer);
      this.alarmAutoStopTimer = null;
    }

    this.playAlarmChimePhrase();
    this.alarmLoopTimer = window.setInterval(() => {
      if (this.alarmRinging && !this.closed) {
        this.playAlarmChimePhrase();
      }
    }, 2200);

    this.alarmAutoStopTimer = window.setTimeout(() => {
      this.stopReminderAlarm();
      onAutoStop?.();
    }, 60_000);

    this.notify();
  }

  public stopReminderAlarm(): void {
    this.alarmRinging = false;
    if (this.alarmLoopTimer !== null) {
      window.clearInterval(this.alarmLoopTimer);
      this.alarmLoopTimer = null;
    }
    if (this.alarmAutoStopTimer !== null) {
      window.clearTimeout(this.alarmAutoStopTimer);
      this.alarmAutoStopTimer = null;
    }

    if (this.backgrounded || this.isDocumentHidden()) {
      // App is closed/backgrounded — keep audio suspended instead of restarting song
      if (this.ctx && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else if (!this.closed) {
      this.unlockAndStartSong();
    }
    this.notify();
  }

  public previewAlarmChime(): void {
    if (this.closed) return;
    if (this.alarmRinging) {
      this.playAlarmChimePhrase();
      return;
    }
    const wasPlaying = this.songActive;
    if (wasPlaying) {
      this.pauseSongForAlarmInternal();
    }
    this.playAlarmChimePhrase();
    if (wasPlaying) {
      window.setTimeout(() => {
        if (!this.alarmRinging && !this.closed && !this.backgrounded && !this.isDocumentHidden()) {
          this.startSongInternal();
        }
      }, 1450);
    }
  }

  public stopAllOnClose(): void {
    this.closed = true;
    this.backgrounded = true;
    this.songActive = false;
    this.alarmRinging = false;

    if (this.songLoopTimer !== null) {
      window.clearInterval(this.songLoopTimer);
      this.songLoopTimer = null;
    }
    if (this.alarmLoopTimer !== null) {
      window.clearInterval(this.alarmLoopTimer);
      this.alarmLoopTimer = null;
    }
    if (this.alarmAutoStopTimer !== null) {
      window.clearTimeout(this.alarmAutoStopTimer);
      this.alarmAutoStopTimer = null;
    }
    this.stopAllSongOscillatorsNow();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.songMasterGain = null;
      this.songDelayNode = null;
      this.songFilterNode = null;
      this.alarmMasterGain = null;
    }
  }
}

export const appAudioEngine = new AppAudioEngine();
