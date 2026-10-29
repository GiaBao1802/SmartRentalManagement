"""Small CPU QLoRA free-generation smoke test; no app or database access."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

ROOT = Path(__file__).resolve().parents[2]
SMOKE_CASES = {"guest": "eval-008", "resident": "test-001", "owner": "test-002"}


def load_training_module() -> Any:
    path = ROOT / "scripts/cloudy-ai/finetune_qwen3_lora.py"
    spec = importlib.util.spec_from_file_location("cloudy_finetune", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load fine-tuning data helpers")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def generate(model: Any, tokenizer: Any, messages: list[dict[str, str]], max_new_tokens: int) -> str:
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
        )
    return tokenizer.decode(output[0, prompt.shape[-1]:], skip_special_tokens=True).strip()


def parse_json(text: str) -> Any:
    start = text.find("{")
    if start < 0:
        return None
    try:
        value, _ = json.JSONDecoder().raw_decode(text[start:])
        return value
    except json.JSONDecodeError:
        return None


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--threads", type=int, default=min(8, os.cpu_count() or 4))
    parser.add_argument("--max-new-tokens", type=int, default=64)
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    ft = load_training_module()
    cases = ft.load_cases("holdout")
    selected = [next(item for item in cases if item["flow"] == flow and item["id"] == case_id)
                for flow, case_id in SMOKE_CASES.items()]
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
    for case in selected:
        with model.disable_adapter():
            base_text = generate(model, tokenizer, case["messages"][:-1], args.max_new_tokens)
        adapter_text = generate(model, tokenizer, case["messages"][:-1], args.max_new_tokens)
        base_json, adapter_json = parse_json(base_text), parse_json(adapter_text)
        rows.append({
            "flow": case["flow"],
            "id": case["id"],
            "expected": case["target"],
            "base": {"text": base_text, "json": base_json, "exact": base_json == case["target"]},
            "adapter": {"text": adapter_text, "json": adapter_json, "exact": adapter_json == case["target"]},
        })
        print(f"generated {case['flow']} {case['id']}", flush=True)
    report = {
        "model": ft.MODEL_ID,
        "metric": "greedy free-generation exact structured answer on a three-case smoke set; not a general benchmark",
        "database": "not accessed",
        "cases": rows,
        "base_exact": sum(row["base"]["exact"] for row in rows),
        "adapter_exact": sum(row["adapter"]["exact"] for row in rows),
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("metric", "base_exact", "adapter_exact", "database")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
