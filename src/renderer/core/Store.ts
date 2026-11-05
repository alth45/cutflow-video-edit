/* ============================================================
   GENERIC STORE
   ------------------------------------------------------------
   State container minimalis dengan pola:
   - getState()       → baca state saat ini
   - setState(updater)→ update immutable via updater function
   - subscribe(fn)    → reaktif terhadap perubahan

   Didesain seperti Redux/Zustand:
   - Reference equality check (Object.is) → skip no-op.
   - Object.freeze di setiap update → runtime immutability.
   - Listener di-snapshot saat notify → aman unsubscribe di tengah.
   - Queue-based update → listener boleh setState (re-entrant safe).

   File ini TIDAK tahu tentang AppState, Project, atau domain lain.
   Generik penuh: bisa dipakai untuk state apapun (nanti mungkin
   dipakai untuk UI transient store terpisah).
   ============================================================ */

/* ============================================================
   TYPES
   ============================================================ */
export type StoreListener<T> = (state: T, prev: T) => void;
export type StoreUpdater<T> = (prev: T) => T;

/* ============================================================
   STORE
   ------------------------------------------------------------
   Generic parameter `T extends object`:
   - Menjamin nilai bisa di-freeze (primitif tidak bisa).
   - Semua state kita adalah plain object (bukan primitive).

   Type safety dari `readonly` di interface T (project.ts, state.ts)
   melengkapi freeze runtime: TS mencegah compile, freeze mencegah
   mutasi runtime.
   ============================================================ */
export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<StoreListener<T>>();
  private readonly queue: StoreUpdater<T>[] = [];
  private processing = false;
  private updateCount = 0;

  /**
   * @param initialState Objek awal. **Frozen di tempat** —
   *   jangan pakai referensi yang sama di luar store ini
   *   (mutation akan throw di strict mode, atau diam-diam
   *   diabaikan di non-strict).
   */
  constructor(initialState: T) {
    this.state = Object.freeze(initialState);
  }

  /* ============================================================
     READ
     ============================================================ */

  /** Ambil state saat ini (immutable, frozen). */
  getState(): T {
    return this.state;
  }

  /** Jumlah update yang sudah dilakukan — untuk debug/test. */
  getUpdateCount(): number {
    return this.updateCount;
  }

  /* ============================================================
     WRITE
     ------------------------------------------------------------
     Updater WAJIB mengembalikan `prev` (reference yang sama)
     kalau tidak ada perubahan. Ini memungkinkan `Object.is`
     check memotong no-op update sebelum notify.
     ============================================================ */
  setState(updater: StoreUpdater<T>): void {
    this.queue.push(updater);

    // Kalau sudah ada loop yang jalan (re-entrant call dari listener),
    // cukup enqueue — loop yang sudah aktif akan memprosesnya.
    if (this.processing) return;

    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift()!;
        this.applyUpdate(next);
      }
    } finally {
      this.processing = false;
    }
  }

  /* ============================================================
     SUBSCRIBE
     ------------------------------------------------------------
     Mengembalikan fungsi unsubscribe. Listener TIDAK dipanggil
     saat subscribe (harus panggil getState() dulu kalau butuh
     nilai awal).
     ============================================================ */
  subscribe(listener: StoreListener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /* ============================================================
     INTERNAL
     ============================================================ */

  private applyUpdate(updater: StoreUpdater<T>): void {
    const prev = this.state;
    const next = updater(prev);

    // No-op: updater mengembalikan referensi yang sama.
    if (Object.is(next, prev)) return;

    // Freeze di tempat — `next` menjadi immutable.
    // Reference in-place, type T tidak berubah.
    Object.freeze(next);

    this.state = next;
    this.updateCount++;
    this.notify(next, prev);
  }

  private notify(state: T, prev: T): void {
    // Snapshot listener — perubahan Set selama iterasi tidak
    // mempengaruhi listener yang akan dipanggil di update ini.
    const snapshot = Array.from(this.listeners);

    for (const listener of snapshot) {
      try {
        listener(state, prev);
      } catch (err) {
        // Satu listener error tidak boleh menghentikan listener lain.
        // Log keras — kalau bug ini muncul, harus ketahuan.
        // eslint-disable-next-line no-console
        console.error('[Store] listener threw:', err);
      }
    }
  }
}