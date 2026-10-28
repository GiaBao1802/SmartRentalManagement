import unittest
from worker import respond

class WorkerTests(unittest.TestCase):
 def test_grounded_render(self):
  p={'status':'ready','filters':{'price':[{'op':'lt','value':4000000}],'area':[],'location':'Bến Nắng','occupants':None,'amenities':[]}}
  result=respond('phòng',lambda _:p)
  self.assertIn('14 phòng',result['text']);self.assertIn('SYN-R0003',result['text']);self.assertIn('1.500.000',result['text']);self.assertIn('chưa gồm',result['text'])
  self.assertEqual(result['model'],'qwen3:1.7b');self.assertTrue(result['synthetic'])
 def test_clarify_without_rooms(self):
  result=respond('phòng',lambda _:{'status':'needs_clarification','questions':['Thiếu số.']})
  self.assertNotIn('SYN-R',result['text']);self.assertIn('Thiếu số.',result['text'])
 def test_input_validation(self):
  for q in ['',None,'x'*501]:
   with self.assertRaises(ValueError):respond(q)

if __name__=='__main__':unittest.main()
