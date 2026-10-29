"""Train and evaluate a local LoRA candidate for Cloudy using curated synthetic corpora.

This is an offline experiment: it never calls the app, a database, Ollama, or a hosted
training service. The holdout split is only used for generation/evaluation.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
MODEL_ID = "Qwen/Qwen3-1.7B"
SYSTEMS = {
    "guest": (
        "Cloudy Vietnamese room-search parser. Extract rental filters and safe next_action. "
        "Return only the requested JSON object. Never search listings or claim availability."
    ),
    "resident": (
        "Cloudy for authenticated renters. Classify intent and safe next_action; return only "
        "the requested JSON. Never execute bookings, meter submissions, room/equipment or "
        "invoice updates, or requests; the app requires explicit confirmation."
    ),
    "owner": (
        "Cloudy Owner intent classifier. Return one bare JSON object with exactly task and "
        "next_action; no markdown, prose, extra or repeated keys. Task meanings: unpaid=payment "
        "status/due; utilities=electricity/water amount, rate, use or explanation; missing=missing "
        "billing readings/fields; overview=pending-work summary; requests=repairs, complaints or "
        "service requests; residents=count/registration; available_rooms=vacant rooms; "
        "vehicle_counts=active vehicle assignments; electricity_ranking=finalized kWh ranking; "
        "frequent_requests=common request aggregate; clarify=ambiguous, unsupported or write. "
        "Action values: read_only_after_scope_resolution, read_only_aggregate, "
        "read_only_active_assignments, read_only_finalized_meter_snapshots, "
        "read_only_with_coverage_limit, reject_write_from_advisor, "
        "require_separate_confirmed_workflow, clarify_in_chat. Map residents=read_only_aggregate; "
        "vehicle_counts=read_only_active_assignments; "
        "electricity_ranking=read_only_finalized_meter_snapshots; "
        "frequent_requests=read_only_with_coverage_limit; other reads=read_only_after_scope_resolution. "
        "Direct writes=reject_write_from_advisor; "
        "reminders=require_separate_confirmed_workflow; unclear=clarify_in_chat. Owner scope only; "
        "never mutate records or expose resident personal data."
    ),
}
CORPORA = {
    "guest": ROOT / "data/cloudy-guest/v2/room-search-corpus.json",
    "resident": ROOT / "data/cloudy-resident/v1/assistant-corpus.json",
    "owner": ROOT / "data/cloudy-owner/v2/assistant-corpus.json",
}
OWNER_TARGETED_TRAINING = ROOT / "data/cloudy-owner/v3/targeted-training.json"


def load_cases(split: str) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    key = "training_reference" if split == "train" else "holdout"
    for flow, path in CORPORA.items():
        corpus = json.loads(path.read_text(encoding="utf-8"))
        for item in corpus[key]:
            mode = item.get("mode")
            request = f"Chế độ: {mode}\n" if mode else ""
            request += item["message"]
            cases.append({
                "flow": flow,
                "id": item["id"],
                "messages": [
                    {"role": "system", "content": SYSTEMS[flow]},
                    {"role": "user", "content": request},
                    {"role": "assistant", "content": json.dumps(item["target"], ensure_ascii=False, separators=(",", ":"))},
                ],
                "target": item["target"],
            })
    if split == "train":
        corpus = json.loads(OWNER_TARGETED_TRAINING.read_text(encoding="utf-8"))
        for item in corpus["training_reference"]:
            cases.append({
                "flow": "owner",
                "id": item["id"],
                "messages": [
                    {"role": "system", "content": SYSTEMS["owner"]},
                    {"role": "user", "content": item["message"]},
                    {"role": "assistant", "content": json.dumps(item["target"], ensure_ascii=False, separators=(",", ":"))},
                ],
                "target": item["target"],
            })
    return cases


def tokenize_training(cases: list[dict[str, Any]], tokenizer: Any, max_length: int) -> list[dict[str, list[int]]]:
    encoded: list[dict[str, list[int]]] = []
    for case in cases:
        messages = case["messages"]
        prompt_ids = tokenizer.apply_chat_template(
            messages[:-1], tokenize=True, add_generation_prompt=True, enable_thinking=False
        )
        full_ids = tokenizer.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=False, enable_thinking=False
        )
        # Safety: only train on the answer tokens, never the prompt.
        if full_ids[: len(prompt_ids)] != prompt_ids:
            raise ValueError(f"Chat template prompt is not a prefix for {case['flow']}:{case['id']}")
        if len(full_ids) > max_length:
            raise ValueError(
                f"Training sample {case['flow']}:{case['id']} has {len(full_ids)} tokens, "
                f"exceeding max_length={max_length}; refusing to truncate the target."
            )
        labels = [-100] * min(len(prompt_ids), len(full_ids)) + full_ids[len(prompt_ids):]
        if not any(label != -100 for label in labels):
            raise ValueError(f"No answer tokens survived truncation for {case['flow']}:{case['id']}")
        encoded.append({"input_ids": full_ids, "attention_mask": [1] * len(full_ids), "labels": labels})
    return encoded


class PadBatch:
    def __init__(self, pad_token_id: int):
        self.pad_token_id = pad_token_id

    def __call__(self, features: list[dict[str, list[int]]]) -> dict[str, torch.Tensor]:
        import torch

        width = max(len(item["input_ids"]) for item in features)
        batch_ids, batch_masks, batch_labels = [], [], []
        for item in features:
            padding = width - len(item["input_ids"])
            batch_ids.append(item["input_ids"] + [self.pad_token_id] * padding)
            batch_masks.append(item["attention_mask"] + [0] * padding)
            batch_labels.append(item["labels"] + [-100] * padding)
        return {
            "input_ids": torch.tensor(batch_ids, dtype=torch.long),
            "attention_mask": torch.tensor(batch_masks, dtype=torch.long),
            "labels": torch.tensor(batch_labels, dtype=torch.long),
        }


def evaluate(model: Any, tokenizer: Any, cases: list[dict[str, Any]]) -> dict[str, Any]:
    import torch

    model.eval()
    results = []
    with torch.inference_mode():
        for case in cases:
            messages = case["messages"]
            prompt_ids = tokenizer.apply_chat_template(
                messages[:-1], tokenize=True, add_generation_prompt=True, enable_thinking=False
            )
            all_ids = tokenizer.apply_chat_template(
                messages, tokenize=True, add_generation_prompt=False, enable_thinking=False
            )
            if all_ids[:len(prompt_ids)] != prompt_ids:
                raise ValueError(f"Evaluation prompt is not a prefix for {case['flow']}:{case['id']}")
            input_ids = torch.tensor([all_ids], dtype=torch.long)
            output = model(input_ids=input_ids, attention_mask=torch.ones_like(input_ids), use_cache=False)
            gold = input_ids[0, len(prompt_ids):]
            predictions = output.logits[0, len(prompt_ids) - 1:len(all_ids) - 1].argmax(dim=-1)
            token_accuracy = float((predictions == gold).float().mean().item()) if len(gold) else 0.0
            exact = bool(torch.equal(predictions, gold))
            predicted_text = tokenizer.decode(predictions.tolist(), skip_special_tokens=True)
            results.append({
                "flow": case["flow"],
                "id": case["id"],
                "expected": json.dumps(case["target"], ensure_ascii=False, separators=(",", ":")),
                "teacher_forced_prediction": predicted_text[:1200],
                "answer_tokens": len(gold),
                "token_accuracy": token_accuracy,
                "exact_answer": exact,
            })
            del output, input_ids, gold, predictions
            print(f"eval {case['flow']} {case['id']}: token-accuracy={token_accuracy:.3f}, exact={'yes' if exact else 'no'}", flush=True)
    by_flow = {}
    for flow in SYSTEMS:
        flow_results = [item for item in results if item["flow"] == flow]
        by_flow[flow] = {
            "mean_token_accuracy": sum(item["token_accuracy"] for item in flow_results) / max(1, len(flow_results)),
            "exact_answers": sum(item["exact_answer"] for item in flow_results),
            "total": len(flow_results),
        }
    return {
        "metric": "teacher-forced answer-token accuracy; each answer token is predicted with the gold answer prefix",
        "mean_token_accuracy": sum(item["token_accuracy"] for item in results) / max(1, len(results)),
        "exact_answers": sum(item["exact_answer"] for item in results),
        "total": len(results),
        "by_flow": by_flow,
        "results": results,
    }


def main() -> None:
    import psutil
    import torch
    from peft import LoraConfig, TaskType, get_peft_model, prepare_model_for_kbit_training
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, Trainer, TrainingArguments

    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, help="Local directory for adapter and evaluation report")
    parser.add_argument("--epochs", type=float, default=1)
    parser.add_argument("--max-length", type=int, default=384)
    parser.add_argument("--threads", type=int, default=min(8, os.cpu_count() or 4))
    parser.add_argument("--flows", nargs="+", choices=tuple(SYSTEMS), default=list(SYSTEMS),
                        help="Train/evaluate only selected Cloudy flows (default: all)")
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--dry-run", action="store_true", help="Validate train/holdout formatting without loading model weights")
    args = parser.parse_args()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(args.threads)
    torch.manual_seed(42)
    print(f"Preparing tokenizer for {MODEL_ID}; CPU threads={args.threads}", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=False)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    train_cases = [case for case in load_cases("train") if case["flow"] in args.flows]
    holdout_cases = [case for case in load_cases("holdout") if case["flow"] in args.flows]
    encoded = tokenize_training(train_cases, tokenizer, args.max_length)
    train_ids = {(item["flow"], item["id"]) for item in train_cases}
    holdout_ids = {(item["flow"], item["id"]) for item in holdout_cases}
    if train_ids & holdout_ids:
        raise ValueError("Training and holdout identifiers overlap")
    if args.dry_run:
        print(json.dumps({
            "base_model": MODEL_ID,
            "train_examples": len(encoded),
            "holdout_examples": len(holdout_cases),
            "train_examples_by_flow": {flow: sum(item["flow"] == flow for item in train_cases) for flow in SYSTEMS},
            "holdout_examples_by_flow": {flow: sum(item["flow"] == flow for item in holdout_cases) for flow in SYSTEMS},
            "selected_flows": args.flows,
            "max_training_tokens": max(len(item["input_ids"]) for item in encoded),
            "answer_only_loss": all(any(label != -100 for label in item["labels"]) for item in encoded),
            "split_overlap": len(train_ids & holdout_ids),
            "database": "not accessed",
        }, ensure_ascii=False, indent=2), flush=True)
        return
    available_gb = psutil.virtual_memory().available / (1024 ** 3)
    if available_gb < 2:
        raise RuntimeError(
            f"Training stopped before loading model weights: only {available_gb:.1f} GiB RAM is available; "
            "this CPU QLoRA run requires at least 2 GiB free to reduce the risk of exhausting system memory."
        )
    print(f"QLoRA preflight passed with {available_gb:.1f} GiB available RAM", flush=True)
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.float32,
    )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=quantization,
        device_map={"": "cpu"},
        low_cpu_mem_usage=True,
        trust_remote_code=False,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False})

    print(f"Loaded {len(train_cases)} synthetic training examples and {len(holdout_cases)} separate holdout examples", flush=True)
    print("Evaluating unchanged base model on holdout before training", flush=True)
    baseline = evaluate(model, tokenizer, holdout_cases)
    (output_dir / "baseline-evaluation.json").write_text(json.dumps(baseline, ensure_ascii=False, indent=2), encoding="utf-8")

    lora = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        bias="none",
    )
    model = get_peft_model(model, lora)
    model.enable_input_require_grads()
    model.print_trainable_parameters()
    train_dataset = encoded
    started = time.time()
    training = TrainingArguments(
        output_dir=str(output_dir / "trainer-tmp"),
        use_cpu=True,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        num_train_epochs=args.epochs,
        learning_rate=args.learning_rate,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        optim="adamw_torch",
        max_grad_norm=1.0,
        logging_strategy="steps",
        logging_steps=1,
        save_strategy="no",
        report_to="none",
        dataloader_num_workers=0,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        remove_unused_columns=False,
        seed=42,
        data_seed=42,
        disable_tqdm=False,
    )
    trainer = Trainer(
        model=model,
        args=training,
        train_dataset=train_dataset,
        data_collator=PadBatch(tokenizer.pad_token_id),
    )
    trainer.train()
    training_seconds = round(time.time() - started, 2)
    model.save_pretrained(output_dir / "adapter")
    tokenizer.save_pretrained(output_dir / "tokenizer")
    print("Evaluating trained adapter on the same untouched holdout", flush=True)
    candidate = evaluate(model, tokenizer, holdout_cases)
    report = {
        "base_model": MODEL_ID,
        "method": "QLoRA adapter, CPU, NF4 4-bit base weights with double quantization, fp32 compute, assistant-answer-only loss",
        "license": "Apache-2.0 (upstream Qwen3-1.7B)",
        "dataset": {"synthetic_train_examples": len(train_cases), "untouched_holdout_examples": len(holdout_cases), "flows": args.flows},
        "config": {"epochs": args.epochs, "learning_rate": args.learning_rate, "max_length": args.max_length, "lora_r": 8, "lora_alpha": 16, "quantization": "NF4 4-bit + double quantization", "seed": 42},
        "training_seconds": training_seconds,
        "baseline": {key: value for key, value in baseline.items() if key != "results"},
        "candidate": {key: value for key, value in candidate.items() if key != "results"},
        "meets_no_regression_gate": candidate["mean_token_accuracy"] >= baseline["mean_token_accuracy"] and all(
            candidate["by_flow"][flow]["mean_token_accuracy"] >= baseline["by_flow"][flow]["mean_token_accuracy"] for flow in args.flows
        ),
        "database": "not accessed",
        "runtime_model_changed": False,
    }
    (output_dir / "candidate-evaluation.json").write_text(json.dumps(candidate, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "training-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
