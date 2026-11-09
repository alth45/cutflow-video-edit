# 📊 Hitungan Total Baris Project

Dibuat otomatis untuk memberikan gambaran ukuran basis kode project **cutflow**.

## 📈 Ringkasan

| Metrik | Nilai |
|--------|-------|
| **Total Baris Kode** | **27,254 baris** |
| **Total File** | **143 file** |
| **Directori yang Dihitung** | `src/`, root config files |
| **Dikecualikan** | `node_modules/`, `.git/`, `out/` |

## 📂 Detail Berdasarkan Ekstensi File

| Ekstensi | Jumlah File | Total Baris | Persentase |
|----------|-------------|-------------|------------|
| `.ts` | 118 | 17,277 | 63.4% |
| `.css` | 15 | 4,821 | 17.7% |
| `.json` | 5 | 4,262 | 15.6% |
| `.md` | 4 | 812 | 3.0% |
| `.html` | 1 | 82 | 0.3% |
| **Total** | **143** | **27,254** | **100%** |

## 📁 Struktur Direktori Utama

Project ini adalah aplikasi video editor berbasis Electron dengan struktur berikut:

- `src/main/` — Proses utama Electron (window, IPC, media protocol)
- `src/preload/` — Skrip preload untuk bridge ke renderer
- `src/renderer/` — Proses renderer (UI, aplikasi, modul, state, styles, utils)
- `src/shared/` — Kode yang dibagi antara main dan renderer (constants, IPC channels, types)

## 📝 Catatan

- Perhitungan baris dilakukan menggunakan `Get-Content` di PowerShell, termasuk baris kosong dan komentar.
- File di `node_modules`, `.git`, dan `out` tidak termasuk dalam perhitungan.
- File `package-lock.json` memiliki kontribusi besar karena berisi daftar dependensi lengkap.

---
*File ini dihasilkan secara otomatis. Untuk memperbarui, jalankan ulang perhitungan baris pada direktori project.*