import io
import os
import sys

os.environ["OCSR_ENGINE"] = "dummy"
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app import app, to_rgb  # noqa: E402

client = TestClient(app)


def png(mode="RGB", size=(120, 80), color=(255, 255, 255)):
    buf = io.BytesIO()
    Image.new(mode, size, color).save(buf, format="PNG")
    return buf.getvalue()


def test_health():
    r = client.get("/")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_predict_returns_smiles():
    r = client.post("/predict", files={"image": ("s.png", png(), "image/png")})
    assert r.status_code == 200
    body = r.json()
    assert body["smiles"] and body["engine"] == "dummy" and "seconds" in body


def test_transparent_background_becomes_white():
    rgb = to_rgb(png("RGBA", color=(0, 0, 0, 0)))
    assert rgb.shape[2] == 3 and rgb.min() == 255


def test_rejects_non_image():
    r = client.post("/predict", files={"image": ("x.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_cors_header():
    r = client.get("/", headers={"Origin": "https://example.github.io"})
    assert r.headers.get("access-control-allow-origin") in ("*", "https://example.github.io")


def test_name_to_structure():
    r = client.get("/name", params={"q": "4-phenylbutanoic acid"})
    assert r.status_code == 200
    assert r.json()["smiles"] and not r.json()["error"]


def test_bad_name_gives_reason():
    r = client.get("/name", params={"q": "4-phenylbutanoic acidd"})
    body = r.json()
    assert body["smiles"] == "" and "acidd" in body["error"]


def test_batch_names():
    r = client.post("/names", json={"names": ["4-phenylbutan-2-one", "1-phenylprop-2-yn-1-oll", ""]})
    res = r.json()["results"]
    assert res[0]["smiles"] and res[1]["smiles"] == "" and res[1]["error"] and res[2]["error"] == "empty name"
