import { appStore } from "@state/appStore";

export function selectClip(clipId: string): void {
  appStore.setState((state) => {
    const same =
      state.selection.selectedClipIds.length === 1 &&
      state.selection.selectedClipIds[0] === clipId &&
      state.selection.selectedTransitionId === null &&
      state.ui.media.selectedAssetIds.length === 0;
    if (same) return state;

    return {
      ...state,
      selection: {
        ...state.selection,
        selectedClipIds: [clipId],
        selectedTransitionId: null,
      },
      ui: { ...state.ui, media: { ...state.ui.media, selectedAssetIds: [] } },
    };
  });
}

/** Toggle clip + clear media/transition selection (FIX: was missing media clear). */
export function toggleClipSelection(clipId: string): void {
  appStore.setState((state) => {
    const ids = state.selection.selectedClipIds;
    const next = ids.includes(clipId)
      ? ids.filter((id) => id !== clipId)
      : [...ids, clipId];

    return {
      ...state,
      selection: { ...state.selection, selectedClipIds: next },
      ui: { ...state.ui, media: { ...state.ui.media, selectedAssetIds: [] } },
    };
  });
}

export function clearSelection(): void {
  appStore.setState((state) => {
    if (
      state.selection.selectedClipIds.length === 0 &&
      state.selection.selectedTransitionId === null &&
      state.ui.media.selectedAssetIds.length === 0
    )
      return state;
    return {
      ...state,
      selection: {
        ...state.selection,
        selectedClipIds: [],
        selectedTransitionId: null,
      },
      ui: { ...state.ui, media: { ...state.ui.media, selectedAssetIds: [] } },
    };
  });
}

export function setActiveTrack(trackId: string | null): void {
  appStore.setState((state) => {
    if (state.selection.activeTrackId === trackId) return state;
    return {
      ...state,
      selection: { ...state.selection, activeTrackId: trackId },
    };
  });
}

export function setSelectedClips(ids: readonly string[]): void {
  appStore.setState((state) => {
    if (ids.length === 0) {
      if (
        state.selection.selectedClipIds.length === 0 &&
        state.selection.selectedTransitionId === null &&
        state.ui.media.selectedAssetIds.length === 0
      )
        return state;
      return {
        ...state,
        selection: {
          ...state.selection,
          selectedClipIds: [],
          selectedTransitionId: null,
        },
        ui: { ...state.ui, media: { ...state.ui.media, selectedAssetIds: [] } },
      };
    }

    const validIds = new Set<string>();
    for (const track of state.project.sequence.tracks) {
      for (const clip of track.clips) {
        if (ids.includes(clip.id)) validIds.add(clip.id);
      }
    }
    const next = Array.from(validIds);
    const prev = state.selection.selectedClipIds;
    if (next.length === prev.length && next.every((id) => prev.includes(id)))
      return state;

    return {
      ...state,
      selection: {
        ...state.selection,
        selectedClipIds: next,
        selectedTransitionId: null,
      },
      ui: { ...state.ui, media: { ...state.ui.media, selectedAssetIds: [] } },
    };
  });
}

export function selectMediaAsset(assetId: string): void {
  appStore.setState((state) => {
    const same =
      state.ui.media.selectedAssetIds.length === 1 &&
      state.ui.media.selectedAssetIds[0] === assetId &&
      state.selection.selectedClipIds.length === 0;
    if (same) return state;
    return {
      ...state,
      selection: {
        ...state.selection,
        selectedClipIds: [],
        selectedTransitionId: null,
      },
      ui: {
        ...state.ui,
        media: { ...state.ui.media, selectedAssetIds: [assetId] },
      },
    };
  });
}

export function toggleMediaAssetSelection(assetId: string): void {
  appStore.setState((state) => {
    const ids = state.ui.media.selectedAssetIds;
    const next = ids.includes(assetId)
      ? ids.filter((id) => id !== assetId)
      : [...ids, assetId];
    return {
      ...state,
      selection: {
        ...state.selection,
        selectedClipIds: [],
        selectedTransitionId: null,
      },
      ui: { ...state.ui, media: { ...state.ui.media, selectedAssetIds: next } },
    };
  });
}

export function clearMediaAssetSelection(): void {
  appStore.setState((state) => {
    if (state.ui.media.selectedAssetIds.length === 0) return state;
    return {
      ...state,
      ui: { ...state.ui, media: { ...state.ui.media, selectedAssetIds: [] } },
    };
  });
}

export function selectTransition(transitionId: string): void {
  appStore.setState((state) => {
    if (state.selection.selectedTransitionId === transitionId) return state;
    return {
      ...state,
      selection: {
        ...state.selection,
        selectedTransitionId: transitionId,
        selectedClipIds: [],
      },
      ui: { ...state.ui, media: { ...state.ui.media, selectedAssetIds: [] } },
    };
  });
}
