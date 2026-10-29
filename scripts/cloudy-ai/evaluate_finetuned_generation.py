"""CPU free-generation comparison on Cloudy's untouched holdout; no app/database access."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any

try:
    from transformers import StoppingCriteria
except ModuleNotFoundError:
    class StoppingCriteria:
        """Fallback base so pure JSON/schema helpers remain testable without ML extras."""

ROOT = Path(__file__).resolve().parents[2]
SMOKE_CASES = {"guest": "eval-008", "resident": "test-001", "owner": "test-002"}
OWNER_ACTIONS = {
    "read_only_after_scope_resolution", "read_only_aggregate", "read_only_active_assignments",
    "read_only_finalized_meter_snapshots", "read_only_with_coverage_limit",
    "reject_write_from_advisor", "require_separate_confirmed_workflow", "clarify_in_chat",
}
OWNER_TASK_ACTIONS = {
    "unpaid": "read_only_after_scope_resolution",
    "utilities": "read_only_after_scope_resolution",
    "missing": "read_only_after_scope_resolution",
    "overview": "read_only_after_scope_resolution",
    "requests": "read_only_after_scope_resolution",
    "residents": "read_only_aggregate",
    "available_rooms": "read_only_after_scope_resolution",
    "vehicle_counts": "read_only_active_assignments",
    "electricity_ranking": "read_only_finalized_meter_snapshots",
    "frequent_requests": "read_only_with_coverage_limit",
}


def load_training_module() -> Any:
    path = ROOT / "scripts/cloudy-ai/finetune_qwen3_lora.py"
    spec = importlib.util.spec_from_file_location("cloudy_finetune", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load fine-tuning data helpers")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CompleteJsonObjectStoppingCriteria(StoppingCriteria):
    """Stop once the model has closed one top-level JSON object."""

    def __init__(self, tokenizer: Any, prompt_length: int):
        self.tokenizer = tokenizer
        self.prompt_length = prompt_length

    def __call__(self, input_ids: Any, scores: Any, **kwargs: Any) -> bool:
        generated = self.tokenizer.decode(input_ids[0, self.prompt_length:], skip_special_tokens=True)
        start = generated.find("{")
        if start < 0:
            return False
        stack: list[str] = []
        in_string = False
        escaped = False
        for char in generated[start:]:
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char in "{[":
                stack.append(char)
            elif char in "}]":
                if not stack or (char == "}" and stack[-1] != "{") or (char == "]" and stack[-1] != "["):
                    return False
                stack.pop()
                if not stack:
                    return True
        return False


def generate(model: Any, tokenizer: Any, messages: list[dict[str, str]], max_new_tokens: int) -> str:
    import torch
    from transformers import StoppingCriteriaList

    prompt = tokenizer.apply_chat_template(
        messages, tokenize=True, add_generation_prompt=True, enable_thinking=False, return_tensors="pt"
    )
    with torch.inference_mode():
        output = model.generate(
            input_ids=prompt,
            attention_mask=torch.ones_like(prompt),
            max_new_tokens=max_new_tokens,
            do_sample=False,
            use_cache=True,
            pad_token_id=tokenizer.pad_token_id,
            stopping_criteria=StoppingCriteriaList([
                CompleteJsonObjectStoppingCriteria(tokenizer, prompt.shape[-1])
            ]),
        )
    return tokenizer.decode(output[0, prompt.shape[-1]:], skip_special_tokens=True).strip()


def parse_json(text: str) -> tuple[Any, bool, str | None]:
    """Return parsed object, bare-JSON validity, and parse/format error.

    Cloudy is trained to emit a bare JSON object. Markdown fences, trailing text,
    duplicate keys, or malformed JSON are therefore format failures even when a
    partial object could be recovered.
    """
    stripped = text.strip()
    bare = stripped.startswith("{")
    start = stripped.find("{")
    if start < 0:
        return None, False, "no_json_object"

    def reject_duplicate_keys(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in items:
            if key in result:
                raise ValueError(f"duplicate_key:{key}")
            result[key] = value
        return result

    try:
        value, end = json.JSONDecoder(object_pairs_hook=reject_duplicate_keys).raw_decode(stripped[start:])
        if not isinstance(value, dict):
            return None, False, "top_level_value_is_not_object"
        has_trailing_text = bool(stripped[start + end:].strip())
        bare_json = bare and start == 0 and not has_trailing_text
        return value, bare_json, None if bare_json else "output_not_bare_json_object"
    except (json.JSONDecodeError, ValueError) as exc:
        return None, False, str(exc)


def validate_schema(flow: str, value: Any) -> bool:
    """Validate the fixed intent/action contract, including Owner safety mapping."""
    if not isinstance(value, dict):
        return False
    if flow == "owner":
        if set(value) != {"task", "next_action"}:
            return False
        task, action = value["task"], value["next_action"]
        if action not in OWNER_ACTIONS:
            return False
        if task == "clarify":
            return action in {"reject_write_from_advisor", "require_separate_confirmed_workflow", "clarify_in_chat"}
        return OWNER_TASK_ACTIONS.get(task) == action
    if flow == "resident":
        intents = {"services", "meter", "requests", "amenity_choice", "invoice", "help"}
        actions = {
            "read_scoped_invoice", "show_scoped_invoice_targets", "continue_scoped_invoice_lookup",
            "show_scoped_service_catalog", "open_booking_flow_without_submitting",
            "open_eligible_meter_targets_without_submitting", "explain_meter_submission_flow",
            "open_request_review_without_submitting", "ask_existing_service_or_room_equipment",
            "clarify_in_chat", "continue_current_topic_without_booking",
            "open_request_status_without_creating_new_request", "continue_meter_history_without_submitting",
        }
        return (
            set(value) == {"intent", "next_action"}
            and value["intent"] in intents
            and value["next_action"] in actions
        )
    if flow == "guest":
        status = value.get("status")
        if status == "needs_clarification":
            return set(value) == {"status", "clarification"} and isinstance(value["clarification"], str)
        if status != "ready" or set(value) != {"status", "filters", "next_action"}:
            return False
        filters = value["filters"]
        if not isinstance(filters, dict) or set(filters) != {"price", "area", "location", "occupants", "amenities"}:
            return False
        if not isinstance(filters["price"], list) or not isinstance(filters["area"], list):
            return False
        for condition in filters["price"] + filters["area"]:
            if (
                not isinstance(condition, dict)
                or set(condition) != {"op", "value"}
                or condition["op"] not in {"eq", "lt", "lte", "gt", "gte"}
                or not isinstance(condition["value"], (int, float))
            ):
                return False
        return (
            (filters["location"] is None or isinstance(filters["location"], str))
            and (filters["occupants"] is None or isinstance(filters["occupants"], int))
            and isinstance(filters["amenities"], list)
            and all(isinstance(item, str) for item in filters["amenities"])
            and value["next_action"] in {"ask_guest_to_confirm", "ask_guest_to_confirm_all"}
        )
    return False


def main() -> None:
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--threads", type=int, default=min(8, os.cpu_count() or 4))
    parser.add_argument("--max-new-tokens", type=int, default=96)
    parser.add_argument("--smoke", action="store_true", help="Run only the original three representative smoke cases")
    parser.add_argument("--flows", nargs="+", choices=("guest", "resident", "owner"),
                        help="Restrict evaluation to selected flows")
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    ft = load_training_module()
    cases = ft.load_cases("holdout")
    selected_flows = set(args.flows or ft.SYSTEMS)
    cases = [case for case in cases if case["flow"] in selected_flows]
    selected = (
        [next(item for item in cases if item["flow"] == flow and item["id"] == case_id)
         for flow, case_id in SMOKE_CASES.items() if flow in selected_flows]
        if args.smoke else cases
    )
    tokenizer = AutoTokenizer.from_pretrained(ft.MODEL_ID, trust_remote_code=False)
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.float32,
    )
    base = AutoModelForCausalLM.from_pretrained(
        ft.MODEL_ID,
        quantization_config=quantization,
        device_map={"": "cpu"},
        low_cpu_mem_usage=True,
        trust_remote_code=False,
    )
    model = PeftModel.from_pretrained(base, args.adapter_dir)
    model.eval()
    rows = []
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    partial_output = output.with_name(output.stem + ".partial.json")
    for case in selected:
        with model.disable_adapter():
            base_text = generate(model, tokenizer, case["messages"][:-1], args.max_new_tokens)
        print(f"generated base {case['flow']} {case['id']}", flush=True)
        adapter_text = generate(model, tokenizer, case["messages"][:-1], args.max_new_tokens)
        print(f"generated adapter {case['flow']} {case['id']}", flush=True)
        base_json, base_format_valid, base_error = parse_json(base_text)
        adapter_json, adapter_format_valid, adapter_error = parse_json(adapter_text)
        rows.append({
            "flow": case["flow"],
            "id": case["id"],
            "expected": case["target"],
            "base": {
                "text": base_text,
                "json": base_json,
                "strict_json": base_format_valid,
                "schema_valid": validate_schema(case["flow"], base_json),
                "exact_structured_answer": base_json is not None and base_json == case["target"],
                "error": base_error,
            },
            "adapter": {
                "text": adapter_text,
                "json": adapter_json,
                "strict_json": adapter_format_valid,
                "schema_valid": validate_schema(case["flow"], adapter_json),
                "exact_structured_answer": adapter_json is not None and adapter_json == case["target"],
                "error": adapter_error,
            },
        })
        partial_output.write_text(json.dumps({"completed_cases": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    by_flow = {}
    for flow in ft.SYSTEMS:
        flow_rows = [row for row in rows if row["flow"] == flow]
        by_flow[flow] = {
            "total": len(flow_rows),
            "base_strict_json": sum(row["base"]["strict_json"] for row in flow_rows),
            "adapter_strict_json": sum(row["adapter"]["strict_json"] for row in flow_rows),
            "base_schema_valid": sum(row["base"]["schema_valid"] for row in flow_rows),
            "adapter_schema_valid": sum(row["adapter"]["schema_valid"] for row in flow_rows),
            "base_exact": sum(row["base"]["exact_structured_answer"] for row in flow_rows),
            "adapter_exact": sum(row["adapter"]["exact_structured_answer"] for row in flow_rows),
        }
    report = {
        "model": ft.MODEL_ID,
        "metric": "greedy free generation; strict bare-JSON validity and exact target-object match on untouched holdout",
        "evaluation_scope": f"smoke subset ({len(selected)} cases)" if args.smoke else "selected untouched holdout cases",
        "max_new_tokens": args.max_new_tokens,
        "database": "not accessed",
        "cases": rows,
        "by_flow": by_flow,
        "base_strict_json": sum(row["base"]["strict_json"] for row in rows),
        "adapter_strict_json": sum(row["adapter"]["strict_json"] for row in rows),
        "base_schema_valid": sum(row["base"]["schema_valid"] for row in rows),
        "adapter_schema_valid": sum(row["adapter"]["schema_valid"] for row in rows),
        "base_exact": sum(row["base"]["exact_structured_answer"] for row in rows),
        "adapter_exact": sum(row["adapter"]["exact_structured_answer"] for row in rows),
    }
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    partial_output.unlink(missing_ok=True)
    print(json.dumps({
        key: report[key] for key in (
            "metric", "evaluation_scope", "base_strict_json", "adapter_strict_json",
            "base_schema_valid", "adapter_schema_valid",
            "base_exact", "adapter_exact", "by_flow", "database",
        )
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
