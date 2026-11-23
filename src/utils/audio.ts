import { AstraId } from '../types/world';
import { BRAHMASTRA_MANTRA_CONFIG } from '../engine/astraConfig';

// Procedural Web Audio API sound effects (zero external files)

interface AndroidNativeBridge {
  vibrate?: (durationMs: number, amplitude: number) => void;
  setGameMode?: (mode: string) => void;
  keepScreenAwake?: (enabled: boolean) => void;
  isNativeAndroid?: () => boolean;
}

export function pulseAndroidHaptic(durationMs: number, amplitude: number): void {
  if (typeof window === 'undefined') return;
  try {
    const bridge = (window as unknown as { AndroidBridge?: AndroidNativeBridge }).AndroidBridge;
    bridge?.vibrate?.(durationMs, amplitude);
  } catch {
    // Ignore when running outside native Android WebView
  }
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private muted: boolean = false;
  private ducked: boolean = false;
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('astras_muted');
      this.muted = saved === 'true';
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.ducked ? 0.22 : 1.0;
        this.sfxGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getOutputNode(ctx: AudioContext, bypassDuck = false): AudioNode {
    if (bypassDuck || !this.sfxGain) return ctx.destination;
    return this.sfxGain;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = ctx.sampleRate * 1.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('astras_muted', String(this.muted));
      if (this.muted && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore speech cancellation error
        }
      }
    }
    return this.muted;
  }

  public setAmbienceDuck(ducked: boolean): void {
    this.ducked = ducked;
    if (this.ctx && this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(ducked ? 0.22 : 1.0, this.ctx.currentTime, 0.14);
    }
  }

  public playBowShot(): void {
    pulseAndroidHaptic(16, 90);
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.11);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.getOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playAstraBlast(): void {
    pulseAndroidHaptic(65, 220);
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(220, now);
    osc1.frequency.exponentialRampToValueAtTime(60, now + 0.32);
    osc2.frequency.setValueAtTime(660, now);
    osc2.frequency.exponentialRampToValueAtTime(110, now + 0.32);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.getOutputNode(ctx));
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  }

  public playHit(): void {
    pulseAndroidHaptic(28, 165);
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.09);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.getOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playMountChariot(): void {
    pulseAndroidHaptic(24, 120);
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.14);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.getOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playMissionChime(): void {
    pulseAndroidHaptic(45, 150);
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [330, 440, 660];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.07);
      gain.gain.setValueAtTime(0.06, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.07 + 0.65);
      osc.connect(gain);
      gain.connect(this.getOutputNode(ctx));
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.68);
    });
  }

  public playWheelTick(): void {
    pulseAndroidHaptic(12, 75);
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(840, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.035);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.getOutputNode(ctx, true));
    osc.start(now);
    osc.stop(now + 0.045);
  }

  public playAstraCollect(): void {
    pulseAndroidHaptic(75, 200);
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [293.66, 392.0, 493.88, 587.33, 783.99];
    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      const t0 = now + idx * 0.075;
      osc.frequency.setValueAtTime(f, t0);
      gain.gain.setValueAtTime(0.075, t0);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.95);
      osc.connect(gain);
      gain.connect(this.getOutputNode(ctx, true));
      osc.start(t0);
      osc.stop(t0 + 1.0);
    });
  }

  public playAstraRelease(astraId: AstraId): void {
    pulseAndroidHaptic(astraId === 'BRAHMASTRA' ? 95 : 42, 210);
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const out = this.getOutputNode(ctx, astraId === 'BRAHMASTRA');

    if (astraId === 'AGNEYASTRA') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.25);
    } else if (astraId === 'VARUNASTRA') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.26);
    } else if (astraId === 'VAYAVYASTRA') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.24);
    } else if (astraId === 'NAGASTRA') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.28);
    } else {
      // Brahmastra divine release roar
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.72);
    }
    const dur = astraId === 'BRAHMASTRA' ? 0.75 : 0.28;
    gain.gain.setValueAtTime(astraId === 'BRAHMASTRA' ? 0.14 : 0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  public playAstraImpact(astraId: AstraId): void {
    pulseAndroidHaptic(astraId === 'BRAHMASTRA' ? 140 : 60, 240);
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const out = this.getOutputNode(ctx, astraId === 'BRAHMASTRA');

    // Filtered noise burst for fire roar, ocean splash, tornado gust, or earth-shattering boom
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (astraId === 'AGNEYASTRA') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + 0.55);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      src.start(now);
      src.stop(now + 0.6);
    } else if (astraId === 'VARUNASTRA') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(260, now + 0.65);
      filter.Q.value = 1.4;
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      src.start(now);
      src.stop(now + 0.7);
    } else if (astraId === 'VAYAVYASTRA') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.linearRampToValueAtTime(1150, now + 0.45);
      filter.frequency.exponentialRampToValueAtTime(220, now + 1.25);
      filter.Q.value = 2.6;
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.28);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      src.start(now);
      src.stop(now + 1.3);
    } else if (astraId === 'NAGASTRA') {
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1800, now);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      src.start(now);
      src.stop(now + 0.44);
    } else {
      // Brahmastra massive ground explosion + earth rumble
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(850, now);
      filter.frequency.exponentialRampToValueAtTime(55, now + 1.45);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.48);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      src.start(now);
      src.stop(now + 1.5);

      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(110, now);
      subOsc.frequency.exponentialRampToValueAtTime(28, now + 1.1);
      subGain.gain.setValueAtTime(0.24, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
      subOsc.connect(subGain);
      subGain.connect(out);
      subOsc.start(now);
      subOsc.stop(now + 1.18);
    }
  }

  public playCycloneWind(durationSec = 2.6): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const out = this.getOutputNode(ctx, true);

    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.2;
    filter.frequency.setValueAtTime(180, now);
    filter.frequency.exponentialRampToValueAtTime(640, now + durationSec * 0.65);
    filter.frequency.exponentialRampToValueAtTime(210, now + durationSec);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.002, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + durationSec + 0.05);
  }

  public playThunderClap(intensity = 1.0): void {
    pulseAndroidHaptic(Math.round(110 * intensity), 255);
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const out = this.getOutputNode(ctx, true);

    // Sharp lightning crack followed by deep rolling "dhadam" boom
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, now);
    lp.frequency.exponentialRampToValueAtTime(85, now + 1.35);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32 * intensity, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
    src.connect(lp);
    lp.connect(g);
    g.connect(out);
    src.start(now);
    src.stop(now + 1.48);

    const boom = ctx.createOscillator();
    const bg = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(135, now);
    boom.frequency.exponentialRampToValueAtTime(32, now + 0.85);
    bg.gain.setValueAtTime(0.28 * intensity, now);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    boom.connect(bg);
    bg.connect(out);
    boom.start(now);
    boom.stop(now + 0.92);
  }

  /**
   * Speaks the sacred Brahmastra Mantra in a deep young warrior-prince voice
   * (uses optional customAudioUrl if configured -> Web Speech API -> deep Vedic drone fallback).
   */
  public playBrahmaMantraChant(): void {
    if (this.muted || typeof window === 'undefined') return;

    // Deep atmospheric Vedic Om drone underneath the chant
    const ctx = this.getContext();
    if (ctx) {
      const now = ctx.currentTime;
      const out = this.getOutputNode(ctx, true);
      const freqs = [110, 165, 220];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(idx === 0 ? 0.08 : 0.035, now + 0.45);
        g.gain.exponentialRampToValueAtTime(0.001, now + 3.6);
        osc.connect(g);
        g.connect(out);
        osc.start(now);
        osc.stop(now + 3.65);
      });
    }

    // Optional pre-recorded MP3/WAV chant if provided in astraConfig.ts
    if (BRAHMASTRA_MANTRA_CONFIG.customAudioUrl) {
      try {
        const audio = new Audio(BRAHMASTRA_MANTRA_CONFIG.customAudioUrl);
        audio.volume = BRAHMASTRA_MANTRA_CONFIG.volume;
        void audio.play().catch(() => {
          this.speakMantraViaSpeechApi();
        });
        return;
      } catch {
        // Fall through to Web Speech API
      }
    }

    this.speakMantraViaSpeechApi();
  }

  private speakMantraViaSpeechApi(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(BRAHMASTRA_MANTRA_CONFIG.mantraText);
      utter.lang = BRAHMASTRA_MANTRA_CONFIG.lang;
      utter.pitch = BRAHMASTRA_MANTRA_CONFIG.pitch;
      utter.rate = BRAHMASTRA_MANTRA_CONFIG.rate;
      utter.volume = BRAHMASTRA_MANTRA_CONFIG.volume;

      const voices = synth.getVoices();
      if (voices && voices.length > 0) {
        const preferred =
          voices.find(
            (v) =>
              (/en-IN|hi-IN/i.test(v.lang) && /male|rishi|hemant|prabhat|madhur/i.test(v.name)) ||
              /en-IN|hi-IN/i.test(v.lang)
          ) ||
          voices.find((v) => /male|daniel|david|alex/i.test(v.name)) ||
          voices[0];
        if (preferred) utter.voice = preferred;
      }
      synth.speak(utter);
    } catch {
      // Deep Vedic drone already plays if SpeechSynthesis is blocked
    }
  }
}

export const soundEngine = new SoundEngine();

