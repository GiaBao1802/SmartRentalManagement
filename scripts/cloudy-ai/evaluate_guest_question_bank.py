"""Evaluate the guest renter bank against the local Qwen worker; no database calls."""
import json
import sys
import time
from pathlib import Path

import id_v3
from worker import handle_request


ROOT = Path(__file__).resolve().parents[2]
BANK = json.loads((ROOT / "data/cloudy-guest/v1/question-bank.json").read_text(encoding="utf-8"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def filters_match(actual, expected):
    actual = actual or {}
    labels = set()
    if actual.get("location"):
        labels.add("location")
    for term in actual.get("price", []):
        if term["op"] == "eq":
            labels.add("price_exact")
        elif term["op"] in {"lt", "lte"}:
            labels.add("price_max")
        elif term["op"] in {"gt", "gte"}:
            labels.add("price_min")
    for term in actual.get("area", []):
        if term["op"] == "eq":
            labels.add("area_exact")
        elif term["op"] in {"lt", "lte"}:
            labels.add("area_max")
        elif term["op"] in {"gt", "gte"}:
            labels.add("area_min")
    if actual.get("occupants") is not None:
        labels.add("occupants")
    labels.update(actual.get("amenities", []))
    return labels == set(expected)


def evaluate(case):
    body = {"message": case["message"], "mode": case.get("mode", "new")}
    if body["mode"] == "continue":
        body["context"] = case["context"]
    started = time.perf_counter()
    model_inputs = []
    def traced_extract(message):
        model_inputs.append(message)
        return id_v3.extract(message)
    reply = handle_request(body, traced_extract)
    route = case["expected_route"]
    needs_proposal = route.startswith(("prepare_", "merge_", "replace_", "remove_"))
    passed = reply["status"] == ("awaiting_confirmation" if needs_proposal else "needs_clarification")
    if needs_proposal:
        passed = passed and filters_match(reply.get("context"), case.get("expected_filters", []))
    else:
        passed = passed and reply.get("context") is None
    return {
        "id": case["id"],
        "expected_route": route,
        "pass": bool(passed),
        "status": reply.get("status"),
        "context": reply.get("context"),
        "text": reply.get("text"),
        "model_inputs": model_inputs,
        "seconds": round(time.perf_counter() - started, 2),
    }


results = []
for case in BANK["cases"]:
    try:
        results.append(evaluate(case))
    except Exception as error:
        results.append({"id": case["id"], "expected_route": case["expected_route"], "pass": False, "error": str(error)})

passed = sum(row["pass"] for row in results)
print(json.dumps({"model": "qwen3:1.7b", "database": "not used", "passed": passed, "total": len(results), "results": results}, ensure_ascii=False, indent=2))
sys.exit(0 if passed == len(results) else 1)
