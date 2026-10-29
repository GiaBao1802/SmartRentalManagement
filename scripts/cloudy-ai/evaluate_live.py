"""Read-only live evaluation of all three Cloudy intents using local Ollama."""
import json
import os
import subprocess
import sys
from pathlib import Path

import id_v3
from conversation import understand
from worker import handle_request

ROOT = Path(__file__).resolve().parents[2]
results = []
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def check_public(case_id, question, expected_status, required=None):
    try:
        result = id_v3.extract(question)
        ok = result.get("status") == expected_status
        if required:
            filters = result.get("filters") or {}
            for field, expected in required.items():
                if field == "amenities_contains":
                    ok = ok and set(expected).issubset(set(filters.get("amenities") or []))
                else:
                    ok = ok and filters.get(field) == expected
        results.append({"assistant": "public", "id": case_id, "expected": expected_status, "actual": result.get("status", "invalid"), "pass": bool(ok), "filters": result.get("filters")})
        return result
    except Exception as error:
        results.append({"assistant": "public", "id": case_id, "expected": expected_status, "actual": f"error: {error}", "pass": False})
        return None


base_question = "Tìm phòng tại Bến Nắng dưới 4 triệu cho 2 người có máy lạnh"
base = check_public("public.multiple_constraints", base_question, "ready", {
    "location": "Bến Nắng", "occupants": 2,
    "price": [{"op": "lt", "value": 4_000_000}],
    "amenities_contains": ["air_conditioning"],
})

if base and base.get("status") == "ready":
    try:
        updated = understand("thêm Wi-Fi", "continue", base["filters"], id_v3.extract)
        filters = updated.get("filters") or {}
        retained = filters.get("location") == "Bến Nắng" and filters.get("occupants") == 2 and filters.get("price") == [{"op": "lt", "value": 4_000_000}]
        added = "wifi" in filters.get("amenities", []) and "air_conditioning" in filters.get("amenities", [])
        ok = updated.get("status") == "ready" and retained and added
        results.append({"assistant": "public", "id": "public.continue_add_filter", "expected": "retain old filters + add wifi", "actual": "pass" if ok else json.dumps(updated, ensure_ascii=False), "pass": ok})
    except Exception as error:
        results.append({"assistant": "public", "id": "public.continue_add_filter", "expected": "retain old filters + add wifi", "actual": f"error: {error}", "pass": False})

check_public("public.unsupported_distance", "Tìm phòng gần trường đại học, đi bộ 10 phút", "needs_clarification")
check_public("public.negative_amenity", "Tìm phòng dưới 4 triệu nhưng không cần máy lạnh", "needs_clarification")

try:
    shorthand = id_v3.extract("Tôi muốn tìm phòng 2tr")
    reply = handle_request({"message": "Tôi muốn tìm phòng 2tr", "mode": "new"}, lambda _: shorthand)
    understood = shorthand.get("clarificationHints") or []
    ok = shorthand.get("status") == "needs_clarification" and any(item.get("value") == 2_000_000 for item in understood) and "tối đa 2.000.000đ/tháng" in reply.get("text", "")
    results.append({"assistant": "public", "id": "public.bare_price_shorthand", "expected": "recognize 2tr and ask comparison", "actual": "pass" if ok else json.dumps({"parsed": shorthand, "reply": reply}, ensure_ascii=False), "pass": ok})
except Exception as error:
    results.append({"assistant": "public", "id": "public.bare_price_shorthand", "expected": "recognize 2tr and ask comparison", "actual": f"error: {error}", "pass": False})

node_command = ["node", "node_modules/tsx/dist/cli.mjs", "scripts/cloudy-ai/evaluate_owner_resident.ts"]
try:
    child_env = os.environ.copy()
    child_env["DATABASE_URL"] = "postgresql://cloudy-eval.invalid/unused"
    runner = subprocess.run(node_command, cwd=ROOT, env=child_env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    if runner.stdout:
        try:
            other = json.loads(runner.stdout)
            results.extend(other["results"])
        except json.JSONDecodeError:
            results.append({"assistant": "owner/resident", "id": "runner.output", "expected": "JSON", "actual": runner.stdout[-1000:], "pass": False})
    if runner.returncode:
        if not runner.stdout:
            results.append({"assistant": "owner/resident", "id": "runner.start", "expected": "0", "actual": runner.stderr[-1000:], "pass": False})
except Exception as error:
    results.append({"assistant": "owner/resident", "id": "runner.start", "expected": "runner completes", "actual": str(error), "pass": False})

passed = sum(bool(item.get("pass")) for item in results)
print(json.dumps({"model": "qwen3:1.7b", "database": "not used", "writes": "none", "passed": passed, "total": len(results), "results": results}, ensure_ascii=False, indent=2))
sys.exit(0 if passed == len(results) else 1)
