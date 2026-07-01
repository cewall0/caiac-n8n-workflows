#!/usr/bin/env python3
"""
ragas_eval.py — Client-agnostic RAG quality evaluation.

Usage:
    python /opt/caiac/ragas_eval.py --client-id henderson

Pulls all config (Qdrant URL, collection, Ollama URL/model) from caiac.clients
by slug — no hardcoded client values.

Output:
  - JSON to stdout (consumed by ragas_api.py / n8n)
  - JSON to /opt/caiac/ragas_{client_id}.json (persistent per-client record)

Eval dataset (required before first run per client):
    /opt/caiac/eval_data/{client_id}.json
    Format: [{"question": "...", "ground_truth": "..."}]
    ground_truth is required for context_precision; include for all clients.

Exit codes: 0 = success, 1 = error (error JSON written to stderr).

Environment:
    POSTGRES_DSN  — e.g. postgresql://user:pass@localhost:5432/caiac
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

# ── Config ────────────────────────────────────────────────────────────────────

POSTGRES_DSN = os.environ.get(
    "POSTGRES_DSN",
    "postgresql://postgres:postgres@localhost:5432/caiac",
)
EVAL_DATA_DIR = Path("/opt/caiac/eval_data")
OUTPUT_DIR = Path("/opt/caiac")
PASS_THRESHOLD = 0.70


# ── Postgres ──────────────────────────────────────────────────────────────────

def get_client_config(slug: str) -> dict:
    with psycopg2.connect(POSTGRES_DSN) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, slug, name, config
                FROM caiac.clients
                WHERE slug = %s AND active = true
                LIMIT 1
                """,
                (slug,),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError(f"Client '{slug}' not found or inactive in caiac.clients")
    return dict(row)


# ── RAG pipeline helpers ───────────────────────────────────────────────────────

def embed_text(text: str, ollama_url: str, embed_model: str) -> list:
    resp = requests.post(
        f"{ollama_url}/api/embeddings",
        json={"model": embed_model, "prompt": text},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["embedding"]


def search_qdrant(
    vector: list,
    qdrant_url: str,
    collection: str,
    limit: int,
) -> list:
    resp = requests.post(
        f"{qdrant_url}/collections/{collection}/points/search",
        json={
            "vector": vector,
            "limit": limit,
            "with_payload": True,
            "filter": {
                "must": [{"key": "type", "match": {"value": "document"}}]
            },
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json().get("result", [])


def generate_answer(
    question: str,
    context: str,
    ollama_url: str,
    model: str,
    system_prompt: str,
) -> str:
    resp = requests.post(
        f"{ollama_url}/api/chat",
        json={
            "model": model,
            "stream": False,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt + "\n\nContext:\n" + context,
                },
                {"role": "user", "content": question},
            ],
        },
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"]


# ── RAGAS evaluation ──────────────────────────────────────────────────────────

def run_ragas(samples: list, ollama_url: str, model: str, embed_model: str) -> dict:
    """
    Evaluate with RAGAS using Ollama as the backing LLM + embedder.
    Supports RAGAS >= 0.2 (EvaluationDataset API).
    """
    try:
        # RAGAS >= 0.2
        from ragas import EvaluationDataset, SingleTurnSample, evaluate
        from ragas.llms import LangchainLLMWrapper
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from ragas.metrics import Faithfulness, LLMContextPrecisionWithoutReference

        try:
            from langchain_ollama import ChatOllama, OllamaEmbeddings
        except ImportError:
            from langchain_community.chat_models import ChatOllama
            from langchain_community.embeddings import OllamaEmbeddings

        llm_wrapper = LangchainLLMWrapper(
            ChatOllama(base_url=ollama_url, model=model, temperature=0)
        )
        emb_wrapper = LangchainEmbeddingsWrapper(
            OllamaEmbeddings(base_url=ollama_url, model=embed_model)
        )

        metrics = [
            Faithfulness(llm=llm_wrapper),
            LLMContextPrecisionWithoutReference(llm=llm_wrapper),
        ]

        dataset = EvaluationDataset(samples=[
            SingleTurnSample(
                user_input=s["question"],
                response=s["answer"],
                retrieved_contexts=s["contexts"],
                reference=s.get("ground_truth") or None,
            )
            for s in samples
        ])

        result = evaluate(dataset, metrics=metrics)
        return {
            "faithfulness": round(float(result["Faithfulness"]), 4),
            "context_precision": round(
                float(result["LLMContextPrecisionWithoutReference"]), 4
            ),
        }

    except ImportError:
        # Fallback: RAGAS 0.1.x (older API)
        from datasets import Dataset
        from ragas import evaluate as ragas_evaluate
        from ragas.metrics import faithfulness as f_metric, context_precision as cp_metric
        from ragas.llms import LangchainLLMWrapper
        from langchain_community.chat_models import ChatOllama
        from langchain_community.embeddings import OllamaEmbeddings

        llm = LangchainLLMWrapper(
            ChatOllama(base_url=ollama_url, model=model, temperature=0)
        )
        f_metric.llm = llm
        cp_metric.llm = llm

        ds = Dataset.from_list([
            {
                "question": s["question"],
                "answer": s["answer"],
                "contexts": s["contexts"],
                "ground_truth": s.get("ground_truth", ""),
            }
            for s in samples
        ])
        result = ragas_evaluate(ds, metrics=[f_metric, cp_metric])
        return {
            "faithfulness": round(float(result["faithfulness"]), 4),
            "context_precision": round(float(result["context_precision"]), 4),
        }


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="CAIAC RAG Evaluation")
    parser.add_argument(
        "--client-id", required=True, metavar="SLUG",
        help="Client slug (e.g. henderson)"
    )
    args = parser.parse_args()
    client_id = args.client_id.strip()

    # 1. Load client config from Postgres
    client = get_client_config(client_id)
    ai = client["config"].get("ai", {})

    ollama_url    = ai.get("ollama_url",         "http://ollama:11434")
    embed_model   = ai.get("embed_model",         "bge-m3:latest")
    chat_model    = ai.get("model",               "llama3.2:latest")
    qdrant_url    = ai.get("qdrant_url",          "http://qdrant:6333")
    collection    = ai.get("qdrant_collection",   client_id)
    system_prompt = ai.get("system_prompt",       "You are a helpful assistant.")
    search_limit  = int(ai.get("search_limit",    5))

    # 2. Load eval dataset
    eval_file = EVAL_DATA_DIR / f"{client_id}.json"
    if not eval_file.exists():
        raise FileNotFoundError(
            f"Eval dataset not found: {eval_file}\n"
            f"Create it with format: "
            '[{"question": "...", "ground_truth": "..."}]'
        )
    with open(eval_file) as f:
        test_cases = json.load(f)
    if not test_cases:
        raise ValueError(f"Eval dataset is empty: {eval_file}")

    # 3. Run RAG pipeline for each test case
    eval_samples = []
    for tc in test_cases:
        question = tc["question"]
        q_vec    = embed_text(question, ollama_url, embed_model)
        hits     = search_qdrant(q_vec, qdrant_url, collection, limit=search_limit)
        contexts = [h["payload"].get("text", "") for h in hits if h["payload"].get("text")]
        context_str = "\n\n".join(contexts)
        answer   = generate_answer(question, context_str, ollama_url, chat_model, system_prompt)
        eval_samples.append({
            "question":     question,
            "answer":       answer,
            "contexts":     contexts,
            "ground_truth": tc.get("ground_truth", ""),
        })

    # 4. RAGAS evaluation
    scores = run_ragas(eval_samples, ollama_url, chat_model, embed_model)

    passed = (
        scores["faithfulness"]      >= PASS_THRESHOLD
        and scores["context_precision"] >= PASS_THRESHOLD
    )

    output = {
        "client_id":         client_id,
        "client_name":       client["name"],
        "faithfulness":      scores["faithfulness"],
        "context_precision": scores["context_precision"],
        "passed":            passed,
        "pass_threshold":    PASS_THRESHOLD,
        "sample_count":      len(eval_samples),
        "ran_at":            datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
    }

    # 5. Write persistent per-client result file
    out_file = OUTPUT_DIR / f"ragas_{client_id}.json"
    with open(out_file, "w") as f:
        json.dump(output, f, indent=2)

    # 6. Stdout for API wrapper / n8n
    print(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        error_out = {
            "error": str(exc),
            "client_id": next(
                (sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--client-id"),
                "unknown",
            ),
        }
        print(json.dumps(error_out), file=sys.stderr)
        sys.exit(1)
