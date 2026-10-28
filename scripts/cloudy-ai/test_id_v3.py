import unittest

import id_lab
import id_v3


class LocationCandidateTests(unittest.TestCase):
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

    def test_area_phrases_and_common_amenities_are_extracted_as_separate_conditions(self):
        cases = {
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


if __name__ == '__main__':
    unittest.main()
