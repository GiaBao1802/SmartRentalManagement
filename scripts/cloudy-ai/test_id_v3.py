import unittest

import id_lab
import id_v3
from id_normalizer import normalize


class LocationCandidateTests(unittest.TestCase):
    def test_normalizer_preserves_exact_unrecognized_phrases_for_clarification(self):
        result = normalize('Phòng sạch sẽ ở gần trường đại học', {'intent': 'search_rooms', 'spans': []})
        self.assertEqual(result['status'], 'needs_clarification')
        self.assertEqual(result['unrecognizedTerms'], ['sạch sẽ', 'gần trường đại học'])

    def test_city_abbreviation_period_is_preserved_inside_location(self):
        question = 'Tìm trọ tại TP. Hồ Chí Minh giá từ 2 đến 3 triệu, diện tích từ 20 đến 30 mét vuông'
        candidates = id_lab.candidates(question)
        self.assertEqual([(item['field'], item['quote']) for item in candidates], [
            ('location', 'TP. Hồ Chí Minh'),
            ('price', 'giá từ 2 đến 3 triệu'),
            ('area', 'diện tích từ 20 đến 30 mét vuông'),
        ])

        result = id_v3.finish(question, candidates, {
            'intent': 'search_rooms',
            'decisions': {item['id']: 'include' for item in candidates},
        })
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['filters'], {
            'price': [{'op': 'gte', 'value': 2_000_000}, {'op': 'lte', 'value': 3_000_000}],
            'area': [{'op': 'gte', 'value': 20}, {'op': 'lte', 'value': 30}],
            'location': 'TP. Hồ Chí Minh',
            'occupants': None,
            'amenities': [],
        })

    def test_trailing_sentence_period_is_not_part_of_location(self):
        question = 'Tìm phòng ở Huế.'
        candidates = id_lab.candidates(question)
        self.assertEqual([(item['field'], item['quote']) for item in candidates], [('location', 'Huế')])

    def test_exact_welcome_example_without_location_preposition_extracts_all_filters(self):
        question = 'Tìm phòng Thủ Đức dưới 4 triệu, có máy lạnh, cho 2 người.'
        candidates = id_lab.candidates(question)
        self.assertEqual([(item['field'], item['quote']) for item in candidates], [
            ('location', 'Thủ Đức'),
            ('price', 'dưới 4 triệu'),
            ('amenity', 'máy lạnh'),
            ('occupants', '2 người'),
        ])

        result = id_v3.finish(question, candidates, {
            'intent': 'search_rooms',
            'decisions': {item['id']: 'include' for item in candidates},
        })
        self.assertEqual(result['status'], 'ready', result)
        self.assertEqual(result['filters'], {
            'price': [{'op': 'lt', 'value': 4_000_000}],
            'area': [],
            'location': 'Thủ Đức',
            'occupants': 2,
            'amenities': ['air_conditioning'],
        })

    def test_bare_price_shorthand_is_recognized_and_clarifies_comparison(self):
        question = 'tôi muốn tìm phòng 2tr'
        candidates = id_lab.candidates(question)
        self.assertEqual([(item['field'], item['quote']) for item in candidates], [('price', '2tr')])

        result = id_v3.finish(question, candidates, {
            'intent': 'search_rooms',
            'decisions': {item['id']: 'include' for item in candidates},
        })
        self.assertEqual(result['status'], 'needs_clarification')
        self.assertEqual(result['clarificationHints'], [
            {'type': 'price_operator', 'quote': '2tr', 'value': 2_000_000},
        ])
        self.assertEqual(result['draftFilters']['price'], [])

        # The model's uncertainty must not turn a recognized amount back into an unknown word.
        uncertain = id_v3.finish(question, candidates, {
            'intent': 'search_rooms',
            'decisions': {item['id']: 'unclear' for item in candidates},
        })
        self.assertEqual(uncertain['status'], 'needs_clarification')
        self.assertEqual(uncertain['clarificationHints'], result['clarificationHints'])

    def test_explicit_budget_and_comparator_remain_searchable(self):
        cases = {
            'Tìm phòng ngân sách 2tr': {'op': 'lte', 'value': 2_000_000},
            'Tìm phòng dưới 2tr': {'op': 'lt', 'value': 2_000_000},
        }
        for question, expected in cases.items():
            with self.subTest(question=question):
                candidates = id_lab.candidates(question)
                result = id_v3.finish(question, candidates, {
                    'intent': 'search_rooms',
                    'decisions': {item['id']: 'include' for item in candidates},
                })
                self.assertEqual(result['status'], 'ready', result)
                self.assertEqual(result['filters']['price'], [expected])

    def test_area_phrases_and_common_amenities_are_extracted_as_separate_conditions(self):
        cases = {
            'Có phòng nào diện tích tầm 20 đến 30 mét vuông không?': ([('area', 'diện tích tầm 20 đến 30 mét vuông')], [{'op': 'gte', 'value': 20}, {'op': 'lte', 'value': 30}]),
            'Tìm phòng diện tích ít nhất 25m²': ([('area', 'diện tích ít nhất 25m²')], [{'op': 'gte', 'value': 25}]),
            'Tìm phòng rộng trên 20 m2': ([('area', 'rộng trên 20 m2')], [{'op': 'gt', 'value': 20}]),
            'Tìm phòng có bãi gửi xe': ([('amenity', 'bãi gửi xe')], None),
            'Tìm phòng có bãi xe': ([('amenity', 'bãi xe')], None),
            'Tìm phòng có chỗ để xe': ([('amenity', 'chỗ để xe')], None),
            'Tìm phòng có máy điều hòa': ([('amenity', 'máy điều hòa')], None),
            'Tìm phòng có điều hòa và wifi': ([('amenity', 'điều hòa'), ('amenity', 'wifi')], None),
            'Tìm phòng có tiện ích gì?': ([('amenity', 'tiện ích')], None),
        }
        for question, (expected, expected_area) in cases.items():
            with self.subTest(question=question):
                candidates = id_lab.candidates(question)
                self.assertEqual([(item['field'], item['quote']) for item in candidates], expected)
                result = id_v3.finish(question, candidates, {
                    'intent': 'search_rooms',
                    'decisions': {item['id']: 'include' for item in candidates},
                })
                self.assertEqual(result['status'], 'ready', result)
                if expected_area is not None:
                    self.assertEqual(result['filters']['area'], expected_area)
                else:
                    self.assertTrue(result['filters']['amenities'])

    def test_single_approximate_area_is_not_silently_treated_as_a_minimum(self):
        result = normalize('Tìm phòng tầm 20m²', {
            'intent': 'search_rooms',
            'spans': [{'field': 'area', 'quote': 'tầm 20m²'}],
        })
        self.assertEqual(result['status'], 'needs_clarification')
        self.assertEqual(result['draftFilters']['area'], [])

    def test_search_phrase_does_not_turn_following_amenity_into_a_location(self):
        for question in ['Tìm phòng có máy lạnh', 'Tìm phòng cho 2 người', 'Tìm phòng tại Huế']:
            with self.subTest(question=question):
                candidates = id_lab.candidates(question)
                if question == 'Tìm phòng tại Huế':
                    self.assertEqual([(item['field'], item['quote']) for item in candidates], [('location', 'Huế')])
                else:
                    self.assertNotIn('location', [item['field'] for item in candidates])

    def test_city_names_with_room_or_house_words_are_not_truncated(self):
        cases = [
            ('Tìm phòng Hải Phòng dưới 4 triệu.', 'Hải Phòng'),
            ('Tìm trọ tại Nha Trang dưới 4 triệu.', 'Nha Trang'),
        ]
        for question, location in cases:
            with self.subTest(question=question):
                candidates = id_lab.candidates(question)
                self.assertIn(('location', location), [(item['field'], item['quote']) for item in candidates])

    def test_search_for_tro_without_word_phong_still_captures_location(self):
        question = 'cần trọ Đà Nẵng tầm 20 đến 30 mét vuông, giá 3tr5 đổ lại nha'
        candidates = id_lab.candidates(question)
        self.assertIn(('location', 'Đà Nẵng'), [(item['field'], item['quote']) for item in candidates])
        result = id_v3.finish(question, candidates, {
            'intent': 'search_rooms',
            'decisions': {item['id']: 'include' for item in candidates},
        })
        self.assertEqual(result['status'], 'ready', result)
        self.assertEqual(result['filters']['price'], [{'op': 'lte', 'value': 3_500_000}])
        self.assertEqual(result['filters']['area'], [{'op': 'gte', 'value': 20}, {'op': 'lte', 'value': 30}])

    def test_vague_comparative_followup_is_not_misread_as_a_location(self):
        question = 'Tìm phòng rẻ hơn nữa.'
        candidates = id_lab.candidates(question)
        self.assertNotIn('location', [item['field'] for item in candidates])
        result = id_v3.finish(question, candidates, {
            'intent': 'search_rooms',
            'decisions': {item['id']: 'include' for item in candidates},
        })
        self.assertEqual(result['status'], 'needs_clarification')

    def test_wifi_hyphenation_is_normalized_without_losing_continuation_filters(self):
        question = 'Tìm phòng có Wi-Fi'
        spans = id_lab.candidates(question)
        self.assertEqual([(item['field'], item['quote']) for item in spans], [('amenity', 'Wi-Fi')])
        result = id_v3.finish(question, spans, {
            'intent': 'search_rooms',
            'decisions': {item['id']: 'include' for item in spans},
        })
        self.assertEqual(result['status'], 'ready', result)
        self.assertEqual(result['filters']['amenities'], ['wifi'])

    def test_colloquial_do_lai_means_price_at_most(self):
        question = 'Tìm phòng ở Đà Nẵng giá 3tr5 đổ lại'
        candidates = id_lab.candidates(question)
        result = id_v3.finish(question, candidates, {
            'intent': 'search_rooms',
            'decisions': {item['id']: 'include' for item in candidates},
        })
        self.assertEqual(result['status'], 'ready', result)
        self.assertEqual(result['filters']['price'], [{'op': 'lte', 'value': 3_500_000}])

    def test_but_conjunction_does_not_make_numeric_filters_unintelligible(self):
        question = 'Tìm ở Vũng Tàu giá trên 2tr nhưng tối đa 4 triệu, diện tích không quá 30m2'
        candidates = id_lab.candidates(question)
        result = id_v3.finish(question, candidates, {
            'intent': 'search_rooms',
            'decisions': {item['id']: 'include' for item in candidates},
        })
        self.assertEqual(result['status'], 'ready', result)
        self.assertEqual(result['filters']['price'], [
            {'op': 'gt', 'value': 2_000_000}, {'op': 'lte', 'value': 4_000_000},
        ])


if __name__ == '__main__':
    unittest.main()
