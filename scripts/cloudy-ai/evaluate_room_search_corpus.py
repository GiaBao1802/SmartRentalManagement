"""Run only the held-out public room-search examples through local Qwen 1.7B.

This is a read-only parser evaluation: it does not confirm a search or query the
room catalog/database. Training-reference examples are intentionally excluded.
"""
import json
import sys
import time
from pathlib import Path

import worker
from guest_question_router import route as route_guest_question


CORPUS = json.loads(
    Path(__file__).parents[2]
    .joinpath("data/cloudy-guest/v2/room-search-corpus.json")
    .read_text(encoding="utf-8")
)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

results = []
for case in CORPUS["holdout"]:
    body = {"message": case["message"], "mode": case["mode"]}
    if "context" in case:
        body["context"] = case["context"]
    started = time.perf_counter()
    model_called = route_guest_question(case["message"]) is None
    try:
        actual = worker.handle_request(body)
        status = "ready" if actual.get("status") == "awaiting_confirmation" else actual.get("status")
        target = case["target"]
        passed = status == target["status"]
        if passed and status == "ready":
            passed = actual.get("context") == target["filters"]
        results.append({
            "id": case["id"],
            "category": case["category"],
            "pass": bool(passed),
            "expected_status": target["status"],
            "actual_status": status,
            "expected_filters": target.get("filters"),
            "actual_filters": actual.get("context"),
            "model_called": model_called,
            "seconds": round(time.perf_counter() - started, 2),
        })
    except Exception as error:
        results.append({
            "id": case["id"],
            "category": case["category"],
            "pass": False,
            "expected_status": case["target"]["status"],
            "actual_status": f"error: {error}",
            "seconds": round(time.perf_counter() - started, 2),
        })

passed = sum(result["pass"] for result in results)
print(json.dumps({
    "model": "qwen3:1.7b",
    "dataset": "data/cloudy-guest/v2/room-search-corpus.json",
    "split": "holdout",
    "database": "not accessed",
    "passed": passed,
    "total": len(results),
    "results": results,
}, ensure_ascii=False, indent=2))
sys.exit(0 if passed == len(results) else 1)
