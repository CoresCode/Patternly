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
- Numeric and low-cardinality categorical columns are usable for clustering; high-cardinality text columns remain available in the preview.
- Repeated `Item 1`, `Item 2`, … columns are recognized as shopping baskets and encoded as item-presence features.
- K-Means supports up to 10,000 rows; DBSCAN supports up to 2,500 rows in the browser
- Encoded feature sets are limited to 1,500 dimensions

The bundled mini flower sample is included in the frontend build. Clicking it does not make a network request. Uploaded file contents also stay in your browser; Patternly has no backend API.

## Clustering

Patternly fills missing numeric values with the column median, caps extreme numeric tails at the 2nd/98th percentile for clustering on datasets with at least 100 rows, encodes categories, standardizes selected features, and runs deterministic K-Means or DBSCAN locally. When selected data has at least two numeric columns, the map plots those directly and lets you choose which columns appear on each axis; otherwise it projects the encoded data into two dimensions for display. Plot axes also focus on the middle 96% and pin extreme values to the edges; hover a dot to see its original values. The chart includes a zoom slider, zoom buttons below the plot, and mouse-wheel zoom. The Datasets page saves each uploaded CSV in browser storage, and the Experiments page keeps each run's settings, assignments, and report on that device.

## Tests

Run `npm.cmd test` to check CSV parsing, categorical and basket encoding, the bundled sample, K-Means, DBSCAN, and row-limit handling.

PCA and outlier detection are planned follow-on features.
