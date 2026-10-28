"""Read-only adapter for the synthetic room-ai v1 catalog. No SQL or web integration."""
import json,hashlib,math,operator,sys
from pathlib import Path
import id_lab
from filter_v2 import norm
SOURCE=Path(__file__).resolve().parents[2]/'data/room-ai/v1/rooms.json'
OPS={'lt':operator.lt,'lte':operator.le,'gt':operator.gt,'gte':operator.ge,'eq':operator.eq}

def load_catalog(path=SOURCE):
 raw=path.read_bytes();data=json.loads(raw);digest=hashlib.sha256(raw).hexdigest()
 manifest=json.loads(path.with_name('manifest.json').read_text(encoding='utf-8'))
 if digest!=manifest['sha256']['rooms.json']:raise ValueError('Hash rooms.json khác manifest; cần xác minh phiên bản dữ liệu')
 if data.get('schema_version')!='1.0.0' or data.get('synthetic') is not True or data.get('currency')!='VND':raise ValueError('Dataset không đúng định dạng thử nghiệm')
 rooms=data['rooms'];seen=set()
 for r in rooms:
  if r['id'] in seen or r['synthetic'] is not True:raise ValueError('ID trùng hoặc dữ liệu không phải giả lập')
  seen.add(r['id'])
  for value in [r['area_m2'],r['capacity'],r['pricing']['rent_per_room_month_vnd']]:
   if type(value) not in [int,float] or not math.isfinite(value) or value<=0:raise ValueError('Dữ kiện phòng không hợp lệ')
 return data,digest

def retrieve(data,parsed,split=None,limit=5):
 if split not in [None,'train','validation','test'] or type(limit) is not int or not 1<=limit<=20:raise ValueError('Giới hạn hoặc split không hợp lệ')
 base={'synthetic':True,'datasetId':data['dataset_id'],'asOf':data['as_of'],'reviewRequired':True,'priceBasis':'rent_per_room_month_vnd','split':split or 'all','cards':[]}
 if parsed.get('status')!='ready' or 'filters' not in parsed:
  return {**base,'status':'needs_clarification','questions':parsed.get('questions',['Chưa có điều kiện hợp lệ.'])}
 f=parsed['filters']
 if set(f)!={'price','area','location','occupants','amenities'}:raise ValueError('Bộ lọc có trường chưa hỗ trợ')
 for key in ['price','area']:
  if not isinstance(f[key],list):raise ValueError('Sai cấu trúc giới hạn')
  for c in f[key]:
   if set(c)!={'op','value'} or c['op'] not in OPS or type(c['value']) not in [int,float] or not math.isfinite(c['value']) or c['value']<=0:raise ValueError('Giới hạn không hợp lệ')
 if f['occupants'] is not None and (type(f['occupants']) is not int or f['occupants']<=0):raise ValueError('Số người không hợp lệ')
 if f['location'] is not None and (not isinstance(f['location'],str) or not f['location'].strip()):raise ValueError('Địa điểm không hợp lệ')
 if not isinstance(f['amenities'],list):raise ValueError('Tiện ích không hợp lệ')
 if any(x!='air_conditioning' for x in f['amenities']):
  return {**base,'status':'needs_clarification','questions':['Bộ thử chưa ánh xạ yêu cầu thú cưng: cần số lượng, cân nặng và điều kiện chủ trọ duyệt; không suy từ nhãn pets.']}
 def matches(r):
  return (r['availability']['status']=='available'
   and (split is None or r['split']==split)
   and all(OPS[c['op']](r['pricing']['rent_per_room_month_vnd'],c['value']) for c in f['price'])
   and all(OPS[c['op']](r['area_m2'],c['value']) for c in f['area'])
   and (f['occupants'] is None or r['capacity']>=f['occupants'])
   and (not f['amenities'] or 'ac' in r['features'])
   and (f['location'] is None or norm(f['location']).strip() in [norm(r['location'][k]).strip() for k in ['city','zone']]))
 rooms=sorted((r for r in data['rooms'] if matches(r)),key=lambda r:(r['pricing']['rent_per_room_month_vnd'],r['id']))
 cards=[]
 for r in rooms[:limit]:
  cards.append({'id':r['id'],'name':r['name'],'zone':r['location']['zone'],'rentPerRoomMonthVnd':r['pricing']['rent_per_room_month_vnd'],'areaM2':r['area_m2'],'capacity':r['capacity'],'features':r['features'],'availability':r['availability'],'estimatedTotalMonthVnd':r['pricing']['estimated_total_month_vnd'],'estimateAssumptions':r['pricing']['estimate_assumptions'],'estimateIsQuote':False,'source':'rooms.json#'+r['id']})
 return {**base,'status':'preview' if rooms else 'no_matches','filters':f,'totalMatches':len(rooms),'matchedIds':[r['id'] for r in rooms],'cards':cards,'sort':'rent ascending, then ID','note':'Phòng/giá giả lập; chỉ lọc giá thuê cả phòng, không phải tổng chi phí. Tình trạng là bản chụp dữ liệu, không phải tồn phòng hôm nay.'}

def query(question,split=None):
 data,digest=load_catalog();parsed=id_lab.extract(question)
 return {'question':question,'datasetSha256':digest,'understanding':parsed,'result':retrieve(data,parsed,split)}

if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf-8')
 try:print(json.dumps(query(' '.join(sys.argv[1:]) or input('Nhập câu tìm phòng giả lập: ')),ensure_ascii=False,indent=2))
 except Exception as e:print(json.dumps({'status':'error','message':str(e)},ensure_ascii=False));sys.exit(1)
