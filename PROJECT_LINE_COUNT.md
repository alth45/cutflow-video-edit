# 📊 Hitungan Total Baris Project

Dibuat otomatis untuk memberikan gambaran ukuran basis kode project **cutflow**.

## 📈 Ringkasan

| Metrik | Nilai |
|--------|-------|
| **Total Baris Kode** | **23,337 baris** |
| **Total File** | **114 file** |
| **Directori yang Dihitung** | `src/`, root config files |
| **Dikecualikan** | `node_modules/`, `.git/`, `out/` |

## 📂 Detail Berdasarkan Ekstensi File

| Ekstensi | Jumlah File | Total Baris | Persentase |
|----------|-------------|-------------|------------|
| `.ts` | 92 | 14,427 | 61.8% |
| `.css` | 13 | 4,115 | 17.6% |
| `.json` | 5 | 4,098 | 17.6% |
| `.md` | 3 | 615 | 2.6% |
| `.html` | 1 | 82 | 0.4% |
| **Total** | **114** | **23,337** | **100%** |

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