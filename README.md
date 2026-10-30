# Patternly

Patternly is a small, browser-based workspace for exploring CSV data with clustering. Load a file, choose the columns to use, run a method, and inspect the groups on an interactive chart.

## Run it locally

You’ll need Node.js and npm installed. From the project folder:

```powershell
npm install
npm run dev
```

Open the local address printed by Vite. To make a production build, run `npm run build`. Run the data and clustering checks with `npm test`.

## Bring in a dataset

Patternly currently accepts CSV files up to 25 MB. Files need a header row and at least two columns. Comma-separated files are supported, and tab- or semicolon-separated files are detected as well.

Numeric columns and categorical columns with a manageable number of distinct values can be used as features. Long text fields stay available in the preview but aren’t used for clustering. Shopping-basket files with columns such as `Item 1`, `Item 2`, and `Item 3` are treated as item-presence data. The included mini flower sample can be loaded without downloading anything.

Everything runs in your browser. There is no upload service or API: your file contents stay on your device. Patternly keeps datasets and experiment reports in that browser until you delete them or clear the browser’s site data. Storage space depends on the browser and device, so download a workspace backup from **Datasets** if the records matter. A backup can be restored in Patternly on another device; it is a JSON file that includes your CSVs and saved reports. Keep it somewhere private.

## Explore clusters

Choose features and a method, then run an experiment. Patternly fills missing numeric values with the column median, limits the effect of extreme numeric values during clustering on larger datasets, encodes categories, and standardizes selected features.

The current methods are:

- **K-Means** groups rows around a chosen number of centers.
- **DBSCAN** finds dense groups and marks rows outside them as noise.
- **Agglomerative clustering** builds groups by repeatedly joining nearby rows, then cuts the hierarchy to the chosen group count.
- **K-Medoids** forms groups represented by actual rows from the dataset.

The map shows two selected numeric columns when available. Otherwise, it projects the selected features into two display dimensions. A cluster-size view is also available. Hover over points and group labels for details; zoom and pan to inspect crowded areas. Experiments keep their settings, group assignments, and reports so you can compare runs later.

Use **Export CSV** on a result to download the original rows with their group assignment. In **Datasets**, you can download or restore a complete workspace backup, or delete a dataset and its reports. Individual reports can be removed from **Experiments**.

## Browser limits

Clustering runs locally, so method limits help keep the page responsive. Current maximums are 10,000 rows for K-Means, 2,500 for DBSCAN, 500 for Agglomerative, and 300 for K-Medoids. Encoded datasets are limited to 1,500 features. These are current implementation limits, not fixed limits of the algorithms; faster implementations or moving computation off the main page could raise them later.

## Built with

React, TypeScript, and Vite. Data parsing, clustering, and chart preparation happen in the browser. Clustering runs in a background browser worker so the page can stay responsive while a method is working.

## Deploy to Cloudflare Workers

Patternly is deployed at [patternly.corescode.workers.dev](https://patternly.corescode.workers.dev) as a Cloudflare Worker with static assets. To publish later changes from this checkout, run `npm run deploy:cloudflare`. For a local production preview, run `npm run preview:cloudflare`. The Worker serves the app at its root URL; each visitor’s datasets and reports stay in that visitor’s browser. Deploying from another machine requires Wrangler authentication with the Cloudflare account.

### Alternative: GitHub Pages

The included GitHub Actions workflow can also deploy the site to GitHub Pages. To use that alternative, set the repository’s **Settings → Pages → Source** to **GitHub Actions**. The Cloudflare Worker remains the primary deployment.

PCA and outlier detection are ideas for a later release; Patternly currently focuses on clustering.
