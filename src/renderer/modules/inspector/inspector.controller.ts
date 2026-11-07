import { on, delegate } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { getClipById } from "@state/selectors";
import type { InspectorPanelTab } from "@shared/types/state";
import type { Clip, KeyframeableTransformKey } from "@shared/types/timeline";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_AUDIO,
} from "@shared/types/timeline";
import { sliderPercent } from "./inspector.logic";
import type { InspectorView } from "./inspector.view";

/* ============================================================
   HELPERS
   ============================================================ */

/** Resolve active clip from current store state (or null). */
function getActiveClipFromStore(): Clip | null {
  const state = appStore.getState();
  const activeId = state.selection.selectedClipIds[0];
  if (!activeId) return null;
  return getClipById(state, activeId) ?? null;
}

/** Playhead position relative to clip start, clamped to [0, clipDur]. */
function getPlayheadLocalTime(clip: Clip): number {
  const playheadSec = appStore.getState().playback.currentTimeSec;
  return Math.max(0, Math.min(clip.durationSec, playheadSec - clip.startSec));
}

/* ============================================================
   INSPECTOR CONTROLLER
   ============================================================ */

export function attachInspectorController(view: InspectorView): () => void {
  const cleanups: Array<() => void> = [];

  /* ---- Tab buttons ---- */
  cleanups.push(
    delegate(view.root, "click", ".tab[data-tab]", (_ev, tab) => {
      const tabId = (tab as HTMLElement).dataset["tab"] as
        | InspectorPanelTab
        | undefined;
      if (tabId) actions.setInspectorTab(tabId);
    }),
  );

  /* ---- Group head toggle ---- */
  cleanups.push(
    delegate(view.root, "click", ".group-head", (_ev, head) => {
      const groupEl = (head as HTMLElement).closest<HTMLElement>(".group");
      const groupId = groupEl?.dataset["group"];
      if (groupId) actions.toggleInspectorGroup(groupId);
    }),
  );

  /* ---- Slider input (transform / color / audio) ---- */
  cleanups.push(
    on(view.root, "input", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "range")
        return;
      if (target.disabled) return;

      const ref = view.sliders.get(target);
      if (!ref) return;

      const value = Number(target.value);
      const min = Number(target.min);
      const max = Number(target.max);

      /* Local visual update (smooth — don't wait for subscriber). */
      target.style.setProperty("--val", `${sliderPercent(value, min, max)}%`);
      ref.valueEl.textContent = ref.def.format(value);

      /* Bind to clip property (dispatch to the right action). */
      const clip = getActiveClipFromStore();
      if (!clip) return;

      if (ref.def.transformKey && ref.def.keyframeKey) {
        actions.setClipTransformPropertySmart(
          clip.id,
          ref.def.keyframeKey,
          value,
          getPlayheadLocalTime(clip),
        );
      } else if (ref.def.transformKey) {
        actions.setClipTransformProperty(clip.id, ref.def.transformKey, value);
      } else if (ref.def.colorKey) {
        actions.setClipColorProperty(clip.id, ref.def.colorKey, value);
      } else if (ref.def.audioKey) {
        actions.setClipAudioProperty(clip.id, ref.def.audioKey, value);
      }
    }),
  );

  /* ---- Switch click (transform / audio / placeholder) ---- */
  cleanups.push(
    delegate(view.root, "click", ".switch", (ev, sw) => {
      ev.stopPropagation();
      const button = sw as HTMLButtonElement;
      if (button.disabled) return;

      const ref = view.switches.get(button);
      if (!ref) return;

      const clip = getActiveClipFromStore();
      if (!clip) return;

      if (ref.def.transformKey) {
        const current = (clip.transform ?? DEFAULT_CLIP_TRANSFORM)[
          ref.def.transformKey
        ];
        actions.setClipTransformProperty(
          clip.id,
          ref.def.transformKey,
          !current,
        );
        return;
      }

      if (ref.def.audioKey) {
        const current = (clip.audio ?? DEFAULT_CLIP_AUDIO)[ref.def.audioKey];
        actions.setClipAudioProperty(clip.id, ref.def.audioKey, !current);
        return;
      }

      /* Unbound (placeholder): local toggle only. */
      const isOn = button.classList.toggle("on");
      button.setAttribute("aria-pressed", String(isOn));
    }),
  );

  /* ---- Keyframe diamond button ---- */
  cleanups.push(
    delegate(view.root, "click", ".keyframe-btn", (ev, btn) => {
      ev.stopPropagation();
      const key = (btn as HTMLElement).dataset["keyframeKey"] as
        | KeyframeableTransformKey
        | undefined;
      if (!key) return;

      const clip = getActiveClipFromStore();
      if (!clip) return;

      actions.toggleTransformKeyframe(clip.id, key, getPlayheadLocalTime(clip));
    }),
  );

  return () => cleanups.forEach((fn) => fn());
}
