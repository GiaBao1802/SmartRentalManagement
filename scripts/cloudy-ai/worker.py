"""One JSON request on stdin, one public demo response on stdout. No persistence."""
import json,sys
import id_v3
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

def respond(message,extract=id_v3.extract):
 if not isinstance(message,str) or not 1<=len(message.strip())<=500:raise ValueError('Invalid input')
 data,_=load_catalog();parsed=extract(message.strip());result=retrieve(data,parsed)
 return {'text':render(result),'synthetic':True,'model':'qwen3:1.7b','status':result['status']}

if __name__=='__main__':
 sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
 try:
  body=json.loads(sys.stdin.read(4097))
  if not isinstance(body,dict) or set(body)!={'message'}:raise ValueError('Invalid request')
  print(json.dumps(respond(body['message']),ensure_ascii=False))
 except Exception:
  # Do not expose filesystem paths, prompts or traceback to clients.
  print(json.dumps({'error':'AI_UNAVAILABLE'}));sys.exit(1)
