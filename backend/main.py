from __future__ import annotations

from io import BytesIO

import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sklearn.cluster import DBSCAN, KMeans
from sklearn.preprocessing import StandardScaler

app = FastAPI(title="Patternly API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def read_csv(content: bytes) -> pd.DataFrame:
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV files must be 25 MB or smaller.")
    try:
        frame = pd.read_csv(BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read CSV: {exc}") from exc
    if frame.empty:
        raise HTTPException(status_code=400, detail="The CSV has no data rows.")
    if frame.shape[1] < 2:
        raise HTTPException(status_code=400, detail="Upload a CSV with at least two columns.")
    return frame


def numeric_data(frame: pd.DataFrame, selected: list[str] | None) -> tuple[pd.DataFrame, pd.DataFrame]:
    columns = selected or frame.select_dtypes(include="number").columns.tolist()
    columns = [column for column in columns if column in frame.columns]
    if not columns:
        raise HTTPException(status_code=400, detail="Choose at least one numeric feature.")
    numeric = frame[columns].apply(pd.to_numeric, errors="coerce")
    numeric = numeric.fillna(numeric.median()).fillna(0)
    return numeric, frame


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "patternly-api"}


@app.post("/api/dataset/inspect")
async def inspect_dataset(file: UploadFile = File(...)) -> dict:
    frame = read_csv(await file.read())
    columns = []
    for name in frame.columns:
        series = frame[name]
        columns.append({
            "name": str(name),
            "type": str(series.dtype),
            "missing": int(series.isna().sum()),
            "unique": int(series.nunique(dropna=True)),
            "numeric": bool(pd.api.types.is_numeric_dtype(series)),
        })
    return {
        "filename": file.filename,
        "rows": int(frame.shape[0]),
        "columns": int(frame.shape[1]),
        "column_info": columns,
        "preview": frame.head(12).where(pd.notna(frame.head(12)), None).to_dict(orient="records"),
        "numeric_summary": frame.describe(include="number").round(3).fillna(0).to_dict(),
    }


@app.post("/api/cluster")
async def cluster_dataset(
    file: UploadFile = File(...),
    algorithm: str = Query("kmeans", pattern="^(kmeans|dbscan)$"),
    features: str | None = Query(None),
    clusters: int = Query(3, ge=2, le=20),
    eps: float = Query(0.5, gt=0),
    min_samples: int = Query(5, ge=2, le=100),
) -> dict:
    frame = read_csv(await file.read())
    selected = features.split(",") if features else None
    numeric, _ = numeric_data(frame, selected)
    scaled = StandardScaler().fit_transform(numeric)
    if algorithm == "kmeans":
        model = KMeans(n_clusters=clusters, random_state=42, n_init="auto")
        labels = model.fit_predict(scaled)
        inertia = float(model.inertia_)
    else:
        model = DBSCAN(eps=eps, min_samples=min_samples)
        labels = model.fit_predict(scaled)
        inertia = None
    counts = pd.Series(labels).value_counts().sort_index()
    return {
        "algorithm": algorithm,
        "features": numeric.columns.tolist(),
        "labels": labels.astype(int).tolist(),
        "cluster_counts": {str(int(key)): int(value) for key, value in counts.items()},
        "cluster_count": int(len(set(labels)) - (1 if -1 in labels else 0)),
        "noise_count": int((labels == -1).sum()),
        "inertia": inertia,
        "points": numeric.to_dict(orient="records"),
    }
