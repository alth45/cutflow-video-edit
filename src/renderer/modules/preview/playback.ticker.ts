import * as actions from "@state/actions";
import { appStore } from "@state/appStore";

/* ============================================================
   PLAYBACK TICKER
   ------------------------------------------------------------
   RAF-based loop yang meng-advance `playback.currentTimeSec`
   berdasarkan wall clock. Start/stop idempotent.

   Behavior:
   - Loop otomatis berhenti kalau `state.playback.playing = false`.
   - Auto-pause saat mencapai akhir sequence (`next >= duration`).
   - Tidak pakai `setInterval` — RAF tersinkron dengan display
     refresh & throttled saat window tidak visible (hemat CPU).

   Wall-clock trust: `dt` = selisih `performance.now()` antar
   frame. Kalau tab sempat di-throttle (minimize), saat resume
   `dt` bisa besar → playhead "melompat". Ini sengaja: playback
   mengikuti waktu nyata, bukan frame counter.
   ============================================================ */

export interface PlaybackTicker {
  start(): void;
  stop(): void;
}

export function createPlaybackTicker(): PlaybackTicker {
  let rafId: number | null = null;
  let lastTs = 0;

  function tick(ts: number): void {
    rafId = null;

    const state = appStore.getState();
    if (!state.playback.playing) return;

    const dt = (ts - lastTs) / 1000;
    lastTs = ts;

    const duration = state.project.sequence.durationSec;
    const next = state.playback.currentTimeSec + dt;

    if (next >= duration) {
      actions.setCurrentTime(duration);
      actions.setPlaying(false);
      return;
    }

    actions.setCurrentTime(next);
    rafId = requestAnimationFrame(tick);
  }

  return {
    start(): void {
      if (rafId !== null) return;
      lastTs = performance.now();
      rafId = requestAnimationFrame(tick);
    },
    stop(): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
