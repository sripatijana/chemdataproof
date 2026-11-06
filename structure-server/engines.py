"""Recognition engines. Each engine takes an RGB numpy array and returns a dict
with at least "smiles"; optionally "molfile" (with 2D coordinates) and "confidence" (0-1)."""

import os
import threading


class MolScribeEngine:
    name = "MolScribe"

    def __init__(self):
        import torch
        from huggingface_hub import hf_hub_download
        from molscribe import MolScribe

        repo = os.getenv("MOLSCRIBE_REPO", "yujieq/MolScribe")
        ckpt = os.getenv("MOLSCRIBE_CKPT", "swin_base_char_aux_1m680k.pth")
        path = hf_hub_download(repo, ckpt)
        torch.set_num_threads(int(os.getenv("OCSR_THREADS", os.cpu_count() or 2)))
        self.model = MolScribe(path, device=torch.device("cpu"))
        self.lock = threading.Lock()
        try:
            from importlib.metadata import version
            self.version = version("MolScribe")
        except Exception:
            self.version = "unknown"

    def predict(self, rgb):
        with self.lock:
            out = self.model.predict_image(rgb, return_confidence=True)
        return {
            "smiles": out.get("smiles") or "",
            "molfile": out.get("molfile"),
            "confidence": float(out["confidence"]) if out.get("confidence") is not None else None,
        }


class DummyEngine:
    """For tests and UI development without PyTorch: always returns the same structure."""
    name = "dummy"
    version = "0"

    def __init__(self):
        self.smiles = os.getenv("OCSR_DUMMY_SMILES", "C[C@H](O)c1ccc(cc1)C(F)(F)F")

    def predict(self, rgb):
        return {"smiles": self.smiles, "molfile": None, "confidence": 0.99}


class NoEngine:
    """Name-to-structure only: no image recognition, no PyTorch needed."""
    name = "none"
    version = "0"

    def predict(self, rgb):
        raise RuntimeError("Image recognition is disabled on this server (OCSR_ENGINE=none)")


def name_to_smiles(name):
    """IUPAC/systematic name -> SMILES with OPSIN. Returns (smiles, error_message)."""
    import warnings
    from py2opsin import py2opsin

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        smiles = py2opsin(name) or ""
    error = ""
    if not smiles:
        lines = []
        for w in caught:
            for line in str(w.message).splitlines():
                line = line.strip().lstrip("> ").strip()
                if line and not line.startswith("Picked up") and "raised the following" not in line:
                    lines.append(line)
        error = " ".join(lines) or "OPSIN could not interpret this name"
    return smiles, error


def load_engine(name):
    name = (name or "molscribe").lower()
    if name == "none":
        return NoEngine()
    if name == "molscribe":
        return MolScribeEngine()
    if name == "dummy":
        return DummyEngine()
    raise ValueError(f"Unknown OCSR engine: {name}")
