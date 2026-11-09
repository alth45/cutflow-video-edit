/* ============================================================
   WAVEFORM LOGIC
   ------------------------------------------------------------
   Generate bar heights deterministik dari clip ID. Bar heights
   disimpan sebagai persentase tinggi (0..100), dikonsumsi CSS
   oleh `.wave i { height: N% }`.

   Deterministik (bukan Math.random):
   - Re-render tidak mengubah bentuk waveform.
   - Test bisa assert output spesifik.
   ============================================================ */

/** Hash string → 32-bit signed integer (dipakai sebagai seed). */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Generate `bars` heights (persen 0..100) untuk clip audio.
 *
 * Envelope `sin(π · x)` membuat bentuk gelombang terlihat
 * natural (naik di tengah, kecil di pinggir) — meniru amplitude
 * audio fade-in/out ringan.
 */
export function generateWaveform(clipId: string, bars = 64): number[] {
  const out: number[] = [];
  let seed = hashString(clipId);

  for (let i = 0; i < bars; i++) {
    // LCG step untuk pseudo-random deterministik.
    seed = (seed * 1664525 + 1013904223) | 0;
    const rand = ((seed >>> 0) % 10000) / 10000;

    // Envelope: 0.45 di pinggir → 1.0 di tengah.
    const x = i / (bars - 1);
    const env = 0.45 + 0.55 * Math.sin(x * Math.PI);

    const h = (18 + rand * 70) * env;
    out.push(Math.round(h * 10) / 10);
  }
  return out;
}
