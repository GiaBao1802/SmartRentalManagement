# Cloudy Qwen3 fine-tuning iteration — 2026-10-29

## Result

An Owner-only QLoRA candidate now beats the base model on the fixed 12-case Owner holdout in free generation, but it is **not ready for runtime**. It produced an exact target object on 6/12 cases versus 4/12 for the base, bare JSON on 12/12 versus 11/12, and a schema-valid task/action pair on 11/12 versus 9/12. It still misclassified an explicit request to mark an invoice paid and an ambiguous request. The payment request was emitted as an unrecognized `payment` task instead of `clarify`/`reject_write_from_advisor`; runtime schema validation would have to reject that output.

No adapter was promoted. The production/local app model, Ollama, database, APIs and runtime prompts were not changed. No database was accessed.

## Experiments

The first mixed-flow experiment is recorded in [the preparation report](CLOUDY_QWEN3_FINETUNE_PREPARATION_20261029.md): 84 synthetic examples across Guest, Resident and Owner, 36 untouched holdouts, one CPU epoch. Teacher-forced token accuracy increased 48.5%→65.2%, but free-generation smoke stayed 0/3 and exact full answers stayed 0/36.

An Owner-only run on the original 28 train / 12 holdout corpus, with two epochs and a lower learning rate, increased teacher-forced token accuracy 46.4%→67.3%, but produced recursively repeated keys on the representative generation case. It was rejected.

A second Owner-only run added an explicit two-key JSON contract. Its 12-case free-generation evaluation produced strict bare JSON on 12/12 versus 3/12 for the base, but only 2/12 exact target objects versus 1/12 for the base. It improved formatting more than intent understanding and was not accepted.

The current experiment uses the synthetic balanced [Owner corpus V2](../../data/cloudy-owner/v2/assistant-corpus.json): 68 training examples and the same 12 untouched V1 holdouts. Each of the ten read tasks has six examples; `clarify` has eight. The system prompt now defines each label and its permitted next action. Training used Qwen3-1.7B, CPU QLoRA NF4, rank 8, one epoch, learning rate `5e-5`, max length 320, 8 threads and 17 optimizer steps. Runtime was 2,424 seconds (about 40 minutes); the preflight reported 4.6 GiB available RAM. The longest sample was 304 tokens, so no target was truncated.

| Measure on the 12 Owner holdouts | Base | Owner V2 adapter |
|---|---:|---:|
| Teacher-forced answer-token accuracy | 85.6% | 95.9% |
| Exact teacher-forced answers | 0/12 | 5/12 |
| Bare JSON in free generation | 11/12 | 12/12 |
| Schema-valid task/action pair | 9/12 | 11/12 |
| Exact free-generation target object | 4/12 | 6/12 |

The adapter’s remaining errors are meaningful: `utilities` was classified as `electricity_ranking`; `overview` as `requests`; `residents` as `missing`; `vehicle_counts` as `available_rooms`; the explicit payment update was classified as an unknown task and routed to a read action; and an ambiguous request was classified as `requests`. The write request was not executed, but the model output did not meet the expected stop-and-reject behavior.

## Evaluation and files

The generation evaluator now compares base and adapter on the same greedy prompts, separately checks bare JSON, rejects duplicate keys, validates task/action schemas, stops at a complete JSON object, and saves partial results after each case. The full Owner V2 result is in the local candidate directory alongside the baseline, candidate evaluation and training report. Adapter file SHA-256:

`7376AA0070D6550D47D5334C8642D8A718BD6415DB31590F0D43B977C8AE0F05`

Corpus dry-run confirmed 68 train / 12 holdout, zero ID/message overlap, answer-only loss, and 304 maximum tokens under the 320-token limit. Python Cloudy tests pass **66/66**.

## Decision and next evidence needed

This is a measurable improvement for the Owner flow, not a deployment-quality result. A 6/12 exact free-generation score and the failed write-intent case leave too much uncertainty. Repeating epochs over the same synthetic data risks memorization rather than correcting Cloudy’s real misunderstandings.

The next useful training set should contain human-reviewed Vietnamese examples, especially utilities versus electricity ranking, missing billing data versus resident records, room vacancy versus vehicle assignments, overview versus requests, explicit write requests, and ambiguous references. The V1.17 opt-in unresolved-feedback review flow is not yet rolled out and has no verified Superadmin account, so no customer feedback was available for this experiment. Do not promote any candidate until it passes a larger, independently reviewed holdout with zero unsafe write-intent misses.

The repository’s primary Exact Next Task remains the V1.17 rollout after the owner supplies a verified Superadmin email and explicitly authorizes the target. This experiment changes no requirement, API contract, database schema or runtime behavior.
