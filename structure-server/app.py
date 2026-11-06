"""ChemDataProof structure server: image (MolScribe) or name (OPSIN) in, SMILES out.

Images are processed in memory and never written to disk or logged.
Run:  uvicorn app:app --host 0.0.0.0 --port 7860
"""

import io
import os
import time

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError

from engines import load_engine, name_to_smiles

MAX_BYTES = int(os.getenv("OCSR_MAX_BYTES", 8_000_000))
MAX_PIXELS = int(os.getenv("OCSR_MAX_PIXELS", 25_000_000))
ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

app = FastAPI(title="ChemDataProof structure server", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

engine = load_engine(os.getenv("OCSR_ENGINE", "molscribe"))


def to_rgb(data: bytes) -> np.ndarray:
    """Decode an image; put transparent backgrounds (ChemDraw copies) on white; add a small margin."""
    img = Image.open(io.BytesIO(data))
    if img.width * img.height > MAX_PIXELS:
        raise HTTPException(413, "Image has too many pixels")
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        img = Image.alpha_composite(bg, img)
    img = img.convert("RGB")
    pad = max(8, int(0.05 * max(img.size)))
    img = ImageOps.expand(img, border=pad, fill=(255, 255, 255))
    return np.asarray(img)


@app.get("/")
def health():
    return {"status": "ok", "engine": engine.name, "engine_version": engine.version,
            "image_recognition": engine.name != "none", "name_to_structure": True}


@app.get("/name")
def name(q: str):
    q = q.strip()
    if not q or len(q) > 500:
        raise HTTPException(400, "Give a name of 1-500 characters")
    smiles, error = name_to_smiles(q)
    return {"name": q, "smiles": smiles, "error": error, "engine": "OPSIN"}


@app.post("/names")
def names(body: dict):
    """Batch name lookup: {"names": [...]} -> {"results": [{name, smiles, error}, ...]}"""
    items = body.get("names") if isinstance(body, dict) else None
    if not isinstance(items, list) or len(items) > 500:
        raise HTTPException(400, 'Send {"names": [...]} with at most 500 names')
    results = []
    for q in items:
        q = str(q or "").strip()[:500]
        if not q:
            results.append({"name": q, "smiles": "", "error": "empty name"})
            continue
        smiles, error = name_to_smiles(q)
        results.append({"name": q, "smiles": smiles, "error": error})
    return {"results": results, "engine": "OPSIN"}


@app.post("/predict")
def predict(image: UploadFile = File(...)):
    data = image.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"Image larger than {MAX_BYTES // 1_000_000} MB")
    if not data:
        raise HTTPException(400, "Empty upload")
    try:
        rgb = to_rgb(data)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Not a readable image (use PNG or JPEG)")
    t0 = time.perf_counter()
    try:
        out = engine.predict(rgb)
    except RuntimeError as e:
        raise HTTPException(501, str(e))
    out["engine"] = engine.name
    out["engine_version"] = engine.version
    out["seconds"] = round(time.perf_counter() - t0, 2)
    out["image_size"] = [int(rgb.shape[1]), int(rgb.shape[0])]
    return out
