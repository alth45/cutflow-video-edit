/* ============================================================
   TYPED EVENT BUS
   ------------------------------------------------------------
   Pub/sub untuk event EPHEMERAL — yaitu kejadian yang tidak
   punya state, hanya "sesuatu terjadi".

   Perbedaan dengan Store:
   ┌──────────────┬─────────────────────┬──────────────────────┐
   │              │ Store               │ EventBus             │
   ├──────────────┼─────────────────────┼──────────────────────┤
   │ Punya state? │ Ya (AppState)       │ Tidak                │
   │ History?     │ Ya (current state)  │ Tidak (fire-forget)  │
   │ Subscriber   │ Reaktif thd state   │ Reaktif thd kejadian │
   │ Timing       │ Dapat state terkini │ Hanya saat emit      │
   │ Contoh       │ playhead, project   │ toast, focus, hotkey │
   └──────────────┴─────────────────────┴──────────────────────┘

   ATURAN pemakaian:
   - Kalau informasi perlu "dibaca berulang" → Store.
   - Kalau informasi adalah "kejadian sesaat" → EventBus.

   Contoh BENAR:
     bus.emit('toast:show', { message: 'Saved', tone: 'success' });
     bus.emit('search:focus');   // minta focus input search

   Contoh SALAH:
     bus.emit('playback:update', { time: 12.5 });  // ❌ ini state → Store

   File ini TIDAK tahu domain CutFlow. Generik: dikonfigurasi via
   generic event map di tempat pemakaian.
   ============================================================ */

/* ============================================================
   TYPES
   ------------------------------------------------------------
   `EventMap` adalah object type yang memetakan nama event ke
   payload-nya. Contoh (di tempat pemakaian):

     type CutFlowEvents = {
       'toast:show': { message: string; tone: 'info' | 'error' };
       'search:focus': void;
       'shortcut:undo': void;
     };
   ============================================================ */
export type EventMap = Record<string, unknown>;

export type EventHandler<P> = (payload: P) => void;
export type Unsubscribe = () => void;

/* ============================================================
   EVENT BUS
   ------------------------------------------------------------
   Generic parameter `M extends EventMap`:
   - Menjamin setiap `emit` / `on` / `off` memakai key yang valid.
   - Type payload otomatis di-infer dari M[K].
   - Typo nama event = compile error.
   ============================================================ */
export class EventBus<M extends EventMap> {
  /**
   * Map: nama event → Set of handlers.
   *
   * Set dipilih (bukan Array) karena:
   * - Dedup otomatis: subscribe handler yang sama 2x = 1 entry.
   * - Hapus O(1): `delete` by reference.
   * - Iterasi safe dengan snapshot (sama seperti Store).
   */
  private readonly handlers = new Map<keyof M, Set<EventHandler<M[keyof M]>>>();

  /* ============================================================
     SUBSCRIBE
     ============================================================ */

  /**
   * Daftarkan listener untuk satu event.
   *
   * @returns Unsubscribe function — panggil untuk berhenti menerima event.
   */
  on<K extends keyof M>(event: K, handler: EventHandler<M[K]>): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }

    // Cast: Set menyimpan union of all handler types; kita tahu
    // ini handler untuk event K (type-checked oleh signature).
    set.add(handler as EventHandler<M[keyof M]>);

    return () => {
      set!.delete(handler as EventHandler<M[keyof M]>);
      if (set!.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  /**
   * Daftarkan listener yang otomatis dilepas setelah event pertama kali
   * di-emit. Berguna untuk "one-shot" reactions.
   *
   * Contoh: menunggu user menekan tombol konfirmasi sekali, lalu cleanup.
   */
  once<K extends keyof M>(event: K, handler: EventHandler<M[K]>): Unsubscribe {
    const unsub = this.on(event, (payload) => {
      unsub();
      handler(payload);
    });
    return unsub;
  }

  /* ============================================================
     EMIT
     ------------------------------------------------------------
     Sinkron, fire-and-forget. Handler yang melempar error
     tidak menghentikan handler lain (lihat `emit`).
     ============================================================ */

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;

    // Snapshot: mutation handler set selama iterasi (subscribe/off
    // dari dalam handler) tidak mempengaruhi iterasi saat ini.
    const snapshot = Array.from(set);

    for (const handler of snapshot) {
      try {
        // Cast: handler di Set bertipe union; tapi kita tahu yang
        // spesifik untuk event K (di-enforce oleh type system
        // saat subscribe dan emit).
        (handler as EventHandler<M[K]>)(payload);
      } catch (err) {
        // Satu handler error tidak boleh menjatuhkan handler lain.
        // Console error dengan nama event untuk diagnosa.
        // eslint-disable-next-line no-console
        console.error(`[EventBus] handler for "${String(event)}" threw:`, err);
      }
    }
  }

  /* ============================================================
     UTILITY
     ============================================================ */

  /** Jumlah handler aktif untuk satu event. Untuk debugging/test. */
  listenerCount<K extends keyof M>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /** Hapus semua handler (semua event). Berguna untuk cleanup saat app teardown. */
  clear(): void {
    this.handlers.clear();
  }
}
