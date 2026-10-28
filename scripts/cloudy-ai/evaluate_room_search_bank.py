"""Run the public room-search question bank through local Qwen; never uses the DB."""
import json
import sys
import time
from pathlib import Path

import id_v3


BANK = json.loads(Path(__file__).with_name("room_search_question_bank.json").read_text(encoding="utf-8"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

results = []
for case in BANK["cases"]:
    started = time.perf_counter()
    try:
        actual = id_v3.extract(case["question"])
        ok = actual.get("status") == case["expected_status"]
        if "expected_filters" in case:
            ok = ok and actual.get("filters") == case["expected_filters"]
        if "expected_draft_filters" in case:
            draft = actual.get("draftFilters") or actual.get("filters") or {}
            ok = ok and all(draft.get(field) == expected for field, expected in case["expected_draft_filters"].items())
        if "required_hint" in case:
            hints = actual.get("clarificationHints") or actual.get("draftClarificationHints") or []
            ok = ok and any(
                hint.get("type") == case["required_hint"]["type"]
                and hint.get("value") == case["required_hint"]["value"]
                for hint in hints
            )
        results.append({
            "id": case["id"],
            "category": case["category"],
            "pass": bool(ok),
            "expected_status": case["expected_status"],
            "actual_status": actual.get("status"),
            "filters": actual.get("filters") or actual.get("draftFilters"),
            "questions": actual.get("questions"),
            "seconds": round(time.perf_counter() - started, 2),
        })
    except Exception as error:
        results.append({
            "id": case["id"],
            "category": case["category"],
            "pass": False,
            "expected_status": case["expected_status"],
            "actual_status": f"error: {error}",
            "seconds": round(time.perf_counter() - started, 2),
        })

passed = sum(result["pass"] for result in results)
print(json.dumps({
    "model": BANK["model"],
    "database": BANK["database"],
    "passed": passed,
    "total": len(results),
    "results": results,
}, ensure_ascii=False, indent=2))
sys.exit(0 if passed == len(results) else 1)
