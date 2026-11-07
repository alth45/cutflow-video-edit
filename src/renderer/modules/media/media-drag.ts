/* ============================================================
   MEDIA DRAG STATE
   ------------------------------------------------------------
   Track asset ID yang sedang di-drag. Dipakai untuk ghost
   preview yang butuh info durasi aktual asset (dataTransfer.getData
   tidak bisa dipanggil saat dragover).
   ============================================================ */

let draggedAssetId: string | null = null;

export function setDraggedAssetId(id: string | null): void {
  draggedAssetId = id;
}

export function getDraggedAssetId(): string | null {
  return draggedAssetId;
}
