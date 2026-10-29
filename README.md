# Patternly

Patternly is a browser-based machine learning exploration studio. It reads your files locally, previews the data, runs clustering in your browser, and shows the results on an interactive cluster map.

## Start the app

From this folder, run:

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local address Vite prints. Patternly does not need a Python service or a separate API server.

## Supported file format

- `.csv` files up to 25 MB
- A header row and at least two columns are required
- Comma-separated CSV is standard; tab- and semicolon-separated files are detected too
- Numeric columns are used for clustering. Text columns remain available in the preview.
- K-Means supports up to 10,000 rows; DBSCAN supports up to 2,500 rows in the browser

The bundled mini flower sample is included in the frontend build. Clicking it does not make a network request. Uploaded file contents also stay in your browser; Patternly has no backend API.

## Clustering

Patternly fills missing numeric values with the column median, standardizes the selected features, and runs deterministic K-Means or DBSCAN locally. Select at least one numeric feature; select two to see the scatter plot. Use the expand icon in the plot header to open a larger view.

## Tests

Run `npm.cmd test` to check CSV parsing, the bundled sample, K-Means, DBSCAN, and row-limit handling.

PCA and outlier detection are planned follow-on features.
