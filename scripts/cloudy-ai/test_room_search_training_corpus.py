"""Validate the curated room-search corpus against the current safe local flow."""
import json
import unittest
from pathlib import Path

import id_lab
import id_v3
from worker import handle_request


CORPUS = json.loads(
    Path(__file__).parents[2]
    .joinpath("data/cloudy-guest/v2/room-search-corpus.json")
    .read_text(encoding="utf-8")
)
FILTER_KEYS = {"price", "area", "location", "occupants", "amenities"}


class RoomSearchTrainingCorpusTests(unittest.TestCase):
    def test_corpus_has_separate_reference_and_holdout_splits(self):
        training = CORPUS["training_reference"]
        holdout = CORPUS["holdout"]
        self.assertGreaterEqual(len(training), 20)
        self.assertGreaterEqual(len(holdout), 10)
        cases = training + holdout
        self.assertEqual(len({case["id"] for case in cases}), len(cases))
        self.assertEqual(len({case["message"] for case in cases}), len(cases))
        self.assertEqual(CORPUS["status"], "used_in_local_qwen3_candidate_training_only")

    def test_targets_obey_confirmation_and_clarification_boundaries(self):
        for case in CORPUS["training_reference"] + CORPUS["holdout"]:
            with self.subTest(case=case["id"]):
                target = case["target"]
                if target["status"] == "ready":
                    self.assertEqual(set(target["filters"]), FILTER_KEYS)
                    self.assertIn(target["next_action"], {"ask_guest_to_confirm", "ask_guest_to_confirm_all"})
                else:
                    self.assertTrue(target.get("clarification"))
                    self.assertNotIn("filters", target)

    def test_examples_follow_the_deterministic_parser_and_confirmation_gate(self):
        for case in CORPUS["training_reference"] + CORPUS["holdout"]:
            with self.subTest(case=case["id"]):
                def extract(question):
                    candidates = id_lab.candidates(question)
                    result = id_v3.finish(question, candidates, {
                        "intent": case.get("model_intent", "search_rooms"),
                        "decisions": {candidate["id"]: "include" for candidate in candidates},
                    })
                    return result

                body = {"message": case["message"], "mode": case["mode"]}
                if "context" in case:
                    body["context"] = case["context"]
                actual = handle_request(body, extract)
                actual_status = "ready" if actual["status"] == "awaiting_confirmation" else actual["status"]
                expected = case["target"]
                self.assertEqual(actual_status, expected["status"], actual)
                if expected["status"] == "ready":
                    self.assertEqual(actual.get("context"), expected["filters"], actual)
                else:
                    self.assertIsNone(actual.get("context"), actual)


if __name__ == "__main__":
    unittest.main()
