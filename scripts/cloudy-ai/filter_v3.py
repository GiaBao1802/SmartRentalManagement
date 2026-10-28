"""Standalone experimental filter parser. No database access. V2 API adapter is unchanged."""
import json, re, sys, time
from decimal import Decimal, InvalidOperation
from filter_v2 import ask_model, norm

N = r'\d+(?:[.,]\d+)?'
U = r'(?:trieu|tr|nghin|ngan|k|dong|vnd|met vuong|m2)'
TOKEN = rf'{N}\s*{U}(?:(?<=tr)\d+|\s+{N}\s*(?:nghin|ngan)|\s+ruoi)?'
RANGE = re.compile(rf'(?<!\w)(tu)\s+({N})\s*({U})?\s*den\s*({N})\s*({U})(?!\w)')
SINGLE = re.compile(rf'(?<![\w.,])({TOKEN})(?!\w)')
OPS = {
 'khong lon hon':'lte', 'khong cao hon':'lte','khong tren':'lte',
 'khong vuot qua':'lte','khong qua':'lte','toi da':'lte',
 'khong nho hon':'gte','khong thap hon':'gte','khong duoi':'gte',
 'it nhat':'gte','toi thieu':'gte','tu':'gte',
 'nho hon':'lt','thap hon':'lt','duoi':'lt',
 'lon hon':'gt','cao hon':'gt','tren':'gt','hon':'gt',
 'dung':'eq','bang':'eq'
}
OP_PATTERN = re.compile(r'(?<!\w)('+ '|'.join(re.escape(k) for k in sorted(OPS,key=len,reverse=True)) +r')\s*$')
WORDS = {'mot':'1','hai':'2','ba':'3','bon':'4','nam':'5','sau':'6','bay':'7','tam':'8','chin':'9','muoi':'10'}

def normalized(s):
    s=norm(s)
    # Unambiguous repeated three-digit grouping. Do not silently guess single separators.
    s=re.sub(r'(?<![\w.,])\d{1,3}(?:\.\d{3}){2,}(?![\d.,])',lambda m:m[0].replace('.',''),s)
    s=re.sub(r'(?<![\w.,])\d{1,3}(?:,\d{3}){2,}(?![\d.,])',lambda m:m[0].replace(',',''),s)
    for word,digit in WORDS.items():
        s=re.sub(r'\b'+word+r'(?=\s+(?:trieu|nghin|ngan|met vuong|nguoi)\b)',digit,s)
    return s

def numeric_value(token):
    m=re.fullmatch(rf'({N})\s*({U})(.*)',token.strip())
    if not m: raise ValueError('Cách viết số hoặc đơn vị chưa hỗ trợ.')
    num,unit,tail=m[1],m[2],m[3].strip()
    # 2.800 can mean 2800 or 2.8; clarify instead of making a locale assumption.
    if re.search(r'[.,]\d{3}$',num): raise ValueError('Dấu phân cách số chưa rõ; hãy viết số tiền bằng đồng, không dấu phân cách.')
    v=Decimal(num.replace(',','.'))
    kind='area' if unit in ['m2','met vuong'] else 'price'
    factor=1000000 if unit in ['trieu','tr'] else 1000 if unit in ['nghin','ngan','k'] else 1
    v*=factor
    if tail:
        if factor!=1000000: raise ValueError('Cách viết phần lẻ chưa hỗ trợ.')
        if tail=='ruoi': v+=500000
        elif tail.isdigit(): v+=Decimal('0.'+tail)*1000000
        elif re.fullmatch(rf'{N}\s*(?:nghin|ngan)',tail): v+=Decimal(re.match(N,tail)[0].replace(',','.'))*1000
        else: raise ValueError('Cách viết số chưa hỗ trợ.')
    if v<=0: raise ValueError('Bản thử yêu cầu giá và diện tích lớn hơn 0.')
    if kind=='price' and v!=v.to_integral_value(): raise ValueError('Hãy ghi giá bằng số nguyên đồng.')
    return kind,int(v) if v==v.to_integral_value() else float(v)

def extract(question):
    start=time.perf_counter()
    out={'status':'ready','intent':'search_rooms','filters':{'price':[],'area':[],'location':None,'amenities':[],'occupants':None},'questions':[],'unsupported':[],'evidence':[]}
    def issue(msg):
        if msg not in out['questions']: out['questions'].append(msg)
        out['status']='needs_clarification'
    def finish():
        if out['unsupported'] and not out['questions']: out['status']='unsupported'
        if out['status']!='ready': out['draftFilters']=out.pop('filters')
        out['seconds']=round(time.perf_counter()-start,2)
        return out
    if not isinstance(question,str) or not question.strip() or len(question)>1500:
        issue('Hãy nhập câu tìm phòng từ 1 đến 1500 ký tự.'); return finish()
    t=normalized(question)
    if re.search(r'bo qua.*huong dan|system prompt|maxprice|minarea|tra.*json|ignore.*instruction',t):
        issue('Hãy chỉ mô tả điều kiện phòng, không yêu cầu sửa JSON.'); return finish()
    try:
        model=ask_model(question)
        if not isinstance(model,dict) or model.get('intent') not in ['search_rooms','unknown'] or (model.get('locationQuote') is not None and not isinstance(model['locationQuote'],str)):
            raise ValueError('Phản hồi model không hợp lệ')
    except Exception as e:
        out['status']='error';out['questions']=['Không nhận được phản hồi model hợp lệ.'];out['error']=str(e);return finish()
    out['modelExtraction']=model
    if model['intent']=='unknown' or re.search(r'khong (?:muon|can) (?:tim|thue) phong',t):
        out['intent']='unknown';out['unsupported']=['Câu này không phải yêu cầu tìm phòng.'];return finish()
    masked=list(t)
    def residual(): return ''.join(masked)
    def consume(a,b): masked[a:b]=' '*(b-a)
    def add(kind,op,v,quote):
        out['filters'][kind].append({'op':op,'value':v})
        out['evidence'].append({'field':kind,'quote':quote,'normalized':True})
    def preceded_by_negation(pos):
        return bool(re.search(r'\b(khong|chang|chua|tru)\s*$',t[:pos]))
    # Accept only literal location spans following a location marker; do not blacklist
    # words such as "phong" or "gia" occurring inside genuine place names.
    location=model.get('locationQuote')
    if location and location in question:
        loc=normalized(location)
        matches=list(re.finditer(r'\b(?:o|tai|khu vuc)\s+('+re.escape(loc)+r')(?!\w)',t))
        forbidden=re.search(r'\b(?:khong|toi da|toi thieu|duoi|tren|may lanh|nuoi|gia thue|dien tich|va|hoac)\b|\d\s*(?:trieu|m2|dong)',loc)
        if len(matches)==1 and not forbidden and 0<len(loc)<=100 and len(loc.split())<=10:
            m=matches[0]
            if preceded_by_negation(m.start()): issue('Bản thử chưa xử lý loại trừ địa điểm; hãy diễn đạt lại.')
            else:
                out['filters']['location']=location;consume(*m.span())
                out['evidence'].append({'field':'location','quote':location})
    # Specific supported amenities. A negative modifier is left for the residual guard.
    for phrase,label in [('may lanh','air_conditioning'),('nuoi meo','cats_allowed'),('nuoi cho','dogs_allowed')]:
        for m in re.finditer(r'\b'+phrase+r'\b',t):
            out['filters']['amenities'].append(label);consume(*m.span())
            out['evidence'].append({'field':'amenities','quote':phrase,'normalized':True})
    out['filters']['amenities']=list(dict.fromkeys(out['filters']['amenities']))
    if re.search(r'(?<!\d)-\s*\d',t): issue('Không chấp nhận số âm; với khoảng hãy viết từ ... đến ... rõ ràng.')
    if re.search(r'\b(?:hoac|hay la|sua lai|doi thanh|khong phai|dung lay)\b',t): issue('Hãy nhập một bộ điều kiện cuối cùng; bản thử chưa xử lý lựa chọn hoặc sửa ý.')
    if re.search(r'\b(?:re|rong rong|tam|khoang)\b',t): issue('Bạn vui lòng ghi mức giá/diện tích và giới hạn cụ thể.')
    try:
        for m in RANGE.finditer(t):
            if not residual()[m.start():m.end()].strip(): continue
            if preceded_by_negation(m.start()): issue('Bản thử chưa xử lý phủ định một khoảng; hãy ghi lại điều kiện.')
            k1,v1=numeric_value(m[2]+' '+(m[3] or m[5]));k2,v2=numeric_value(m[4]+' '+m[5])
            if k1!=k2: raise ValueError('Hai đầu khoảng phải cùng loại đơn vị.')
            add(k1,'gte',v1,m[0]);add(k2,'lte',v2,m[0]);consume(*m.span())
        for m in SINGLE.finditer(t):
            if not residual()[m.start():m.end()].strip(): continue
            kind,v=numeric_value(m[0]);op=OP_PATTERN.search(residual()[:m.start()])
            if op:
                if preceded_by_negation(op.start()): issue('Phủ định nhiều lớp chưa hỗ trợ; hãy diễn đạt lại.')
                add(kind,OPS[op[1]],v,t[op.start():m.end()]);consume(op.start(),m.end())
            else:
                issue('Hãy ghi rõ tối đa/tối thiểu/dưới/trên cho '+m[0]+'.');consume(*m.span())
            # Only consume monthly frequency immediately attached to a PRICE token.
            if kind=='price':
                freq=re.match(r'\s*(?:/\s*thang|moi thang|mot thang)\b',t[m.end():])
                if freq: consume(m.end(),m.end()+freq.end())
        for m in re.finditer(r'(?<![\w.,])('+N+r')\s+nguoi(?:\s+o\b)?',t):
            if not residual()[m.start():m.end()].strip(): continue
            v=Decimal(m[1].replace(',','.'))
            if v<=0 or v!=v.to_integral_value(): issue('Số người phải là số nguyên lớn hơn 0.')
            elif out['filters']['occupants'] is not None: issue('Hãy xác nhận một số người ở duy nhất.')
            else: out['filters']['occupants']=int(v)
            consume(*m.span())
        # A supported lack of price constraint is explicitly recognized, not guessed.
        for m in re.finditer(r'gia bao nhieu cung duoc',t):
            if out['filters']['price']: issue('Bạn vừa giới hạn giá vừa nói không giới hạn; hãy xác nhận mức giá cuối cùng.')
            consume(*m.span())
        rest=residual()
        if re.search(r'\bnguoi\b',rest): issue('Bạn vui lòng ghi rõ số người ở bằng một số nguyên dương.')
        if re.search(r'\b(?:gia|ngan sach)\b',rest) and not out['filters']['price']:
            issue('Bạn muốn mức giá bao nhiêu đồng/tháng? Nếu không giới hạn, hãy ghi rõ giá bao nhiêu cũng được.')
        if re.search(r'\b(?:rong|dien tich)\b',rest) and not out['filters']['area']:
            issue('Bạn muốn diện tích bao nhiêu m²?')
        if re.search(r'\b(?:o|tai|khu vuc)\b',rest): issue('Bạn vui lòng ghi rõ một địa điểm sau ở/tại/khu vực.')
        if re.search(r'\b(?:toi da|toi thieu|it nhat|tu|den|duoi|tren|nho hon|lon hon|khong qua)\b',rest):
            issue('Có điều kiện so sánh thiếu giá trị hoặc đơn vị; hãy ghi đầy đủ.')
        if re.search(r'\d',rest): issue('Có số chưa xác định được đơn vị; hãy ghi đồng/tháng, m² hoặc số người.')
        # Terminal interrogative "không?" is allowed; other unconsumed negations block.
        rest=re.sub(r'\bkhong\s*\?\s*$',' ',rest)
        if re.search(r'\b(?:khong|chang|chua|tru)\b',rest): issue('Có điều kiện phủ định chưa xử lý được; hãy diễn đạt lại.')
        # Only discourse words are ignorable. Operators and locations are consumed
        # with their values above, never globally discarded as in V2.
        allowed=set('cho minh toi ban em anh chi tim thue phong tro can muon co nao giup va voi thi la duoc gia ngan sach rong dien tich nguoi nhe a de xin hay kiem dang mot'.split())
        unknown=[w for w in re.findall(r'\w+',rest) if w not in allowed]
        if unknown: out['unsupported'].append('Chưa xử lý đầy đủ: '+' '.join(dict.fromkeys(unknown)))
        for kind in ['price','area']:
            terms=out['filters'][kind]
            lows=[c for c in terms if c['op'] in ['gte','gt','eq']];highs=[c for c in terms if c['op'] in ['lte','lt','eq']]
            for lo in lows:
                for hi in highs:
                    if lo['value']>hi['value'] or (lo['value']==hi['value'] and (lo['op']=='gt' or hi['op']=='lt')):
                        issue('Giới hạn giá hoặc diện tích mâu thuẫn; hãy sửa lại.')
    except (ValueError,InvalidOperation) as e: issue(str(e))
    return finish()

if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    q=' '.join(sys.argv[1:]) if len(sys.argv)>1 else input('Nhập câu tìm phòng: ')
    print(json.dumps(extract(q),ensure_ascii=False,indent=2))
