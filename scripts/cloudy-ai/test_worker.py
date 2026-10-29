import unittest
import id_lab
import id_v3
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
  self.assertIn('Mình hiểu bạn muốn biết về tiện ích',result['text'])
  self.assertIn('tiện ích chung của khu trọ',result['text'])
  self.assertIn('chưa tìm phòng',result['text'])
 def test_vague_price_asks_for_maximum_budget(self):
  result=handle_request({'message':'phòng rẻ'},lambda _:{'status':'needs_clarification','questions':['Chưa xử lý hết câu: re'],'unrecognizedTerms':['rẻ']})
  self.assertIn('ngân sách tối đa mỗi tháng',result['text'])
  self.assertIn('ví dụ dưới 4 triệu',result['text'])
 def test_bare_shorthand_price_is_acknowledged_and_comparison_is_clarified(self):
  parsed={'status':'needs_clarification','questions':['Chưa rõ phép so sánh'],'clarificationHints':[{'type':'price_operator','quote':'2tr','value':2000000}]}
  result=handle_request({'message':'tôi muốn tìm phòng 2tr','mode':'new'},lambda _:parsed)
  self.assertEqual(result['status'],'needs_clarification')
  self.assertIn('“2tr” là 2.000.000 đồng tiền thuê mỗi tháng',result['text'])
  self.assertIn('tối đa 2.000.000đ/tháng hay phòng có giá đúng',result['text'])
  self.assertNotIn('chưa hiểu cụm “2tr”',result['text'])
  self.assertIsNone(result['context'])
 def test_area_measurement_is_acknowledged_before_asking_for_a_limit(self):
  def extract(question):
   candidates=id_lab.candidates(question)
   return id_v3.finish(question,candidates,{'intent':'search_rooms','decisions':{item['id']:'unclear' for item in candidates}})
  result=handle_request({'message':'tìm phòng 20m2','mode':'new'},extract)
  self.assertIn('diện tích 20 m²',result['text'])
  self.assertIn('tối thiểu',result['text'])
  self.assertIn('chờ bạn xác nhận',result['text'])
  self.assertIsNone(result['context'])
 def test_area_with_bare_m_unit_asks_for_confirmation(self):
  parsed={'status':'needs_clarification','clarificationHints':[{'type':'area_unit','quote':'diện tích 20 m','value':20,'unit_confirmed':False,'operator':None}]}
  result=handle_request({'message':'diện tích 20 m','mode':'new'},lambda _:parsed)
  self.assertIn('xác nhận đơn vị m²',result['text'])
  self.assertIsNone(result['context'])
 def test_unsupported_nearby_search_explains_supported_location_input(self):
  result=handle_request({'message':'phòng gần trường đại học'},lambda _:{'status':'needs_clarification','questions':['Chưa xử lý hết câu: gan truong dai hoc'],'unrecognizedTerms':['gần trường đại học']})
  self.assertIn('Mình hiểu bạn muốn tìm phòng gần trường',result['text'])
  self.assertIn('chưa hỗ trợ lọc khoảng cách',result['text'])
  self.assertIn('tỉnh/thành hoặc khu vực',result['text'])
 def test_unrecognized_term_is_echoed_in_clarification(self):
  result=handle_request({'message':'phòng sạch sẽ'},lambda _:{'status':'needs_clarification','questions':['Chưa xử lý hết câu'],'unrecognizedTerms':['sạch sẽ']})
  self.assertIn('cụm “sạch sẽ”',result['text'])

if __name__=='__main__':unittest.main()
