---
title: ChemDataProof structure server
emoji: ⚗️
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# ChemDataProof structure server

A small API used by [ChemDataProof](https://github.com/sripatijana/chemdataproof):

| Endpoint | What it does | Engine |
|---|---|---|
| `GET /` | Health check | |
| `POST /predict` (form field `image`) | Image of one structure → SMILES, molfile, confidence | [MolScribe](https://github.com/thomas0809/MolScribe) (MIT) |
| `POST /names` (`{"names": [...]}`) | Batch name lookup for whole SI files | OPSIN |
| `GET /name?q=…` | Systematic / IUPAC name → SMILES, or the reason it can't be read | [OPSIN](https://github.com/dan2097/opsin) via py2opsin (MIT) |

Images and names are processed in memory and are never stored or logged.

## Option A: free Hugging Face Space

1. Create a new Space at huggingface.co → **Docker** SDK, CPU basic (free).
2. Upload the contents of this folder (`app.py`, `engines.py`, `requirements.txt`, `Dockerfile`, `README.md`).
3. Wait for the build (~10 min the first time: PyTorch and the model weights are installed).
4. Your server address is `https://<user>-<space-name>.hf.space`. Put it in `js/config.js` of ChemDataProof, or paste it under "Structure server" in the page.

Free Spaces go to sleep after a period without use. The first request then takes about a minute.

## Option B: on your own computer (full privacy)

Needs Python 3.10 (MolScribe requires PyTorch < 2) and Java (for OPSIN).

```bash
cd structure-server
python3.10 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 7860
```

Then enter `http://localhost:7860` under "Structure server" in ChemDataProof. Images never leave your machine.

Or with Docker: `docker build -t chemdataproof-server . && docker run -p 7860:7860 chemdataproof-server`.

## Options (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `OCSR_ENGINE` | `molscribe` | `molscribe`, `none` (name lookup only, no PyTorch needed) or `dummy` (tests) |
| `ALLOWED_ORIGINS` | `*` | Comma-separated origins allowed to call the API, e.g. `https://your-name.github.io` |
| `OCSR_MAX_BYTES` | 8000000 | Maximum upload size |
| `OCSR_THREADS` | CPU count | PyTorch threads |

## Tests

```bash
pip install -r requirements-dev.txt
OCSR_ENGINE=dummy pytest tests
```
