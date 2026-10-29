import json
import unittest
from pathlib import Path

from guest_question_router import route
from worker import handle_request


BANK = json.loads(Path(__file__).parents[2].joinpath("data/cloudy-guest/v1/question-bank.json").read_text(encoding="utf-8"))


class GuestQuestionRouterTests(unittest.TestCase):
    def test_known_unanswerable_topics_are_acknowledged_without_calling_model(self):
        ids = {
            "price-001", "price-002", "price-003", "price-004", "price-005", "price-006",
            "lease-001", "lease-002", "lease-003", "lease-004", "lease-005", "lease-006",
            "condition-001", "condition-002", "condition-004", "condition-005",
            "maintenance-001", "maintenance-002", "maintenance-003", "maintenance-004", "maintenance-005",
            "listing-001", "listing-002", "listing-003", "listing-004",
        }
        cases = {case["id"]: case for case in BANK["cases"]}
        for case_id in sorted(ids):
            with self.subTest(case=case_id):
                question = cases[case_id]["message"]
                expected = route(question)
                self.assertIsNotNone(expected)
                self.assertIn("Mình hiểu", expected)
                result = handle_request({"message": question}, lambda _: self.fail("Known renter FAQ must be routed before Qwen"))
                self.assertEqual(result["status"], "needs_clarification")
                self.assertIsNone(result["context"])
                self.assertIn("Mình hiểu", result["text"])
                self.assertNotIn("chưa hiểu cụm", result["text"])

    def test_shared_facility_query_points_to_marketplace_filter_without_claiming_access(self):
        response = route("Tìm phòng có hồ bơi với sân bóng.")
        self.assertIn("Tiện ích chung của khu trọ", response)
        self.assertIn("chưa lọc tiện ích chung", response)
        self.assertIn("không xác nhận có chỗ trống", response)

    def test_shared_facility_cost_or_schedule_is_referred_to_owner(self):
        response = route("Hồ bơi có mất phí không, mở cửa đến mấy giờ?")
        self.assertIn("Mình hiểu bạn đang hỏi", response)
        self.assertIn("phí, lịch, sức chứa", response)

    def test_supported_filter_queries_are_not_intercepted(self):
        for question in [
            "Tìm phòng ở Thủ Đức dưới 4 triệu.",
            "Tìm phòng có máy lạnh dưới 4 triệu.",
            "Tìm phòng cho nuôi mèo ở Đồng Nai.",
            "Mình cần phòng tại Đà Lạt, ngân sách 3tr2, nuôi mèo được.",
        ]:
            with self.subTest(question=question):
                self.assertIsNone(route(question))

    def test_shared_facility_search_is_directed_to_the_existing_marketplace_filter(self):
        response = route("Tìm phòng có hồ bơi dưới 5 triệu.")
        self.assertIn("Tiện ích chung của khu trọ", response)

    def test_student_suitability_question_asks_for_preferences(self):
        response = route("Mình là sinh viên, phòng này có phù hợp không?")
        self.assertIn("chưa đủ thông tin", response)
        self.assertIn("ngân sách, khu vực, số người", response)

    def test_pet_or_question_clarifies_choice_instead_of_requiring_both_policies(self):
        response = route("Tìm phòng cho nuôi mèo hoặc chó không?")
        self.assertIn("nuôi mèo, nuôi chó hay cần chấp nhận cả hai", response)
        self.assertIn("mình chưa tìm phòng", response)

    def test_unknown_phrase_keeps_the_unrecognized_word_clarification(self):
        result = handle_request({"message": "phòng sạch sẽ"}, lambda _: {
            "status": "needs_clarification",
            "questions": ["Chưa xử lý hết câu"],
            "unrecognizedTerms": ["sạch sẽ"],
        })
        self.assertIn("chưa hiểu cụm “sạch sẽ”", result["text"])


if __name__ == "__main__":
    unittest.main()
