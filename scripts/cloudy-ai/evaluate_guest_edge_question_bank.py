"""Evaluate informal and multi-turn guest utterances with local Qwen; no DB calls."""
import json
import sys
import time
from pathlib import Path

import id_v3
from guest_question_router import route as route_guest_question
from worker import handle_request

ROOT = Path(__file__).resolve().parents[2]
BANK = json.loads((ROOT / "data/cloudy-guest/v1/edge-question-bank.json").read_text(encoding="utf-8"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def evaluate(case):
    body = {"message": case["message"], "mode": case.get("mode", "new")}
    if "context" in case:
        body["context"] = case["context"]
    started = time.perf_counter()
    model_inputs = []

    def traced_extract(message):
        model_inputs.append(message)
        return id_v3.extract(message)

    reply = handle_request(body, traced_extract)
    actual_status = "ready" if reply.get("status") == "awaiting_confirmation" else reply.get("status")
    passed = actual_status == case["expected_status"]
    if "expected_filters" in case:
        passed = passed and reply.get("context") == case["expected_filters"]
    else:
        passed = passed and reply.get("context") is None
    if case.get("expected_route") == "safe_faq":
        passed = passed and not model_inputs and "Mình hiểu" in reply.get("text", "")
        passed = passed and "chưa hiểu cụm" not in reply.get("text", "")
    return {
        "id": case["id"],
        "category": case["category"],
        "pass": bool(passed),
        "expected_status": case["expected_status"],
        "actual_status": actual_status,
        "expected_filters": case.get("expected_filters"),
        "actual_filters": reply.get("context"),
        "model_called": bool(model_inputs),
        "faq_router_matched": route_guest_question(case["message"]) is not None,
        "text": reply.get("text"),
        "seconds": round(time.perf_counter() - started, 2),
    }


results = []
for case in BANK["cases"]:
    try:
        results.append(evaluate(case))
    except Exception as error:
        results.append({"id": case["id"], "category": case["category"], "pass": False, "error": str(error)})

passed = sum(row["pass"] for row in results)
print(json.dumps({
    "model": "qwen3:1.7b",
    "dataset": "data/cloudy-guest/v1/edge-question-bank.json",
    "database": "not used",
    "passed": passed,
    "total": len(results),
    "results": results,
}, ensure_ascii=False, indent=2))
sys.exit(0 if passed == len(results) else 1)
