# Cloudy local AI

Development-only integration of the existing mascot with Ollama `qwen3:1.7b`. Guest room retrieval uses the existing public backend API after explicit confirmation. Runtime does not use SQL generation, automatic booking, the local fine-tuned adapter, or a paid cloud API. The dataset `data/room-ai/v1/rooms.json` remains only for the standalone dataset/demo tools, not this guest retrieval path. A QLoRA candidate has been trained and evaluated locally; its free-generation smoke failed (0/3 exact structured answers), so it must not be used by the app. Runtime still uses the original Ollama model.

## Run from the repository root

1. Install Python 3.10+ (standard library only) and Ollama; ensure `python --version` works.
2. Run `ollama pull qwen3:1.7b` once if the model is missing. Keep Ollama running on `127.0.0.1:11434`.
3. Run `npm run dev --workspace=@goctro/frontend` and open `http://localhost:3000/landing` (use the port printed by Next if different).
4. Ensure the regular backend is running against the intended local database, click Cloudy and send `Tìm phòng ở Đà Nẵng dưới 4 triệu cho 2 người`.

If Python is not on PATH, set `$env:CLOUDY_PYTHON = 'C:\path\to\python.exe'` before starting Next. The launcher uses no shell. The guest route itself is development-only; it reads public room records through the configured loopback API base (`NEXT_PUBLIC_API_BASE_URL`, default `http://localhost:4000/api/v1`). It never connects directly to PostgreSQL.

Cloudy first summarizes the filters without searching rooms. Click **Đúng rồi, tìm phòng** to retrieve, or **Sửa yêu cầu** to edit and invalidate the old proposal. Both new and continued searches require confirmation. The route maps rent, area, capacity and requested amenity codes to the public API and checks location text against public province/address fields; it lists up to five rooms sorted by rent. Owners maintain confirmed amenities through the Admin room editor; Cloudy never infers them from descriptions. An unspecified amenity is clarified before retrieval. Results reflect listings public at query time and are not a booking confirmation; prices exclude utilities/fees. Choose **Lọc mới** to discard old conditions, or **Lọc tiếp** to keep accepted conditions and update a field. Context lives in the current chat service memory and resets with the existing session boundaries; raw messages are never sent as history. New-search clarification clears old context; continuation clarification preserves the last accepted filters.

## Boundaries

Only development mode and same-origin loopback requests are accepted. Production sending remains disabled and the endpoint returns 404. One request is admitted per Next process; another returns 429. The worker has a 110-second deadline and the Ollama HTTP call a 90-second timeout. Closing chat aborts the browser request; server cancellation kills the Python worker when propagated, but does not guarantee immediate termination of Ollama computation. Retry is available; errors do not silently fall back to mock answers.

The model returns filter JSON; deterministic guards validate it and, only after confirmation, a read-only guest route calls the public API. Unsupported or ambiguous conditions require clarification. No automatic constraint relaxation. Returned text is rendered as plain text. This is not an authenticated production AI service.

Known prospective-renter questions that require listing/owner data (deposit, utility charges, lease terms, house rules, room condition, maintenance, viewing/hold, etc.) receive a deterministic reply that acknowledges the topic, states the missing public data, and directs the guest to the existing room-detail contact form. These replies do not make a booking or query rooms. “Cats or dogs” asks which policy the guest needs because selected amenity filters use AND. The chat currently filters room amenities; shared Property Facilities use the Marketplace filter UI.

The 53-case guest-renter question bank lives at `data/cloudy-guest/v1/question-bank.json`. With Ollama running, evaluate it against local Qwen3 1.7B using:

```powershell
python -B scripts/cloudy-ai/evaluate_guest_question_bank.py
```

The separate 18-case held-out edge bank checks informal/no-accent phrasing, conversational updates, unresolved conditions and safe renter FAQs. Evaluate it with `python -B scripts/cloudy-ai/evaluate_guest_edge_question_bank.py`. It also avoids database access; safe FAQ cases are expected to bypass Qwen.

The evaluation does not connect to the database. Deterministic tests cover safe FAQ responses without Ollama.

## Offline Qwen3 fine-tuning candidate

`finetune_qwen3_lora.py` is an offline CPU QLoRA run using 4-bit NF4 base weights and the synthetic training-reference splits from the Guest, Resident, and Owner corpora. It reserves all 36 holdout examples for before/after teacher-forced token-accuracy checks, masks the prompt so loss is applied only to the expected JSON answer, and writes the adapter/evaluation files to a local output folder. It never connects to the app, database, or Ollama. The upstream `Qwen/Qwen3-1.7B` weights were downloaded from Hugging Face; no project examples were uploaded.

The completed local run used 84 training examples (28 per flow), 36 untouched holdouts, 1 epoch, LoRA rank 8, sequence length 192 and 8 CPU threads. Teacher-forced token accuracy increased from 48.5% to 65.2% overall; Guest 45.1%→55.8%, Resident 54.0%→68.6%, Owner 46.4%→71.1%. Exact full-answer token matches were 0/36 both before and after. A reproducible three-case greedy-generation smoke also scored 0/3 for both base and adapter; the adapter misclassified an invoice question and repeated an Owner JSON key. It is not suitable for runtime. The adapter and reports are under `%LOCALAPPDATA%\GocTro\cloudy-qwen3-candidate-20261029`.

Owner-only synthetic iterations at `data/cloudy-owner/v2/assistant-corpus.json` grew to 120 training examples while preserving the same 12 holdouts. V6 used one CPU QLoRA NF4 epoch, rank 8, learning rate `3e-5`, max length 320 and 8 threads. On identical greedy generation, exact objects improved 4/12→9/12, schema-valid task/action 9/12→12/12, and bare JSON 11/12→12/12. The explicit invoice-write holdout still routes to a read-only unpaid query, so the adapter fails the safety gate and is not for runtime. The evaluator uses a local offload folder for low-memory CPU loading. Metrics and checksum are in [the iteration report](../../docs/11_project-reports/CLOUDY_QWEN3_FINETUNE_ITERATION_20261029.md); artifacts are under `%LOCALAPPDATA%\GocTro\cloudy-qwen3-owner-v6-final-20261029`. Stop synthetic-only training until human-reviewed examples and an independently reviewed larger holdout are available.

### Owner V7–V9 corpus additions (not yet trained)

The follow-up synthetic data is stored in `data/cloudy-owner/v4/` and `data/cloudy-owner/v5/`. The current training loader adds 34 V4 development examples, 20 V5 targeted examples, and 38 V5 development examples to the existing Guest/Resident/Owner training references: 296 examples total, including 240 Owner examples. It keeps `data/cloudy-owner/v5/independent-holdout.json` evaluation-only; passing `--extra-owner-holdout` adds its 40 examples to the original 12 Owner holdouts. These are synthetic/agent-authored examples, not customer feedback. V4 development examples were previously used as a holdout while developing V7 and are now explicitly training/development material; they are not evidence of independent model performance. Corpus and split checks run with `python -B scripts/cloudy-ai/test_resident_owner_corpora.py` and `python -B scripts/cloudy-ai/test_finetuned_generation_eval.py`. These tests do not load model weights. No V9 training or generation evaluation has been run, no adapter is promoted, and app runtime still uses the original Ollama model. Keep the independent V5 holdout out of training and require human-reviewed data plus zero unsafe write-intent misses before any promotion.

To reproduce the local environment and run, use Python 3.11 and the pinned CPU dependencies:

```powershell
$venv = Join-Path $env:LOCALAPPDATA 'goctro-cloudy-finetune-venv'
python -m venv $venv
$py = Join-Path $venv 'Scripts\python.exe'
& $py -m pip install torch==2.15.0+cpu --index-url https://download.pytorch.org/whl/cpu
& $py -m pip install -r scripts/cloudy-ai/finetune-requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
```

Run the holdout teacher-forced scorer and free-generation smoke separately:

```powershell
& $py scripts/cloudy-ai/evaluate_finetuned_generation.py --adapter-dir (Join-Path $env:LOCALAPPDATA 'GocTro\cloudy-qwen3-candidate-20261029\adapter') --output (Join-Path $env:LOCALAPPDATA 'GocTro\cloudy-qwen3-candidate-20261029\generation-smoke.json')
```

```powershell
$py = Join-Path $env:LOCALAPPDATA 'goctro-cloudy-finetune-venv\Scripts\python.exe'
& $py scripts/cloudy-ai/finetune_qwen3_lora.py --dry-run --output-dir (Join-Path $env:LOCALAPPDATA 'GocTro\cloudy-qwen3-candidate')
& $py scripts/cloudy-ai/finetune_qwen3_lora.py --output-dir (Join-Path $env:LOCALAPPDATA 'GocTro\cloudy-qwen3-candidate')
```

## Verification

`room_search_question_bank.json` is the public-search regression bank: natural phrases, combined filters, shorthand/no-accent text, and requests that must ask for clarification instead of guessing. It has expected statuses and exact filters. Run the deterministic parser check without Ollama using `python -B -m unittest discover -s scripts/cloudy-ai -p "test_room_search_bank.py"`. For a live local Qwen check (one inference per question, no database reads/writes), run `python -B scripts/cloudy-ai/evaluate_room_search_bank.py`.

`data/cloudy-guest/v2/room-search-corpus.json` adds 28 curated training-reference examples and 12 separate holdout examples, including mixed filters, colloquial shorthand, continued/edited searches, ambiguous requests and unsupported conditions. It is not loaded by the app or used to fine-tune Qwen. Validate its labels and the confirmation/clarification gate without Ollama using `python -B -m unittest discover -s scripts/cloudy-ai -p "test_room_search_training_corpus.py"`. With local Qwen running, evaluate only the holdout split using `python -B scripts/cloudy-ai/evaluate_room_search_corpus.py`; it does not confirm searches or read the room catalog/database, and reports which safe deterministic routes bypassed the model.

For a local, read-only conversational evaluation of all three Cloudy flows, keep Ollama running with `qwen3:1.7b` and run:

```powershell
python -B scripts/cloudy-ai/evaluate_live.py
```

This checks public multi-filter extraction, a continued search that must retain old filters, safe clarification for unsupported distance/negative-amenity requests, Resident intent plus one contextual follow-up, and Owner read-only task classification/routing. Owner authentication is stubbed inside the harness; it does not connect to an application database or write data. A failing case exits nonzero and prints its expected/actual result. These prompts are a small regression set, not a general model accuracy score.

```powershell
python -B -m unittest discover -s scripts/cloudy-ai -p "test_*.py"
node node_modules/tsx/dist/cli.mjs --test frontend/src/app/components/cloudy-chat-service.test.ts frontend/src/app/components/cloudy-chat-session-key.test.ts frontend/src/app/components/cloudy-suggestion-source.test.ts frontend/src/lib/cloudy-local-server.test.ts
npm run typecheck --workspace=@goctro/frontend
```

`id_v3.py`, `id_lab.py`, `id_normalizer.py`, `filter_v2.py`, `filter_v3.py` and `room_catalog_lab.py` were brought into this repository from the earlier local model-understanding lab. Only `id_v3.extract` is the active model path; earlier helpers support parsing/validation. The catalog adapter now resolves the repository dataset rather than an external personal path. Earlier lab results are targeted regression evidence, not a general accuracy guarantee.
