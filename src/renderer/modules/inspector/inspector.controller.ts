import { on, delegate } from "@core/Dom";
import * as actions from "@state/actions";
import { appStore } from "@state/appStore";
import { getClipById } from "@state/selectors";
import type { InspectorPanelTab } from "@shared/types/state";
import type {
  Clip,
  KeyframeableTransformKey,
  ClipChromaKey,
} from "@shared/types/timeline";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_CLIP_AUDIO,
  DEFAULT_CHROMA_KEY,
} from "@shared/types/timeline";
import { sliderPercent } from "./inspector.logic";
import type { InspectorView } from "./inspector.view";
import type { CurvePoint } from "@shared/types/timeline";
import { DEFAULT_CURVE } from "@shared/types/timeline";
import { ensureCurveFilter } from "@modules/preview/preview.curve";
import { curveToPath } from "@modules/effects/curve.logic";

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
      } else if (ref.def.chromaKey) {
        actions.setClipChromaKey(clip.id, ref.def.chromaKey, value);
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

      if (ref.def.chromaKey) {
        const clip = getActiveClipFromStore();
        if (!clip) return;
        const current = (clip.chromaKey ?? DEFAULT_CHROMA_KEY)[
          ref.def.chromaKey
        ];
        actions.setClipChromaKey(clip.id, ref.def.chromaKey, !current);
        return;
      }

      /* Unbound (placeholder): local toggle only. */
      const isOn = button.classList.toggle("on");
      button.setAttribute("aria-pressed", String(isOn));
    }),
  );

  /* ---- Segmented control (chroma key color) ---- */
  cleanups.push(
    delegate(
      view.root,
      "click",
      ".segmented-btn[data-chroma-key]",
      (ev, btn) => {
        ev.stopPropagation();
        const key = (btn as HTMLElement).dataset["chromaKey"] as
          | "keyColor"
          | undefined;
        const value = (btn as HTMLElement).dataset["value"];
        if (!key || !value) return;

        const clip = getActiveClipFromStore();
        if (!clip) return;

        actions.setClipChromaKey(
          clip.id,
          key,
          value as ClipChromaKey["keyColor"],
        );
      },
    ),
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

  /* ---- Curve editor (interactive) ---- */

  interface CurveDrag {
    readonly clipId: string;
    readonly box: HTMLElement;
    readonly index: number;
    points: CurvePoint[];
  }
  let curveDrag: CurveDrag | null = null;

  const updateCurveDom = (drag: CurveDrag): void => {
    const pathEl = drag.box.querySelector<SVGPathElement>(
      ".curve-path, .curve-svg path",
    );
    if (pathEl) pathEl.setAttribute("d", curveToPath(drag.points, 74));

    const pointsLayer = drag.box.querySelector<HTMLElement>(".curve-points");
    if (pointsLayer) {
      pointsLayer.replaceChildren();
      drag.points.forEach((p, i) => {
        const pt = document.createElement("div");
        pt.className = "curve-point";
        pt.dataset["index"] = String(i);
        pt.style.left = `${p.x}%`;
        pt.style.top = `${100 - p.y}%`;
        pt.title = `${Math.round(p.x)} → ${Math.round(p.y)}`;
        pointsLayer.appendChild(pt);
      });
    }

    /* Live preview — update filter imperatively. */
    ensureCurveFilter(drag.clipId, { points: drag.points });
  };

  const clamp = (v: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, v));

  const onCurveMouseDown = (ev: MouseEvent, box: HTMLElement): void => {
    if (ev.button !== 0) return;

    const state = appStore.getState();
    const activeClip = getActiveClipFromStore();
    if (!activeClip) return;

    /* Pause playback — avoids re-render loop mid-drag. */
    if (state.playback.playing) actions.setPlaying(false);

    const rect = box.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const target = ev.target as Element;
    const pointEl = target.closest<HTMLElement>(".curve-point");

    const points: CurvePoint[] = [
      ...(activeClip.color?.curve?.points ?? DEFAULT_CURVE.points),
    ];

    let dragIndex: number;

    if (pointEl) {
      dragIndex = Number(pointEl.dataset["index"]);
    } else {
      /* Add new point at click position. */
      const x = clamp(((ev.clientX - rect.left) / rect.width) * 100, 0, 100);
      const y = clamp(
        100 - ((ev.clientY - rect.top) / rect.height) * 100,
        0,
        100,
      );
      const newPt: CurvePoint = { x, y };
      points.push(newPt);
      points.sort((a, b) => a.x - b.x);
      dragIndex = points.indexOf(newPt);
    }

    curveDrag = {
      clipId: activeClip.id,
      box,
      index: dragIndex,
      points: [...points],
    };

    document.addEventListener("mousemove", onCurveMouseMove);
    document.addEventListener("mouseup", onCurveMouseUp);
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onCurveMouseMove = (ev: MouseEvent): void => {
    if (!curveDrag) return;

    const rect = curveDrag.box.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const rawX = ((ev.clientX - rect.left) / rect.width) * 100;
    const rawY = 100 - ((ev.clientY - rect.top) / rect.height) * 100;

    const idx = curveDrag.index;
    const pts = curveDrag.points;
    const isFirst = idx === 0;
    const isLast = idx === pts.length - 1;

    if (isFirst) {
      pts[idx] = { x: 0, y: clamp(rawY, 0, 100) };
    } else if (isLast) {
      pts[idx] = { x: 100, y: clamp(rawY, 0, 100) };
    } else {
      const minX = pts[idx - 1]!.x + 1;
      const maxX = pts[idx + 1]!.x - 1;
      pts[idx] = { x: clamp(rawX, minX, maxX), y: clamp(rawY, 0, 100) };
    }

    updateCurveDom(curveDrag);
  };

  const onCurveMouseUp = (): void => {
    if (!curveDrag) return;
    const { clipId, points } = curveDrag;

    document.removeEventListener("mousemove", onCurveMouseMove);
    document.removeEventListener("mouseup", onCurveMouseUp);
    curveDrag = null;

    actions.setClipCurve(clipId, points);
  };

  cleanups.push(
    delegate(view.root, "mousedown", ".curve-box", (ev, boxEl) => {
      onCurveMouseDown(ev, boxEl as HTMLElement);
    }),
  );

  cleanups.push(
    delegate(view.root, "dblclick", ".curve-point", (ev, pointEl) => {
      ev.stopPropagation();
      const idx = Number((pointEl as HTMLElement).dataset["index"]);
      const clip = getActiveClipFromStore();
      if (!clip) return;

      const points = [...(clip.color?.curve?.points ?? DEFAULT_CURVE.points)];
      if (idx === 0 || idx === points.length - 1) return; /* endpoints locked */
      points.splice(idx, 1);
      actions.setClipCurve(clip.id, points);
    }),
  );

  cleanups.push(() => {
    document.removeEventListener("mousemove", onCurveMouseMove);
    document.removeEventListener("mouseup", onCurveMouseUp);
  });

  return () => cleanups.forEach((fn) => fn());
}
