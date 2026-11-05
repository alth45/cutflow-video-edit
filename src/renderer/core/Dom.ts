/* ============================================================
   DOM HELPERS
   ------------------------------------------------------------
   Helper minimal untuk operasi DOM yang sering dipakai.

   ATURAN pemilihan:
   - Helper ditambahkan kalau native API:
       (a) verbose untuk kasus umum, ATAU
       (b) mudah salah secara tipe, ATAU
       (c) butuh cleanup yang mudah terlupakan.
   - Hal yang native API-nya sudah ringkas & type-safe
     (classList, style.setProperty, setAttribute) → tidak
     dibungkus. Gunakan native langsung.

   File ini TIDAK tahu domain CutFlow. Generik DOM utilities.
   ============================================================ */

/* ============================================================
   QUERY SELECTOR
   ------------------------------------------------------------
   Native `querySelector` mengembalikan `Element | null`, memaksa
   cast ke HTMLElement di setiap pemakaian. Helper ini:
   - default generic HTMLElement (kasus paling umum)
   - bisa specify tipe spesifik: qs<HTMLInputElement>('#search')
   - fail-fast kalau elemen wajib ada (`qsRequired`)
   ============================================================ */

export function qs<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T | null {
  return root.querySelector<T>(selector);
}

/**
 * Seperti `qs` tapi throw kalau tidak ditemukan.
 * Gunakan hanya saat elemen benar-benar wajib ada (mount point).
 * Error di sini = bug programmer, bukan kondisi runtime.
 */
export function qsRequired<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const node = qs<T>(selector, root);
  if (!node) {
    throw new Error(`[Dom] Required element not found: "${selector}"`);
  }
  return node;
}

/**
 * Query multiple, return Array (bukan NodeList).
 *
 * Alasan Array:
 * - Bisa `.map()`, `.filter()`, `.reduce()` langsung.
 * - Bisa `for...of` tanpa butuh lib DOM.Iterable.
 * - Bisa `.length === 0` untuk cek kosong (NodeList juga bisa,
 *   tapi Array lebih predictable).
 *
 * Trade-off: NodeList lazy, Array eager. Untuk UI kita dengan
 * ≤100 elemen, eager = O(n) sekali → tidak masalah.
 */
export function qsa<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/* ============================================================
   CREATE ELEMENT
   ------------------------------------------------------------
   Menggantikan pola verbose:
     const el = document.createElement('div');
     el.className = 'card';
     el.id = 'foo';
     el.textContent = 'hi';
     el.setAttribute('role', 'button');
     el.append(child1, child2);

   dengan satu call:
     el('div', { className: 'card', id: 'foo', text: 'hi',
       attrs: { role: 'button' }, children: [child1, child2] });
   ============================================================ */

export interface CreateOptions {
  /** Isi `className` (bisa multi: 'card active'). */
  className?: string;
  /** Isi `id`. */
  id?: string;
  /**
   * Isi `textContent` — aman dari XSS (tidak parse HTML).
   * Untuk HTML sengaja TIDAK disediakan: pakai `el` + `children`
   * untuk struktur, atau sadari risiko saat pakai innerHTML.
   */
  text?: string;
  /** Atribut HTML via `setAttribute` (aria-*, data-*, role, dll). */
  attrs?: Record<string, string>;
  /** Children: Node atau string (string jadi text node). */
  children?: readonly (Node | string)[];
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: CreateOptions,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (opts) {
    if (opts.className !== undefined) node.className = opts.className;
    if (opts.id !== undefined) node.id = opts.id;
    if (opts.text !== undefined) node.textContent = opts.text;

    if (opts.attrs) {
      for (const [key, value] of Object.entries(opts.attrs)) {
        node.setAttribute(key, value);
      }
    }

    if (opts.children) {
      node.append(...opts.children);
    }
  }

  return node;
}

/* ============================================================
   EVENT LISTENER
   ------------------------------------------------------------
   `addEventListener` mengembalikan `void` — cleanup mudah
   terlupakan. Helper ini mengembalikan fungsi unsubscribe:

     const off = on(btn, 'click', handler);
     // ... nanti:
     off();

   Sama pattern-nya dengan Store.subscribe dan EventBus.on.
   ============================================================ */

/**
 * Tambah event listener dengan tipe aman berdasarkan event name.
 * Mengembalikan fungsi untuk melepas listener.
 *
 * `GlobalEventHandlersEventMap` mencakup event element, document,
 * DAN window — jadi helper ini berlaku untuk semua target.
 */
export function on<K extends keyof GlobalEventHandlersEventMap>(
  target: EventTarget,
  type: K,
  handler: (ev: GlobalEventHandlersEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, handler as EventListener, options);
  return () => {
    target.removeEventListener(type, handler as EventListener, options);
  };
}

/* ============================================================
   EVENT DELEGATION
   ------------------------------------------------------------
   Untuk list dinamis (clip, thumbnail, tab), mendaftarkan listener
   per-child akan bocor saat anak diganti. Delegation di root
   tetap valid meski children berubah-ubah.
   ============================================================ */

/**
 * Pasang listener di `root`, filter berdasarkan `selector`.
 * Handler menerima event + elemen yang match (sudah di-`closest`).
 *
 * Contoh:
 *   delegate(timelineEl, 'click', '.clip', (ev, clipEl) => {
 *     actions.selectClip(clipEl.dataset['id']!);
 *   });
 *
 * @returns Fungsi untuk melepas listener.
 */
export function delegate<
  K extends keyof GlobalEventHandlersEventMap,
  T extends Element = HTMLElement,
>(
  root: ParentNode,
  type: K,
  selector: string,
  handler: (ev: GlobalEventHandlersEventMap[K], matched: T) => void,
  options?: AddEventListenerOptions,
): () => void {
  const listener = (ev: Event): void => {
    const target = ev.target;
    if (!(target instanceof Element)) return;

    const matched = target.closest(selector);
    if (!matched) return;

    // Pastikan match masih di dalam root (bisa terjadi kalau
    // root adalah subtree & matched menemukan ancestor di luar).
    if (!root.contains(matched)) return;

    handler(ev as GlobalEventHandlersEventMap[K], matched as T);
  };

  // Cast: `addEventListener` mengharapkan `EventListenerOrEventListenerObject`,
  // sedangkan kita punya `(ev: Event) => void`. Keduanya kompatibel di runtime.
  root.addEventListener(type, listener as EventListener, options);
  return () => {
    root.removeEventListener(type, listener as EventListener, options);
  };
}

/* ============================================================
   CHILDREN MANAGEMENT
   ============================================================ */

/**
 * Kosongkan semua children dari sebuah elemen.
 * Menggunakan `replaceChildren()` — lebih cepat dari
 * `while (node.firstChild) removeChild` dan eksplisit.
 */
export function clear(node: Element): void {
  node.replaceChildren();
}

/**
 * Ganti seluruh isi `parent` dengan node-node baru.
 * Sama seperti `parent.replaceChildren(...nodes)` tapi
 * memudahkan pola "clear + append" yang sering muncul.
 */
export function setChildren(
  parent: Element,
  ...nodes: readonly (Node | string)[]
): void {
  parent.replaceChildren(...nodes);
}
