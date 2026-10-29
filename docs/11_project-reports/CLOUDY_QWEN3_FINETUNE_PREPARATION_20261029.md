# Fine-tune Qwen3 1.7B cục bộ cho Cloudy — 2026-10-29

## Kết quả

Đã fine-tune cục bộ Qwen3 1.7B bằng QLoRA 4-bit NF4 trên CPU cho ba luồng Guest, Resident và Owner. Pipeline lấy 28 câu tổng hợp mỗi luồng (84 câu), giữ riêng 12 holdout mỗi luồng (36 câu), chỉ tính loss trên JSON answer, bật gradient checkpointing, batch 1, 1 epoch và seed 42. RAM trống trước train khoảng 3.7 GiB; không đóng ứng dụng người dùng.

Adapter: `%LOCALAPPDATA%\GocTro\cloudy-qwen3-candidate-20261029\adapter\adapter_model.safetensors` (34,916,720 bytes; 8,716,288 tham số trainable; 392 tensors; tất cả finite). SHA-256: `D7267B1A07B37F30E8A7F2A649B772FD15162F6BE4029CE348AD36B0C4321505`.

## Đánh giá holdout

Đánh giá teacher-forced: mỗi token đáp án được dự đoán khi token trước đó trong đáp án chuẩn đã được cấp. Đây không phải đo sinh tự do. Trung bình token accuracy tăng từ **48.5% lên 65.2%** trên 36 câu; từng luồng đều tăng:

| Luồng | Qwen gốc | Adapter |
|---|---:|---:|
| Guest tìm phòng | 45.1% | 55.8% |
| Resident | 54.0% | 68.6% |
| Owner | 46.4% | 71.1% |
| Chung | 48.5% | 65.2% |

Khớp toàn bộ chuỗi JSON chính xác: **0/36** cả trước và sau fine-tune. Smoke test sinh tự do ba câu đại diện cũng **0/3** cho cả base và adapter. Trên câu hỏi hóa đơn cư dân, adapter phân loại thành `payment` thay vì `invoice`; câu Owner lặp trường `next_action`. Vì vậy token accuracy tăng chưa chứng minh đầu ra sinh tự do đúng JSON; adapter **không đạt điều kiện tích hợp runtime**. Holdout nhỏ cũng chưa chứng minh chất lượng tổng quát.

## Kiểm tra đã chạy

- Dry run, Python compile và evaluator smoke compile: **PASS** — 84/36, split disjoint, tối đa 160 token với prompt đã rút gọn, answer-only loss.
- Corpus tests: **7/7 PASS**; adapter safetensors đọc lại được và mọi trọng số đều finite.
- Training: **PASS**, 1 epoch/21 optimizer steps, loss cuối trung bình 2.7123; file baseline và candidate evaluation đã lưu cạnh adapter.
- Greedy generation smoke: **FAIL quality gate** — base 0/3, adapter 0/3; chi tiết tại `generation-smoke.json`.
- Database: **không truy cập**. Runtime/Ollama: **không thay đổi**. Publish/push: **không thực hiện**.

## Giới hạn và bước tiếp

Đây là bằng chứng thực tế nhóm đã chạy fine-tune cục bộ với quy trình lưu cấu hình, log, checksum và holdout; không phải fine-tune trên dữ liệu khách thật. Cần cải thiện định dạng đầu ra và phân loại an toàn, rồi đánh giá sinh tự do trên corpus lớn hơn trước khi cân nhắc tích hợp. Adapter vẫn là file cục bộ, chưa được đóng gói/chuyển sang GGUF/Ollama.

Nguồn kỹ thuật: model card [Qwen/Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B) (Apache-2.0), tài liệu chính thức [Transformers PEFT](https://huggingface.co/docs/transformers/peft), và [bitsandbytes CPU/QLoRA](https://huggingface.co/docs/bitsandbytes/installation). Pipeline và adapter chưa được tích hợp vào runtime.
