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


if __name__ == '__main__':
    unittest.main()
