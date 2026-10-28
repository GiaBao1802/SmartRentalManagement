# Cloudy local AI

Development-only integration of the existing mascot with Ollama `qwen3:1.7b` and `data/room-ai/v1/rooms.json`. All 300 rooms are synthetic. No PostgreSQL, SQL generation, booking, training or paid cloud API is used.

## Run from the repository root

1. Install Python 3.10+ (standard library only) and Ollama; ensure `python --version` works.
2. Run `ollama pull qwen3:1.7b` once if the model is missing. Keep Ollama running on `127.0.0.1:11434`.
3. Run `npm run dev --workspace=@goctro/frontend` and open `http://localhost:3000/landing` (use the port printed by Next if different).
4. Click Cloudy and send `Tìm phòng ở Bến Nắng giá dưới 4 triệu`.

If Python is not on PATH, set `$env:CLOUDY_PYTHON = 'C:\path\to\python.exe'` before starting Next. The launcher uses no shell. Existing management pages still have their usual backend requirements; this chat route reads only JSON.

Cloudy first summarizes the filters without searching rooms. Click **Đúng rồi, tìm phòng** to retrieve, or **Sửa yêu cầu** to edit and invalidate the old proposal. Both new and continued searches require confirmation. Expected confirmed example: 14 matches, top 5 sorted by rent then ID. Prices exclude utilities. Each response labels the source as synthetic. Choose **Lọc mới** to discard old conditions, or **Lọc tiếp** to keep accepted filters and update a field. Example: Bến Nắng below 4 million → thêm máy lạnh → dưới 3 triệu retains Bến Nắng and AC. An updated numeric field replaces its previous bounds. Exact commands such as `bỏ giới hạn giá` and `bỏ điều kiện máy lạnh` remove that constraint. Vague requests such as “rẻ hơn nữa” still require an explicit amount. Context lives in the current chat service memory and resets with the existing session boundaries; raw messages are never sent as history. New-search clarification clears old context; continuation clarification preserves the last accepted filters.

## Boundaries

Only development mode and same-origin loopback requests are accepted. Production sending remains disabled and the endpoint returns 404. One request is admitted per Next process; another returns 429. The worker has a 110-second deadline and the Ollama HTTP call a 90-second timeout. Closing chat aborts the browser request; server cancellation kills the Python worker when propagated, but does not guarantee immediate termination of Ollama computation. Retry is available; errors do not silently fall back to mock answers.

The model classifies source candidates into JSON; deterministic guards validate conditions and filter the catalog. Unsupported or ambiguous conditions require clarification. No automatic constraint relaxation. Returned text is rendered as plain text. This is not an authenticated production AI service.

## Verification

```powershell
python -B -m unittest discover -s scripts/cloudy-ai -p "test_*.py"
node node_modules/tsx/dist/cli.mjs --test frontend/src/app/components/cloudy-chat-service.test.ts frontend/src/app/components/cloudy-chat-session-key.test.ts frontend/src/app/components/cloudy-suggestion-source.test.ts frontend/src/lib/cloudy-local-server.test.ts
npm run typecheck --workspace=@goctro/frontend
```

`id_v3.py`, `id_lab.py`, `id_normalizer.py`, `filter_v2.py`, `filter_v3.py` and `room_catalog_lab.py` were brought into this repository from the earlier local model-understanding lab. Only `id_v3.extract` is the active model path; earlier helpers support parsing/validation. The catalog adapter now resolves the repository dataset rather than an external personal path. Earlier lab results are targeted regression evidence, not a general accuracy guarantee.
