import "@styles/main.css";
import { bootstrap } from "./app/bootstrap";

/* ============================================================
   RENDERER ENTRY
   ------------------------------------------------------------
   F7a: aplikasi benar-benar mount App shell (grid 3×3 dengan
   5 placeholder). Modul-modul di F7b–F11 akan mengisi
   placeholder tersebut dengan konten sebenarnya.

   Guard `window.cutflow` tetap di sini (bukan di bootstrap)
   karena ini **kondisi preload** yang wajib terpenuhi sebelum
   App bisa berjalan — kegagalan di sini = tidak ada gunanya
   mount UI sama sekali.
   ============================================================ */

function reportPreloadMissing(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div style="
      height: 100%;
      display: grid;
      place-items: center;
      padding: 32px;
      text-align: center;
      font-family: 'Inter', system-ui, sans-serif;
    ">
      <div>
        <div style="
          font-size: 15px;
          font-weight: 600;
          color: #ff4d6d;
          margin-bottom: 8px;
        ">Preload bridge tidak tersedia</div>
        <div style="
          font-size: 12px;
          color: #8b93a7;
          max-width: 420px;
          line-height: 1.6;
        ">
          <code style="color:#c4b6ff">window.cutflow</code> undefined.
          Cek console preload untuk detail.
        </div>
      </div>
    </div>
  `;
}

function main(): void {
  if (!window.cutflow) {
    reportPreloadMissing();
    return;
  }
  bootstrap();
}

main();
