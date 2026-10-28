"""Fast deterministic checks for the public Cloudy room-search question bank."""
import json
import unittest
from pathlib import Path

import id_lab
import id_v3


BANK = json.loads(Path(__file__).with_name("room_search_question_bank.json").read_text(encoding="utf-8"))


class RoomSearchQuestionBankTests(unittest.TestCase):
    def test_case_ids_are_unique_and_expected_statuses_are_valid(self):
        cases = BANK["cases"]
        self.assertGreaterEqual(len(cases), 12)
        self.assertEqual(len({case["id"] for case in cases}), len(cases))
        self.assertTrue(all(case["expected_status"] in {"ready", "needs_clarification"} for case in cases))

    def test_deterministic_parser_matches_each_case_without_calling_ollama(self):
        for case in BANK["cases"]:
            with self.subTest(case=case["id"]):
                candidates = id_lab.candidates(case["question"])
                result = id_v3.finish(case["question"], candidates, {
                    "intent": "search_rooms",
                    "decisions": {candidate["id"]: "include" for candidate in candidates},
                })
                self.assertEqual(result["status"], case["expected_status"], result)
                if "expected_filters" in case:
                    self.assertEqual(result.get("filters"), case["expected_filters"], result)
                if "expected_draft_filters" in case:
                    draft = result.get("draftFilters") or result.get("filters") or {}
                    for field, expected in case["expected_draft_filters"].items():
                        self.assertEqual(draft.get(field), expected, result)
                if "required_hint" in case:
                    hints = result.get("clarificationHints") or result.get("draftClarificationHints") or []
                    self.assertTrue(any(
                        hint.get("type") == case["required_hint"]["type"]
                        and hint.get("value") == case["required_hint"]["value"]
                        for hint in hints
                    ), result)


if __name__ == "__main__":
    unittest.main()
