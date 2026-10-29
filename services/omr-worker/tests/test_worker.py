from fastapi.testclient import TestClient
from app.main import app
from app.omr.supervisor import run_bounded
from test_recognition import sheet


def test_subprocess_pdf_to_image_to_omr():
    result = run_bounded("process", [(sheet(marks={0: [1]}), "sheet.pdf", "application/pdf")])
    assert result[0]["pages"][0]["answers"][0]["selected"] == "B"


def test_worker_auth_precedes_file_parsing(monkeypatch):
    monkeypatch.setenv("OMR_WORKER_SECRET", "test-worker-secret-at-least-32-characters")
    client = TestClient(app)
    assert client.post("/api/omr/process", content=b"garbage").status_code == 401
    result = client.post("/api/omr/process", headers={"Authorization": "Bearer test-worker-secret-at-least-32-characters"},
                         files=[("files", ("sheet.pdf", sheet(), "application/pdf"))])
    assert result.status_code == 200, result.text
    assert result.json()["files"][0]["pages"][0]["status"] == "READ"
    assert client.post("/api/omr/process", headers={"Authorization": "Bearer test-worker-secret-at-least-32-characters",
                                                    "Content-Length": "999999999"}, content=b"x").status_code == 413
