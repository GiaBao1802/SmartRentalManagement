import unittest
from worker import respond,handle_request

class WorkerTests(unittest.TestCase):
 def test_grounded_render(self):
  p={'status':'ready','filters':{'price':[{'op':'lt','value':4000000}],'area':[],'location':'Bến Nắng','occupants':None,'amenities':[]}}
  result=respond('phòng',lambda _:p)
  self.assertIn('14 phòng',result['text']);self.assertIn('SYN-R0003',result['text']);self.assertIn('1.500.000',result['text']);self.assertIn('chưa gồm',result['text'])
  self.assertEqual(result['model'],'qwen3:1.7b');self.assertTrue(result['synthetic'])
 def test_clarify_without_rooms(self):
  result=respond('phòng',lambda _:{'status':'needs_clarification','questions':['Thiếu số.']})
  self.assertNotIn('SYN-R',result['text']);self.assertIn('chưa hiểu từ/cụm từ',result['text'])
  self.assertIn('chờ bạn làm rõ',result['text']);self.assertIn('chưa tiếp tục tìm phòng',result['text'])
 def test_input_validation(self):
  for q in ['',None,'x'*501]:
   with self.assertRaises(ValueError):respond(q)
 def test_recognized_amenities_are_proposed_for_explicit_live_api_confirmation(self):
  filters={'price':[{'op':'lt','value':4000000}],'area':[{'op':'gte','value':20}],'location':'Đồng Nai','occupants':None,'amenities':['parking','air_conditioning']}
  result=handle_request({'message':'có bãi xe và máy lạnh','mode':'new'},lambda _:{'status':'ready','filters':filters})
  self.assertEqual(result['status'],'awaiting_confirmation')
  self.assertEqual(result['context'],filters)
  self.assertIn('khu vực Đồng Nai',result['text'])
  self.assertIn('diện tích ≥ 20 m²',result['text'])
  self.assertIn('bãi gửi xe',result['text'])
  self.assertIn('máy lạnh',result['text'])
 def test_unspecified_amenity_asks_for_detail(self):
  filters={'price':[],'area':[],'location':None,'occupants':None,'amenities':['unspecified_amenity']}
  result=handle_request({'message':'phòng có tiện ích'},lambda _:{'status':'ready','filters':filters})
  self.assertEqual(result['status'],'needs_clarification');self.assertIsNone(result['context'])
  self.assertIn('chưa hiểu từ “tiện ích”',result['text'])
  self.assertIn('chờ bạn làm rõ',result['text'])

if __name__=='__main__':unittest.main()
