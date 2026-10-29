# Patternly

Patternly is an interactive machine learning exploration studio for uploading datasets, exploring their structure, running clustering experiments, and comparing results.

## Current features

- CSV upload and dataset profile with row/column counts, missing values, numeric feature detection, and a data preview
- K-Means and DBSCAN clustering on standardized numeric features
- Cluster map and per-cluster counts, including DBSCAN noise points
- A bundled mini flower dataset for trying the workflow
- PCA and outlier detection are planned follow-on features

## Start Patternly

From this folder, run `npm.cmd run dev:all`. This starts the frontend and API together. Open the local address Vite prints. Keep that terminal open while using the app; press Ctrl+C to stop both services.

The API is available at `http://localhost:8000`.

## Local development setup

This machine did not expose a `py` or `python` command to the Codex session. To keep setup isolated, Patternly includes an ignored, project-local Python 3.13 embeddable runtime in `.tools/python`; it does not modify system Python. Python dependencies are installed in that runtime. The frontend dependencies are installed under `node_modules` and recorded in `package-lock.json`.

For a fresh checkout, install Node dependencies with `npm.cmd install`. Install Python dependencies from the `backend` folder with:

```powershell
..\.tools\python\python.exe -m pip install --target ..\.tools\python\Lib\site-packages -r requirements.txt
```

PCA and outlier detection remain future work.

## Run API tests

From the backend folder, run `..\.tools\python\python.exe -m unittest discover -s tests -v`.
