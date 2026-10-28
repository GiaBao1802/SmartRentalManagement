"""Validated, bounded filter context; never infer context from assistant prose."""
import copy,re
from id_normalizer import normalized

EMPTY={'price':[], 'area':[], 'location':None, 'occupants':None, 'amenities':[]}

def valid_context(f):
 if not isinstance(f,dict) or set(f)!=set(EMPTY):return False
 for key in ['price','area']:
  if not isinstance(f[key],list) or len(f[key])>4:return False
  for c in f[key]:
   if not isinstance(c,dict) or set(c)!={'op','value'} or c['op'] not in ['lt','lte','gt','gte','eq'] or type(c['value']) not in [int,float] or not 0<c['value']<=1e12:return False
 if f['location'] is not None and (not isinstance(f['location'],str) or not 1<=len(f['location'])<=100):return False
 if f['occupants'] is not None and (type(f['occupants']) is not int or not 1<=f['occupants']<=100):return False
 return isinstance(f['amenities'],list) and len(f['amenities'])<=8 and all(x in ['air_conditioning','parking','wifi','elevator','washing_machine','refrigerator','water_heater','private_kitchen','private_bathroom','balcony','unspecified_amenity','cats_allowed','dogs_allowed'] for x in f['amenities'])

def understand(message,mode,context,extract):
 if mode=='new':
  delta=re.sub(r'^(?:lọc mới|loc moi|bắt đầu lại|bat dau lai)\s*[:,]?\s*','',message.strip(),flags=re.I)
  return extract(delta or message)
 if not valid_context(context):raise ValueError('Invalid context')
 # Explicit removal commands are deliberately narrow: other content must not be dropped.
 removals={'bo gioi han gia':'price','thoi bo gioi han gia':'price','bo gioi han gia di':'price','khong gioi han gia':'price','bo gia':'price','bo gia di':'price','thoi bo gia di nhe':'price','bo dieu kien may lanh':'amenities','khong can may lanh':'amenities','bo dieu kien dien tich':'area','bo dieu kien khu vuc':'location','bo dieu kien so nguoi':'occupants'}
 command=normalized(message).strip(' .!?')
 if command in removals:
  merged=copy.deepcopy(context);field=removals[command];merged[field]=copy.deepcopy(EMPTY[field])
  return {'status':'ready','filters':merged}
 # Strip only leading conversational update markers; the parser still checks all remaining words.
 additive=bool(re.match(r'^(?:thêm|them)\s+',normalized(message.strip())))
 delta=re.sub(r'^(?:(?:lọc tiếp|loc tiep|lọc thêm|loc them|thêm|them|đổi sang|doi sang|đổi qua|doi qua|đổi thành|doi thanh|đổi|doi|chuyển sang|chuyen sang|chuyển qua|chuyen qua|giữ nguyên,?|giu nguyen,?)\s+)+','',message.strip(),flags=re.I)
 # Explicitly unchanged fields do not need to be re-parsed or replaced.
 delta=re.sub(r'(?:[,;]?\s*)(?:còn\s+|con\s+)?(?:giá|gia|diện tích|dien tich|khu vực|khu vuc|số người|so nguoi|tiện ích|tien ich)\s+(?:vẫn\s+|van\s+)?(?:giữ nguyên|giu nguyen|như cũ|nhu cu)(?:\s+(?:nha|nhé|nhe|ạ|a))?\s*[.!?]*\s*$','',delta,flags=re.I).strip(' ,;')
 parsed=extract('Tìm phòng '+delta)
 if parsed.get('status')!='ready':return parsed
 merged=copy.deepcopy(context)
 for field,value in parsed['filters'].items():
  if value is not None and value!=[]:
   if field=='amenities' and additive:merged[field]=sorted(set(merged[field]+value))
   else:merged[field]=value
 return {**parsed,'filters':merged}

def describe(f):
 parts=[];ops={'lt':'<','lte':'≤','gt':'>','gte':'≥','eq':'='}
 if f['location']:parts.append('khu vực '+f['location'])
 for field,label,unit in [('price','giá thuê','đ/tháng'),('area','diện tích','m²')]:
  for c in f[field]:parts.append(f"{label} {ops[c['op']]} {c['value']:,} {unit}".replace(',','.'))
 if f['occupants']:parts.append(f"cho {f['occupants']} người")
 amenity_labels={'air_conditioning':'máy lạnh','parking':'bãi gửi xe','wifi':'wifi','elevator':'thang máy','washing_machine':'máy giặt','refrigerator':'tủ lạnh','water_heater':'máy nước nóng','private_kitchen':'bếp riêng','private_bathroom':'nhà vệ sinh riêng','balcony':'ban công','unspecified_amenity':'tiện ích','cats_allowed':'cho phép nuôi mèo','dogs_allowed':'cho phép nuôi chó'}
 for amenity in f['amenities']:parts.append('có '+amenity_labels[amenity])
 return 'Đang lọc: '+('; '.join(parts) or 'tất cả phòng còn trống trong bộ mẫu')+'.'
