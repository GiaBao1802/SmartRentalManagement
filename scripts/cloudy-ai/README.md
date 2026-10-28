# Cloudy local AI

Development-only integration of the existing mascot with Ollama `qwen3:1.7b`. Guest room retrieval uses the existing public backend API after explicit confirmation. No SQL generation, booking, training or paid cloud API is used. The dataset `data/room-ai/v1/rooms.json` remains only for the standalone dataset/demo tools, not this guest retrieval path.

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

## Verification

```powershell
python -B -m unittest discover -s scripts/cloudy-ai -p "test_*.py"
node node_modules/tsx/dist/cli.mjs --test frontend/src/app/components/cloudy-chat-service.test.ts frontend/src/app/components/cloudy-chat-session-key.test.ts frontend/src/app/components/cloudy-suggestion-source.test.ts frontend/src/lib/cloudy-local-server.test.ts
npm run typecheck --workspace=@goctro/frontend
```

`id_v3.py`, `id_lab.py`, `id_normalizer.py`, `filter_v2.py`, `filter_v3.py` and `room_catalog_lab.py` were brought into this repository from the earlier local model-understanding lab. Only `id_v3.extract` is the active model path; earlier helpers support parsing/validation. The catalog adapter now resolves the repository dataset rather than an external personal path. Earlier lab results are targeted regression evidence, not a general accuracy guarantee.
