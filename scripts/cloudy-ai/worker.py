"""One JSON request on stdin, one public demo response on stdout. No persistence."""
import json,sys
import re
import id_v3
from id_normalizer import normalized
from conversation import understand,describe,valid_context
from guest_question_router import route as route_guest_question
from room_catalog_lab import load_catalog,retrieve

def clarification_text(message='',parsed=None):
 terms=(parsed or {}).get('unrecognizedTerms',[])
 request=normalized(message)
 if re.search(r'\b(?:re|gia re|re hon|gia mem)\b',request):
  return 'Mình hiểu bạn muốn tìm phòng giá rẻ nhưng chưa rõ mức giá tối đa. Bạn cho mình ngân sách tối đa mỗi tháng nhé, ví dụ dưới 4 triệu; mình sẽ chờ bạn cập nhật rồi mới tìm.'
 if re.search(r'\b(?:gan|cach)\b',request) and re.search(r'\b(?:truong|dai hoc|cong ty|cho lam|noi lam viec)\b',request):
  return 'Mình hiểu bạn muốn tìm phòng gần trường hoặc nơi làm việc, nhưng dữ liệu tin đăng hiện chưa hỗ trợ lọc khoảng cách. Bạn cho mình tỉnh/thành hoặc khu vực ghi trong địa chỉ phòng nhé; mình sẽ chờ bạn cập nhật rồi mới tìm.'
 hints=(parsed or {}).get('clarificationHints',[])
 area_hint=next((hint for hint in hints if isinstance(hint,dict) and hint.get('type') in ['area_operator','area_unit'] and type(hint.get('value')) in [int,float] and hint['value']>0),None)
 if area_hint:
  value=f"{area_hint['value']:g}"
  if area_hint.get('type')=='area_unit' or area_hint.get('unit_confirmed') is False:
   return f'Mình hiểu “{area_hint.get("quote", "diện tích "+value+" m") }” có thể là diện tích {value} m². Bạn xác nhận đơn vị m² và cho biết muốn diện tích tối thiểu hay khoảng cụ thể nhé; mình sẽ chờ rồi mới tìm phòng.'
  return f'Mình hiểu “{area_hint.get("quote", value+"m²") }” là diện tích {value} m². Bạn muốn diện tích tối thiểu {value} m², tối đa {value} m², hay trong một khoảng cụ thể? Mình sẽ chờ bạn xác nhận rồi mới tìm.'
 price_hint=next((hint for hint in hints if isinstance(hint,dict) and hint.get('type')=='price_operator' and type(hint.get('value')) in [int,float] and hint['value']>0),None)
 if price_hint:
  amount=f"{price_hint['value']:,.0f}".replace(',','.')
  quote=re.sub(r'\s+',' ',str(price_hint.get('quote',''))).strip()[:40]
  return f'Mình hiểu “{quote}” là {amount} đồng tiền thuê mỗi tháng. Bạn muốn tìm phòng tối đa {amount}đ/tháng hay phòng có giá đúng {amount}đ/tháng? Mình sẽ chờ bạn làm rõ rồi mới tìm phòng.'
 if terms:
  term=re.sub(r'\s+',' ',str(terms[0])).strip()[:80]
  if term:return f'Mình chưa hiểu cụm “{term}” trong yêu cầu. Bạn vui lòng giải thích hoặc cập nhật cụm đó; mình sẽ chờ và chưa tiếp tục tìm phòng.'
 return 'Mình chưa hiểu từ/cụm từ trong yêu cầu của bạn. Bạn vui lòng giải thích hoặc cập nhật lại giúp mình nhé; mình sẽ chờ bạn làm rõ và chưa tiếp tục tìm phòng.'

def render(result,message=''):
 prefix='PHÒNG GIẢ LẬP · Không phải tin cho thuê thật.\n'
 if result['status']=='needs_clarification':
  return prefix+clarification_text(message,result)
 if result['status']=='no_matches':
  return prefix+'Không có phòng trong bộ mẫu đáp ứng tất cả điều kiện. Mình chưa tự nới điều kiện. Bạn có thể gửi lại yêu cầu với mức giá hoặc khu vực khác.'
 lines=[prefix+f"Có {result['totalMatches']} phòng phù hợp. Dưới đây là tối đa 5 phòng, sắp theo giá thuê tăng dần:"]
 for c in result['cards']:
  money=f"{c['rentPerRoomMonthVnd']:,}".replace(',','.')
  lines.append(f"• {c['name']} ({c['id']}) — {c['zone']}\n{money} đ/cả phòng/tháng · {c['areaM2']} m² · tối đa {c['capacity']} người"+(' · có máy lạnh' if 'ac' in c['features'] else ''))
 lines.append(f"Giá trên chỉ là tiền thuê, chưa gồm điện nước/phí. Tình trạng phòng theo dữ liệu mẫu ngày {result['asOf']}. Hãy kiểm tra lại yêu cầu; đây chưa phải xác nhận đặt phòng.")
 return '\n\n'.join(lines)

def respond(message,extract=id_v3.extract,mode='new',context=None):
 if not isinstance(message,str) or not 1<=len(message.strip())<=500:raise ValueError('Invalid input')
 if mode not in ['new','continue']:raise ValueError('Invalid mode')
 data,_=load_catalog();parsed=understand(message.strip(),mode,context,extract);result=retrieve(data,parsed)
 accepted=result.get('filters') if result['status']!='needs_clarification' else None
 text=render(result,message.strip())
 if accepted is not None:text+='\n\n'+describe(accepted)
 return {'text':text,'synthetic':True,'model':'qwen3:1.7b','status':result['status'],'context':accepted}

def handle_request(body,extract=id_v3.extract):
 if not isinstance(body,dict):raise ValueError('Invalid request')
 if body.get('action')=='confirm':
  if set(body)!={'action','context'} or not valid_context(body['context']):raise ValueError('Invalid confirmation')
  return {'error':'Confirmation is handled by the live public API'}
 if not set(body)<= {'message','mode','context','action'} or body.get('action','prepare')!='prepare':raise ValueError('Invalid request')
 message=body.get('message');mode=body.get('mode','new')
 if not isinstance(message,str) or not 1<=len(message.strip())<=500 or mode not in ['new','continue']:raise ValueError('Invalid input')
 message=message.strip()
 # Handle known renter questions with a safe, data-grounded response before Qwen.
 # The router returns None for ordinary supported filter requests.
 renter_reply=route_guest_question(message)
 if renter_reply:
  return {'text':renter_reply,'source':'public_database','model':'qwen3:1.7b','status':'needs_clarification','context':None}
 parsed=understand(message,mode,body.get('context'),extract)
 filters=parsed.get('filters')
 if parsed.get('status')!='ready' or not valid_context(filters):
  renter_reply=route_guest_question(message)
  if renter_reply:
   return {'text':renter_reply,'source':'public_database','model':'qwen3:1.7b','status':'needs_clarification','context':None}
  return {'text':clarification_text(message,parsed),'source':'public_database','model':'qwen3:1.7b','status':'needs_clarification','context':None}
  # No catalog loading or retrieval before the guest explicitly confirms.
 if 'unspecified_amenity' in filters['amenities']:
  return {'text':'Mình hiểu bạn muốn biết về tiện ích, nhưng chưa rõ bạn hỏi tiện ích trong phòng (như máy lạnh, Wi-Fi) hay tiện ích chung của khu trọ (như hồ bơi, sân thể thao). Bạn chọn loại hoặc tên tiện ích cụ thể nhé; mình chưa tìm phòng khi điều kiện còn chưa rõ.','source':'public_database','model':'qwen3:1.7b','status':'needs_clarification','context':None}
 if not any([filters['price'],filters['area'],filters['location'],filters['occupants'],filters['amenities']]):
  summary='Bạn đang muốn xem tất cả phòng đang công khai, chưa lọc theo khu vực, giá, diện tích, số người hay tiện ích.'
  next_step='Bạn muốn thêm điều kiện trước hay xem tất cả? Chọn “Sửa yêu cầu” để thu hẹp, hoặc “Đúng rồi, tìm phòng” để xem toàn bộ.'
 else:
  summary=describe(filters).replace('Đang lọc: ','')
  next_step='Đúng ý bạn chưa? Chọn “Đúng rồi, tìm phòng” hoặc “Sửa yêu cầu”.'
 text='Mình hiểu nhu cầu của bạn như sau:\n'+summary+'\n\nSau khi bạn xác nhận, mình sẽ tìm trong các tin phòng đang công khai trên database. Giá là tiền thuê cả phòng, chưa gồm điện nước/phí.\n'+next_step
 return {'text':text,'source':'public_database','model':'qwen3:1.7b','status':'awaiting_confirmation','context':filters}

if __name__=='__main__':
 sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
 try:
  body=json.loads(sys.stdin.read(4097))
  print(json.dumps(handle_request(body),ensure_ascii=False))
 except Exception:
  # Do not expose filesystem paths, prompts or traceback to clients.
  print(json.dumps({'error':'AI_UNAVAILABLE'}));sys.exit(1)
