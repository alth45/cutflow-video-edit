/* ============================================================
   AUDIO ENGINE (F14ab)
   ------------------------------------------------------------
   Singleton Web Audio wrapper. Route HTMLMediaElement audio via:
   source → gain (volume+boost+fade) → panner (L/R) → destination.

   - Lazy AudioContext (created on first attach). Auto-resume
     saat user gesture (play button).
   - `setParams()` dipanggil per update (frame tick) — cheap
     property set, tidak bikin node.
   - Graceful fallback: kalau attach gagal, caller pakai
     element.volume/muted.
   ============================================================ */

export interface AudioParams {
  readonly volume: number; // 0..100
  readonly boostDb: number; // 0..12
  readonly pan: number; // -100..100
  readonly muted: boolean;
  readonly fadeMultiplier: number; // 0..1
}

interface Chain {
  readonly source: MediaElementAudioSourceNode;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private chains = new Map<HTMLMediaElement, Chain>();

  ensureRunning(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[audio-engine] AudioContext creation failed:", err);
        return;
      }
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {
        /* gesture required */
      });
    }
  }

  /**
   * Route element melalui Web Audio graph. Return true kalau
   * berhasil. Aman dipanggil berkali-kali untuk element yang sama.
   */
  attach(element: HTMLMediaElement): boolean {
    if (this.chains.has(element)) return true;
    try {
      this.ensureRunning();
      if (!this.ctx) return false;

      const source = this.ctx.createMediaElementSource(element);
      const gain = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner();

      source.connect(gain);
      gain.connect(panner);
      panner.connect(this.ctx.destination);

      this.chains.set(element, { source, gain, panner });
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[audio-engine] attach failed:", err);
      return false;
    }
  }

  detach(element: HTMLMediaElement): void {
    const chain = this.chains.get(element);
    if (!chain) return;
    try {
      chain.source.disconnect();
      chain.gain.disconnect();
      chain.panner.disconnect();
    } catch {
      /* already disconnected */
    }
    this.chains.delete(element);
  }

  setParams(element: HTMLMediaElement, params: AudioParams): void {
    const chain = this.chains.get(element);
    if (!chain) return;

    if (params.muted || params.fadeMultiplier <= 0) {
      chain.gain.gain.value = 0;
    } else {
      const base = (params.volume / 100) * params.fadeMultiplier;
      const boost = Math.pow(10, params.boostDb / 20);
      chain.gain.gain.value = Math.max(0, Math.min(4, base * boost));
    }

    chain.panner.pan.value = Math.max(-1, Math.min(1, params.pan / 100));
  }

  dispose(): void {
    for (const element of Array.from(this.chains.keys())) {
      this.detach(element);
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
