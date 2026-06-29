#!/usr/bin/env python3
"""
ragas_api.py — FastAPI wrapper for ragas_eval.py.

Exposes: POST /ragas/eval  { "client_id": "henderson" }

Managed by systemd (ragas-api.service). Run manually for testing:
    uvicorn ragas_api:app --host 0.0.0.0 --port 8000

n8n calls this at http://host.docker.internal:8000/ragas/eval
"""

import json
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

SCRIPT = Path("/opt/caiac/ragas_eval.py")
PYTHON = sys.executable  # uses the venv python that launched uvicorn

app = FastAPI(title="CAIAC Ragas Eval API", version="1.0.0")


class EvalRequest(BaseModel):
    client_id: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ragas/eval")
def run_eval(req: EvalRequest):
    client_id = req.client_id.strip()
    if not client_id or "/" in client_id or ".." in client_id:
        raise HTTPException(status_code=400, detail="Invalid client_id")

    if not SCRIPT.exists():
        raise HTTPException(
            status_code=500,
            detail=f"ragas_eval.py not found at {SCRIPT}",
        )

    try:
        result = subprocess.run(
            [PYTHON, str(SCRIPT), "--client-id", client_id],
            capture_output=True,
            text=True,
            timeout=600,  # 10 min ceiling — RAGAS + LLM can be slow
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail=f"ragas_eval.py timed out after 600 s for client '{client_id}'",
        )

    if result.returncode != 0:
        stderr = result.stderr.strip()
        # stderr is JSON when the script exits via our error handler
        try:
            err = json.loads(stderr)
        except Exception:
            err = {"error": stderr or "ragas_eval.py failed with no output"}
        raise HTTPException(status_code=500, detail=err)

    stdout = result.stdout.strip()
    if not stdout:
        raise HTTPException(
            status_code=500,
            detail="ragas_eval.py produced no output",
        )

    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail=f"ragas_eval.py output was not valid JSON: {stdout[:200]}",
        )
