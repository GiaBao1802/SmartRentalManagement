import unittest,copy
from conversation import understand,EMPTY,valid_context
from worker import respond

class ConversationTests(unittest.TestCase):
 def setUp(self):
  self.context={**copy.deepcopy(EMPTY),'location':'Bến Nắng','price':[{'op':'lt','value':4000000}]}
 def parsed(self,**fields):return {'status':'ready','filters':{**copy.deepcopy(EMPTY),**fields}}
 def test_add_and_replace_keep_other_fields(self):
  r=understand('thêm máy lạnh','continue',self.context,lambda q:self.parsed(amenities=['air_conditioning']))
  self.assertEqual(r['filters']['location'],'Bến Nắng');self.assertEqual(r['filters']['price'],self.context['price'])
  r2=understand('dưới 3 triệu','continue',r['filters'],lambda q:self.parsed(price=[{'op':'lt','value':3000000}]))
  self.assertEqual(r2['filters']['price'],[{'op':'lt','value':3000000}]);self.assertEqual(r2['filters']['amenities'],['air_conditioning'])
 def test_adding_amenity_keeps_existing_amenities(self):
  context={**self.context,'amenities':['air_conditioning']}
  r=understand('thêm Wi-Fi','continue',context,lambda q:self.parsed(amenities=['wifi']))
  self.assertEqual(r['filters']['amenities'],['air_conditioning','wifi'])
 def test_changing_amenity_replaces_existing_amenity(self):
  context={**self.context,'amenities':['air_conditioning']}
  r=understand('đổi sang Wi-Fi','continue',context,lambda q:self.parsed(amenities=['wifi']))
  self.assertEqual(r['filters']['amenities'],['wifi'])
 def test_new_drops_context(self):
  r=understand('phòng','new',self.context,lambda q:self.parsed(location='Dương Mơ'))
  self.assertEqual(r['filters']['price'],[])
 def test_remove_explicit_condition(self):
  r=understand('bỏ giới hạn giá','continue',self.context,lambda _:self.fail('no model needed'))
  self.assertEqual(r['filters']['price'],[]);self.assertEqual(r['filters']['location'],'Bến Nắng')
 def test_ambiguous_does_not_produce_filters(self):
  original=copy.deepcopy(self.context)
  r=respond('rẻ hơn nữa',lambda q:{'status':'needs_clarification','questions':['Cần mức giá.']},'continue',self.context)
  self.assertIsNone(r['context']);self.assertEqual(self.context,original)
 def test_no_matches_still_returns_context(self):
  r=respond('dưới 1 đồng',lambda q:self.parsed(price=[{'op':'lt','value':1}]),'continue',self.context)
  self.assertEqual(r['status'],'no_matches');self.assertEqual(r['context']['location'],'Bến Nắng')
 def test_context_validation(self):
  for f in [None,{},dict(self.context,occupants=True),dict(self.context,price=[{'op':'sql','value':3}])]:self.assertFalse(valid_context(f))
