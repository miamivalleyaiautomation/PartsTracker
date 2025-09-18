# Parts Assistant (Netlify, v3)

- **Always creates a Job** on CSV upload, even before mapping.
- Shows **Column Mapper** with dropdowns. You can complete mapping now or later (job is marked **Mapping pending**).
- Supports optional **second location column** (e.g., Room + Cabinet), **Quantity** default 1 if omitted, and **Description**.
- **Map Columns** button lets you reopen the mapper for the selected job at any time.

## Deploy
Publish the `public/` directory on Netlify.

## Use
1. Upload CSV(s). A Job is created immediately.
2. Click **Map Columns** to choose fields. If you cancel, you can map later.
3. Search by part → see locations → assign quantities.
