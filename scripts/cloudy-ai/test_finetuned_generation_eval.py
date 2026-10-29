"""Fast tests for strict-format and semantic JSON evaluation without model access."""
import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("evaluate_finetuned_generation.py")
SPEC = importlib.util.spec_from_file_location("cloudy_generation_eval", MODULE_PATH)
assert SPEC and SPEC.loader
EVAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EVAL)


class GenerationJsonEvaluationTests(unittest.TestCase):
    def test_bare_json_is_strict_and_parseable(self):
        parsed, strict, error = EVAL.parse_json('{"task":"utilities"}')
        self.assertEqual(parsed, {"task": "utilities"})
        self.assertTrue(strict)
        self.assertIsNone(error)

    def test_markdown_json_is_parseable_but_not_bare(self):
        parsed, strict, error = EVAL.parse_json('```json\n{"task":"utilities"}\n```')
        self.assertEqual(parsed, {"task": "utilities"})
        self.assertFalse(strict)
        self.assertEqual(error, "output_not_bare_json_object")

    def test_duplicate_keys_are_rejected(self):
        parsed, strict, error = EVAL.parse_json('{"next_action":"a","next_action":"b"}')
        self.assertIsNone(parsed)
        self.assertFalse(strict)
        self.assertIn("duplicate_key:next_action", error or "")

    def test_trailing_text_is_not_bare_json(self):
        parsed, strict, error = EVAL.parse_json('{"task":"utilities"} extra')
        self.assertEqual(parsed, {"task": "utilities"})
        self.assertFalse(strict)
        self.assertEqual(error, "output_not_bare_json_object")

    def test_owner_schema_rejects_unknown_task_and_wrong_action_pair(self):
        self.assertTrue(EVAL.validate_schema("owner", {
            "task": "utilities", "next_action": "read_only_after_scope_resolution"
        }))
        self.assertFalse(EVAL.validate_schema("owner", {
            "task": "payment", "next_action": "read_only_after_scope_resolution"
        }))
        self.assertFalse(EVAL.validate_schema("owner", {
            "task": "vehicle_counts", "next_action": "read_only_after_scope_resolution"
        }))

    def test_owner_schema_rejects_extra_keys_and_unsafe_write_route(self):
        self.assertFalse(EVAL.validate_schema("owner", {
            "task": "unpaid", "next_action": "read_only_after_scope_resolution", "room": "301"
        }))
        self.assertFalse(EVAL.validate_schema("owner", {
            "task": "clarify", "next_action": "read_only_after_scope_resolution"
        }))

    def test_v5_independent_owner_holdout_is_disjoint_from_v9_training(self):
        ft = EVAL.load_training_module()
        owner_cases = EVAL.load_evaluation_cases(ft, {"owner"}, str(
            Path(__file__).parents[2] / "data/cloudy-owner/v5/independent-holdout.json"
        ))
        self.assertEqual(len(owner_cases), 52)
        training_messages = {
            case["messages"][1]["content"] for case in ft.load_cases("train") if case["flow"] == "owner"
        }
        evaluation_messages = {case["messages"][1]["content"] for case in owner_cases}
        self.assertFalse(training_messages & evaluation_messages)
        with self.assertRaises(ValueError):
            EVAL.load_evaluation_cases(ft, {"resident"}, str(
                Path(__file__).parents[2] / "data/cloudy-owner/v5/independent-holdout.json"
            ))


if __name__ == "__main__":
    unittest.main()
