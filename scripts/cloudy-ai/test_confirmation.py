import unittest
from unittest.mock import patch
from worker import handle_request

FILTERS={'price':[{'op':'lt','value':4000000}],'area':[],'location':'Bến Nắng','occupants':None,'amenities':[]}
class ConfirmationTests(unittest.TestCase):
 def test_prepare_never_loads_or_filters_catalog(self):
  with patch('worker.load_catalog',side_effect=AssertionError('must not load')),patch('worker.retrieve',side_effect=AssertionError('must not filter')):
   result=handle_request({'message':'phòng'},lambda _: {'status':'ready','filters':FILTERS})
  self.assertEqual(result['status'],'awaiting_confirmation');self.assertEqual(result['context'],FILTERS)
  self.assertNotIn('SYN-R',result['text']);self.assertIn('4.000.000',result['text'])
 def test_confirm_filters_without_model(self):
  result=handle_request({'action':'confirm','context':FILTERS},lambda _:self.fail('must not re-infer'))
  self.assertEqual(result,{'error':'Confirmation is handled by the live public API'})
 def test_unclear_does_not_load_or_propose(self):
  with patch('worker.load_catalog',side_effect=AssertionError('must not load')):
   result=handle_request({'message':'rẻ hơn'},lambda _: {'status':'needs_clarification','questions':['Cần mức giá.']})
  self.assertIsNone(result['context']);self.assertEqual(result['status'],'needs_clarification')
  self.assertIn('chưa hiểu từ/cụm từ',result['text'])
  self.assertIn('chờ bạn làm rõ',result['text'])
  self.assertIn('chưa tiếp tục tìm phòng',result['text'])
 def test_invalid_confirm_rejected(self):
  for body in [{'action':'confirm'},{'action':'confirm','context':{}},{'action':'confirm','context':FILTERS,'message':'khác'}]:
   with self.assertRaises((ValueError,KeyError)):handle_request(body)
 def test_continue_also_requires_confirmation(self):
  with patch('worker.load_catalog',side_effect=AssertionError('must not load')):
   result=handle_request({'message':'bỏ giới hạn giá','mode':'continue','context':FILTERS})
  self.assertEqual(result['status'],'awaiting_confirmation');self.assertEqual(result['context']['price'],[])
 def test_structured_machine_feature_is_proposed_before_public_query(self):
  result=handle_request({'message':'phòng có máy lạnh'},lambda _: {'status':'ready','filters':{**FILTERS,'amenities':['air_conditioning']}})
  self.assertEqual(result['status'],'awaiting_confirmation');self.assertEqual(result['context']['amenities'],['air_conditioning'])
