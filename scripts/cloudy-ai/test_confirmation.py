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
  self.assertEqual(result['status'],'preview');self.assertIn('14 phòng',result['text']);self.assertEqual(result['context'],FILTERS)
 def test_unclear_does_not_load_or_propose(self):
  with patch('worker.load_catalog',side_effect=AssertionError('must not load')):
   result=handle_request({'message':'rẻ hơn'},lambda _: {'status':'needs_clarification','questions':['Cần mức giá.']})
  self.assertIsNone(result['context']);self.assertEqual(result['status'],'needs_clarification')
 def test_invalid_confirm_rejected(self):
  for body in [{'action':'confirm'},{'action':'confirm','context':{}},{'action':'confirm','context':FILTERS,'message':'khác'}]:
   with self.assertRaises(ValueError):handle_request(body)
 def test_continue_also_requires_confirmation(self):
  with patch('worker.load_catalog',side_effect=AssertionError('must not load')):
   result=handle_request({'message':'bỏ giới hạn giá','mode':'continue','context':FILTERS})
  self.assertEqual(result['status'],'awaiting_confirmation');self.assertEqual(result['context']['price'],[])
