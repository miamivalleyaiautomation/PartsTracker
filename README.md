# Parts Assistant (Netlify)

A zero-backend web app to help electricians sort parts from totes to cabinets by parsing **AutoCAD Electrical BOM (by-location tallied)** CSV files.

- **Upload multiple CSVs** — each file becomes a **Job** (job number inferred from filename, editable).
- **Search by Part Number** — see all **locations** and **quantities** per job.
- **Mark assignments** — track how many of each part you’ve placed at each location.
- **Progress** — per-part and per-job status.
- **Export** — download a CSV report with Assigned vs Remaining per location.
- **Mobile & Desktop layouts** — separate pages optimized for each.

## Deploy to Netlify

1. Drag-and-drop this folder into Netlify, or connect a repo.
2. Ensure `netlify.toml` `publish = "public"` is set (it is).
3. Open `/` for Desktop UI, `/mobile.html` for Mobile UI (the desktop page auto-suggests mobile when the viewport is small).

## CSV Format & Column Mapping

The app includes a **Column Mapper** after you upload:
- Map **Part Number**, **Location**, **Quantity**, and optional **Description**.
- It tries to auto-detect common header names (case-insensitive).

This supports typical AutoCAD Electrical by-location tallied exports, where each row is a `(part, location, quantity)` triple. Duplicate rows aggregate automatically.

## Persistence

Data is saved to **LocalStorage** per browser. You can export/import a JSON backup under **Settings → Backup/Restore** if needed.

## Notes

- This app is intentionally static and works fully client-side. You can later add Netlify Functions + Blob storage for multi-user persistence.
- If your CSV does not include headers, check **"No header row"** during import and set the column indexes.
