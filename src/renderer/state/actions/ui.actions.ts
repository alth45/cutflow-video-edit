import { appStore } from "@state/appStore";
import { ZOOM } from "@shared/constants";
import type {
  MediaPanelTab,
  InspectorPanelTab,
  TimelineTool,
} from "@shared/types/state";

export function setMediaTab(tab: MediaPanelTab): void {
  appStore.setState((state) => {
    if (state.ui.media.activeTab === tab) return state;
    return {
      ...state,
      ui: { ...state.ui, media: { ...state.ui.media, activeTab: tab } },
    };
  });
}

export function setSearchQuery(query: string): void {
  appStore.setState((state) => {
    if (state.ui.media.searchQuery === query) return state;
    return {
      ...state,
      ui: { ...state.ui, media: { ...state.ui.media, searchQuery: query } },
    };
  });
}

export function setInspectorTab(tab: InspectorPanelTab): void {
  appStore.setState((state) => {
    if (state.ui.inspector.activeTab === tab) return state;
    return {
      ...state,
      ui: { ...state.ui, inspector: { ...state.ui.inspector, activeTab: tab } },
    };
  });
}

export function toggleInspectorGroup(groupId: string): void {
  appStore.setState((state) => {
    const groups = state.ui.inspector.collapsedGroups;
    const next = groups.includes(groupId)
      ? groups.filter((id) => id !== groupId)
      : [...groups, groupId];
    return {
      ...state,
      ui: {
        ...state.ui,
        inspector: { ...state.ui.inspector, collapsedGroups: next },
      },
    };
  });
}

export function setZoom(zoom: number): void {
  appStore.setState((state) => {
    const clamped = Math.max(ZOOM.MIN, Math.min(ZOOM.MAX, zoom));
    if (clamped === state.ui.timeline.zoom) return state;
    return {
      ...state,
      ui: { ...state.ui, timeline: { ...state.ui.timeline, zoom: clamped } },
    };
  });
}

export function setActiveTool(tool: TimelineTool): void {
  appStore.setState((state) => {
    if (state.ui.timeline.activeTool === tool) return state;
    return {
      ...state,
      ui: { ...state.ui, timeline: { ...state.ui.timeline, activeTool: tool } },
    };
  });
}

export function toggleSnap(): void {
  appStore.setState((state) => ({
    ...state,
    ui: {
      ...state.ui,
      timeline: {
        ...state.ui.timeline,
        snapEnabled: !state.ui.timeline.snapEnabled,
      },
    },
  }));
}

export function toggleLayoutPanel(
  panel: "media" | "inspector" | "timeline",
): void {
  appStore.setState((state) => {
    const key = `${panel}Hidden` as
      | "mediaHidden"
      | "inspectorHidden"
      | "timelineHidden";
    return {
      ...state,
      ui: {
        ...state.ui,
        layout: { ...state.ui.layout, [key]: !state.ui.layout[key] },
      },
    };
  });
}

export function togglePreviewFullscreen(): void {
  appStore.setState((state) => ({
    ...state,
    ui: {
      ...state.ui,
      layout: {
        ...state.ui.layout,
        previewFullscreen: !state.ui.layout.previewFullscreen,
      },
    },
  }));
}
