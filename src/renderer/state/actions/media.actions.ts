import { appStore } from "@state/appStore";
import type { MediaAsset } from "@shared/types/project";
import { withProject, withAutoAdjust } from "./helpers";

export function addMediaAssetsBulk(assets: readonly MediaAsset[]): void {
  if (assets.length === 0) return;

  appStore.setState((state) => {
    const seenIds = new Set(state.project.mediaAssets.map((a) => a.id));
    const seenPaths = new Set(state.project.mediaAssets.map((a) => a.path));

    const filtered: MediaAsset[] = [];
    for (const asset of assets) {
      if (seenIds.has(asset.id) || seenPaths.has(asset.path)) continue;
      seenIds.add(asset.id);
      seenPaths.add(asset.path);
      filtered.push(asset);
    }
    if (filtered.length === 0) return state;

    return withProject(state, {
      ...state.project,
      mediaAssets: [...state.project.mediaAssets, ...filtered],
    });
  });
}

export function addMediaAsset(asset: MediaAsset): void {
  addMediaAssetsBulk([asset]);
}

export function deleteMediaAssetsBulk(ids: readonly string[]): void {
  if (ids.length === 0) return;
  const idSet = new Set(ids);

  appStore.setState((state) => {
    const nextAssets = state.project.mediaAssets.filter(
      (a) => !idSet.has(a.id),
    );
    if (nextAssets.length === state.project.mediaAssets.length) return state;

    const removedClipIds = new Set<string>();
    const nextTracks = state.project.sequence.tracks.map((track) => {
      const filteredClips = track.clips.filter((clip) => {
        if (clip.source.kind !== "media") return true;
        if (idSet.has(clip.source.mediaId)) {
          removedClipIds.add(clip.id);
          return false;
        }
        return true;
      });
      const filteredTransitions = track.transitions.filter(
        (tr) =>
          !removedClipIds.has(tr.beforeClipId) &&
          !removedClipIds.has(tr.afterClipId),
      );
      if (
        filteredClips.length === track.clips.length &&
        filteredTransitions.length === track.transitions.length
      )
        return track;
      return {
        ...track,
        clips: filteredClips,
        transitions: filteredTransitions,
      };
    });

    const nextProject = {
      ...state.project,
      mediaAssets: nextAssets,
      sequence: { ...state.project.sequence, tracks: nextTracks },
    };

    const adjusted = withAutoAdjust(state, nextProject); // ← FIX
    return {
      ...adjusted,
      selection: {
        ...state.selection,
        selectedClipIds: state.selection.selectedClipIds.filter(
          (id) => !removedClipIds.has(id),
        ),
      },
      ui: {
        ...state.ui,
        media: {
          ...state.ui.media,
          selectedAssetIds: state.ui.media.selectedAssetIds.filter(
            (id) => !idSet.has(id),
          ),
        },
      },
    };
  });
}
