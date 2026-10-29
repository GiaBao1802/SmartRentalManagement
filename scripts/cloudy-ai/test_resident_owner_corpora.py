"""Validate the separate, non-runtime Resident and Owner Cloudy corpora."""
import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[2]
CORPORA = {
    "resident": json.loads(ROOT.joinpath("data/cloudy-resident/v1/assistant-corpus.json").read_text(encoding="utf-8")),
    "owner": json.loads(ROOT.joinpath("data/cloudy-owner/v2/assistant-corpus.json").read_text(encoding="utf-8")),
}
OWNER_TARGETED = json.loads(ROOT.joinpath("data/cloudy-owner/v3/targeted-training.json").read_text(encoding="utf-8"))
OWNER_INDEPENDENT_HOLDOUT = json.loads(ROOT.joinpath("data/cloudy-owner/v3/independent-holdout.json").read_text(encoding="utf-8"))
OWNER_V7_DEVELOPMENT = json.loads(ROOT.joinpath("data/cloudy-owner/v4/development-training.json").read_text(encoding="utf-8"))
OWNER_V4_HOLDOUT = json.loads(ROOT.joinpath("data/cloudy-owner/v4/independent-holdout.json").read_text(encoding="utf-8"))
OWNER_V8_TARGETED = json.loads(ROOT.joinpath("data/cloudy-owner/v5/targeted-training.json").read_text(encoding="utf-8"))
OWNER_V8_DEVELOPMENT = json.loads(ROOT.joinpath("data/cloudy-owner/v5/development-training.json").read_text(encoding="utf-8"))
OWNER_V5_HOLDOUT = json.loads(ROOT.joinpath("data/cloudy-owner/v5/independent-holdout.json").read_text(encoding="utf-8"))
RESIDENT_INTENTS = {"services", "meter", "requests", "amenity_choice", "invoice", "help"}
OWNER_TASKS = {
    "unpaid", "utilities", "missing", "overview", "requests", "residents",
    "available_rooms", "vehicle_counts", "electricity_ranking", "frequent_requests", "clarify",
}
RESIDENT_ACTIONS = {
    "read_scoped_invoice", "show_scoped_invoice_targets", "continue_scoped_invoice_lookup",
    "show_scoped_service_catalog", "open_booking_flow_without_submitting",
    "open_eligible_meter_targets_without_submitting", "explain_meter_submission_flow",
    "open_request_review_without_submitting", "ask_existing_service_or_room_equipment",
    "clarify_in_chat", "continue_current_topic_without_booking",
    "open_request_status_without_creating_new_request", "continue_meter_history_without_submitting",
}
OWNER_ACTIONS = {
    "read_only_after_scope_resolution", "read_only_aggregate", "read_only_active_assignments",
    "read_only_finalized_meter_snapshots", "read_only_with_coverage_limit",
    "reject_write_from_advisor", "require_separate_confirmed_workflow", "clarify_in_chat",
}


class ResidentOwnerCorpusTests(unittest.TestCase):
    def test_both_corpora_have_unique_separate_reference_and_holdout_splits(self):
        for assistant, corpus in CORPORA.items():
            with self.subTest(assistant=assistant):
                reference, holdout = corpus["training_reference"], corpus["holdout"]
                self.assertEqual(len(reference), 28 if assistant == "resident" else 120)
                self.assertEqual(len(holdout), 12)
                self.assertFalse({case["id"] for case in reference} & {case["id"] for case in holdout})
                self.assertFalse({case["message"] for case in reference} & {case["message"] for case in holdout})
                cases = reference + holdout
                self.assertEqual(len({case["id"] for case in cases}), len(cases))
                self.assertEqual(len({case["message"] for case in cases}), len(cases))
                if assistant == "resident":
                    self.assertEqual(corpus["status"], "used_in_local_qwen3_candidate_training_only")
                else:
                    self.assertEqual(corpus["version"], 2)
                    self.assertEqual(corpus["status"], "synthetic_balanced_training_candidate_not_runtime")
                    task_counts = {}
                    for case in reference:
                        task = case["target"]["task"]
                        task_counts[task] = task_counts.get(task, 0) + 1
                    self.assertEqual(task_counts, {
                        "unpaid": 8, "utilities": 9, "missing": 8, "overview": 10,
                        "requests": 8, "residents": 11, "available_rooms": 8,
                        "vehicle_counts": 9, "electricity_ranking": 9,
                        "frequent_requests": 8, "clarify": 32,
                    })
                    clarify_actions = {}
                    for case in reference:
                        if case["target"]["task"] == "clarify":
                            action = case["target"]["next_action"]
                            clarify_actions[action] = clarify_actions.get(action, 0) + 1
                    self.assertEqual(clarify_actions, {
                        "reject_write_from_advisor": 18,
                        "clarify_in_chat": 12,
                        "require_separate_confirmed_workflow": 2,
                    })
                self.assertTrue(all(case.get("boundary") for case in cases))

    def test_owner_v3_train_and_independent_holdout_are_disjoint_and_valid(self):
        original = CORPORA["owner"]["training_reference"] + CORPORA["owner"]["holdout"]
        targeted = OWNER_TARGETED["training_reference"]
        independent = OWNER_INDEPENDENT_HOLDOUT["cases"]
        self.assertEqual(OWNER_TARGETED["status"], "agent_curated_from_canonical_requirements_and_existing_owner_failures_not_customer_feedback")
        self.assertEqual(OWNER_INDEPENDENT_HOLDOUT["status"], "independent_agent_curated_holdout_not_customer_feedback")
        self.assertEqual(len(targeted), 28)
        self.assertEqual(len(independent), 34)
        self.assertFalse({case["id"] for case in targeted} & {case["id"] for case in original + independent})
        self.assertFalse({case["id"] for case in independent} & {case["id"] for case in original + targeted})
        original_messages = {case["message"] for case in original}
        targeted_messages = {case["message"] for case in targeted}
        independent_messages = {case["message"] for case in independent}
        self.assertFalse(original_messages & targeted_messages)
        self.assertFalse(original_messages & independent_messages)
        self.assertFalse(targeted_messages & independent_messages)
        for case in targeted + independent:
            with self.subTest(case=case["id"]):
                self.assertIn(case["target"]["task"], OWNER_TASKS)
                self.assertIn(case["target"]["next_action"], OWNER_ACTIONS)
                self.assertTrue(case.get("boundary"))
                if case["target"]["task"] == "clarify":
                    self.assertIn(case["target"]["next_action"], {
                        "reject_write_from_advisor", "require_separate_confirmed_workflow", "clarify_in_chat"
                    })
                else:
                    self.assertNotIn(case["target"]["next_action"], {
                        "reject_write_from_advisor", "require_separate_confirmed_workflow", "clarify_in_chat"
                    })

    def test_owner_v3_examples_have_no_contact_or_identity_values(self):
        sensitive = re.compile(r"\b[\w.+-]+@[\w.-]+\.\w{2,}\b|\b(?:\+?84|0)\d{8,10}\b|\b\d{12}\b", re.I)
        for case in (
            OWNER_TARGETED["training_reference"]
            + OWNER_INDEPENDENT_HOLDOUT["cases"]
            + OWNER_V7_DEVELOPMENT["cases"]
            + OWNER_V4_HOLDOUT["cases"]
            + OWNER_V8_TARGETED["training_reference"]
            + OWNER_V8_DEVELOPMENT["cases"]
            + OWNER_V5_HOLDOUT["cases"]
        ):
            with self.subTest(case=case["id"]):
                self.assertIsNone(sensitive.search(case["message"]))

    def test_v7_and_v8_holdouts_are_reclassified_before_next_training(self):
        self.assertEqual(OWNER_V7_DEVELOPMENT["status"], "agent_curated_development_from_v7_holdout_for_v8_training_not_customer_feedback")
        self.assertEqual(OWNER_V4_HOLDOUT["status"], "independent_agent_curated_holdout_not_customer_feedback")
        self.assertEqual(OWNER_V8_DEVELOPMENT["status"], "agent_curated_development_from_v8_holdout_for_v9_training_not_customer_feedback")
        self.assertEqual(OWNER_V5_HOLDOUT["status"], "independent_agent_curated_holdout_not_customer_feedback")
        old_ids = {case["id"] for case in OWNER_INDEPENDENT_HOLDOUT["cases"]}
        dev_ids = {case["id"] for case in OWNER_V7_DEVELOPMENT["cases"]}
        self.assertEqual(old_ids, dev_ids)
        self.assertEqual(len(OWNER_V4_HOLDOUT["cases"]), 38)
        self.assertEqual(len(OWNER_V8_DEVELOPMENT["cases"]), 38)
        self.assertEqual(len(OWNER_V8_TARGETED["training_reference"]), 20)
        self.assertEqual(len(OWNER_V5_HOLDOUT["cases"]), 40)
        old_v4 = {case["id"]: case for case in OWNER_V4_HOLDOUT["cases"]}
        dev_v8 = {case["id"]: case for case in OWNER_V8_DEVELOPMENT["cases"]}
        self.assertEqual(old_v4.keys(), dev_v8.keys())
        for case_id, previous in old_v4.items():
            self.assertEqual(previous["message"], dev_v8[case_id]["message"])
            self.assertEqual(previous["target"], dev_v8[case_id]["target"])

        original = CORPORA["owner"]["training_reference"] + CORPORA["owner"]["holdout"]
        training = (
            original + OWNER_TARGETED["training_reference"] + OWNER_V7_DEVELOPMENT["cases"]
            + OWNER_V8_TARGETED["training_reference"] + OWNER_V8_DEVELOPMENT["cases"]
        )
        train_ids = {case["id"] for case in training}
        eval_ids = {case["id"] for case in OWNER_V5_HOLDOUT["cases"]}
        train_messages = {case["message"] for case in training}
        eval_messages = {case["message"] for case in OWNER_V5_HOLDOUT["cases"]}
        self.assertFalse(train_ids & eval_ids)
        self.assertFalse(train_messages & eval_messages)
        all_ids = [case["id"] for case in OWNER_V8_TARGETED["training_reference"]]
        self.assertEqual(len(all_ids), len(set(all_ids)))
        for case in OWNER_V8_TARGETED["training_reference"] + OWNER_V8_DEVELOPMENT["cases"] + OWNER_V5_HOLDOUT["cases"]:
            with self.subTest(case=case["id"]):
                target = case["target"]
                self.assertIn(target["task"], OWNER_TASKS)
                self.assertIn(target["next_action"], OWNER_ACTIONS)
                self.assertTrue(case.get("boundary"))
                if target["task"] == "clarify":
                    self.assertIn(target["next_action"], {
                        "reject_write_from_advisor", "require_separate_confirmed_workflow", "clarify_in_chat"
                    })
                else:
                    self.assertNotIn(target["next_action"], {
                        "reject_write_from_advisor", "require_separate_confirmed_workflow", "clarify_in_chat"
                    })

    def test_resident_targets_match_known_intents_and_safe_next_steps(self):
        corpus = CORPORA["resident"]
        for case in corpus["training_reference"] + corpus["holdout"]:
            with self.subTest(case=case["id"]):
                target = case["target"]
                self.assertIn(target["intent"], RESIDENT_INTENTS)
                self.assertIn(target["next_action"], RESIDENT_ACTIONS)
                self.assertNotIn("room_id", case)
                self.assertNotIn("invoice_id", case)
                if "context" in case:
                    self.assertEqual(set(case["context"]), {"last_intent"})
                    self.assertIn(case["context"]["last_intent"], {"services", "meter", "requests", "invoice"})

    def test_owner_targets_are_read_only_or_stop_before_mutation(self):
        corpus = CORPORA["owner"]
        for case in corpus["training_reference"] + corpus["holdout"]:
            with self.subTest(case=case["id"]):
                target = case["target"]
                self.assertIn(target["task"], OWNER_TASKS)
                self.assertIn(target["next_action"], OWNER_ACTIONS)
                self.assertNotIn("owner_id", case)
                self.assertNotIn("resident_id", case)
                self.assertNotIn("invoice_id", case)
                if target["task"] == "clarify":
                    self.assertIn(target["next_action"], {"reject_write_from_advisor", "require_separate_confirmed_workflow", "clarify_in_chat"})
                else:
                    self.assertNotEqual(target["next_action"], "reject_write_from_advisor")

    def test_examples_do_not_embed_contact_or_identity_values(self):
        sensitive = re.compile(r"\b[\w.+-]+@[\w.-]+\.\w{2,}\b|\b(?:\+?84|0)\d{8,10}\b|\b\d{12}\b", re.I)
        for assistant, corpus in CORPORA.items():
            for case in corpus["training_reference"] + corpus["holdout"]:
                with self.subTest(assistant=assistant, case=case["id"]):
                    self.assertIsNone(sensitive.search(case["message"]))


if __name__ == "__main__":
    unittest.main()
