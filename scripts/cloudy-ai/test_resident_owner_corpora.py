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
                self.assertEqual(len(reference), 28 if assistant == "resident" else 92)
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
                    self.assertEqual({task_counts[key] for key in OWNER_TASKS if key != "clarify"}, {8})
                    self.assertEqual(task_counts["clarify"], 12)
                self.assertTrue(all(case.get("boundary") for case in cases))

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
