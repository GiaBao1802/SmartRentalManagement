"""One JSON request on stdin, one public demo response on stdout. No persistence."""
import json,sys
import id_v3
from conversation import understand,describe,valid_context
from room_catalog_lab import load_catalog,retrieve

def render(result):
 prefix='PHÒNG GIẢ LẬP · Không phải tin cho thuê thật.\n'
 if result['status']=='needs_clarification':
  return prefix+'Mình chưa thể lọc đầy đủ yêu cầu này. '+ ' '.join(result.get('questions',[]))+'\nHãy gửi lại đủ điều kiện trong một câu, ví dụ: Phòng ở Bến Nắng dưới 4 triệu có máy lạnh.'
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
 text=render(result)
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
 parsed=understand(message.strip(),mode,body.get('context'),extract)
 filters=parsed.get('filters')
 if parsed.get('status')!='ready' or not valid_context(filters):
  return {'text':'Mình chưa hiểu đủ điều kiện để tìm trong tin phòng công khai. '+' '.join(parsed.get('questions',['Bạn hãy nói rõ khu vực, giá, diện tích hoặc số người.']))+'\nBạn có thể sửa yêu cầu rồi gửi lại.','source':'public_database','model':'qwen3:1.7b','status':'needs_clarification','context':None}
  # No catalog loading or retrieval before the guest explicitly confirms.
 if filters['amenities']:
  labels={'air_conditioning':'máy lạnh/điều hòa','parking':'bãi gửi xe','wifi':'wifi','elevator':'thang máy','washing_machine':'máy giặt','refrigerator':'tủ lạnh','water_heater':'máy nước nóng','private_kitchen':'bếp riêng','private_bathroom':'nhà vệ sinh riêng','balcony':'ban công','unspecified_amenity':'tiện ích','cats_allowed':'nuôi mèo','dogs_allowed':'nuôi chó'}
  requested=', '.join(labels[x] for x in filters['amenities'])
  summary=describe(filters).replace('Đang lọc: ','').rstrip('.')
  return {'text':f'Mình hiểu yêu cầu: {summary}. Tuy nhiên, tin phòng công khai hiện chưa có dữ liệu đã xác minh cho tiện ích {requested}, nên mình chưa thể lọc hoặc khẳng định phòng nào có các tiện ích này. Hiện mình lọc được khu vực, giá thuê, diện tích và sức chứa. Bạn có thể chọn “Sửa yêu cầu” để bỏ tiện ích rồi tiếp tục.','source':'public_database','model':'qwen3:1.7b','status':'needs_clarification','context':None}
 text='Mình hiểu nhu cầu của bạn như sau:\n'+describe(filters).replace('Đang lọc: ','')+'\n\nSau khi bạn xác nhận, mình sẽ tìm trong các tin phòng đang công khai trên database. Giá là tiền thuê cả phòng, chưa gồm điện nước/phí.\nĐúng ý bạn chưa? Chọn “Đúng rồi, tìm phòng” hoặc “Sửa yêu cầu”.'
 return {'text':text,'source':'public_database','model':'qwen3:1.7b','status':'awaiting_confirmation','context':filters}

if __name__=='__main__':
 sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
 try:
  body=json.loads(sys.stdin.read(4097))
  print(json.dumps(handle_request(body),ensure_ascii=False))
 except Exception:
  # Do not expose filesystem paths, prompts or traceback to clients.
  print(json.dumps({'error':'AI_UNAVAILABLE'}));sys.exit(1)
