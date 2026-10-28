const $ = id => document.getElementById(id);
const form = $('preferences');
let controller = null, revision = 0;
const money = n => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const labels = { cooking:'Nấu ăn', parking:'Chỗ xe', pets:'Thú cưng', ac:'Máy lạnh' };
const fieldLabels={budget:'Ngân sách',destination:'Điểm đến',mode:'Phương tiện',maxMinutes:'Thời gian đi lại',people:'Số người',late:'Ra vào khuya',required:'Tiện ích',priority:'Ưu tiên'};
const escape = value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function preferences() {
  const data = new FormData(form);
  return { budget:Number(data.get('budget')), destination:data.get('destination'), mode:data.get('mode'),
    maxMinutes:Number(data.get('maxMinutes')), people:Number(data.get('people')), late:data.has('late'),
    required:data.getAll('required'), priority:data.get('priority'), note:data.get('note') };
}
async function post(path,body,signal) {
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(path==='/demo/candidates'?5000:path==='/demo/select'?910000:65000)])});
  const value=await response.json(); if(!response.ok)throw new Error(value.error || 'Không kết nối được demo.'); return value;
}
function invalidate(event) {
  revision++;controller?.abort();$('confirmed').checked=false;$('confirmed').disabled=false;
  $('find').disabled=false;$('extract').disabled=false;$('extract').textContent='1. Nhờ AI đọc nhu cầu';
  $('cards').replaceChildren();$('audit').hidden=true;$('result-count').textContent='Chưa cập nhật';
  $('status').textContent='Tiêu chí đã đổi. Hãy kiểm tra và xác nhận để tìm lại.';$('ai-source').textContent='Chưa có lựa chọn cho tiêu chí mới.';
  if(event?.target?.id==='note') {$('proposal-status').textContent='Mô tả đã đổi; hãy phân tích lại hoặc tự sửa tiêu chí.';$('evidence').replaceChildren();}
}
form.addEventListener('input',event=>{if(event.target?.id!=='confirmed'||!$('confirmed').checked)invalidate(event);});
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
  form.reset();
  const notes={night:'Mình ở 1 người, đi xe máy tới Văn phòng B tối đa 30 phút, về lúc 1 giờ sáng, cần nấu ăn và có chỗ xe, ngân sách tổng 4 triệu, ưu tiên đi gần.',pets:'Mình ở 1 người, đi xe máy tới Trường A tối đa 30 phút, nuôi mèo, cần nấu ăn và chỗ để xe, ngân sách tổng 4 triệu, ưu tiên đi gần.',student:'Mình ở 1 người, đi xe buýt tới Trường A tối đa 45 phút, ngân sách tổng 3 triệu, cần nấu ăn, ưu tiên giá rẻ.'};
  $('note').value=notes[button.dataset.preset];invalidate({target:$('note')});
}));
$('extract').addEventListener('click',async()=>{
  const note=$('note').value.trim(); if(!note){$('proposal-status').textContent='Hãy nhập nhu cầu trước.';return;}
  invalidate();controller=new AbortController();const own=revision;
  $('confirmed').disabled=true;$('extract').disabled=true;$('extract').textContent='Qwen đang đọc nhu cầu…';$('find').disabled=true;
  $('proposal-status').textContent='Đang phân tích trên máy của bạn; có thể mất đến 60 giây.';
  $('evidence').replaceChildren();
  try {
    const result=await post('/demo/extract',{note},controller.signal);if(own!==revision)return;
    if(result.source!=='ollama'){$('proposal-status').textContent=result.message+' Kiểm tra và tự nhập tất cả tiêu chí trước khi xác nhận.';return;}
    const p=result.proposal;
    for(const [key,value] of Object.entries(p.criteria)) {
      if(value===null){
        if(key==='late')form.elements.namedItem('late').checked=false;
        else if(key==='required')form.querySelectorAll('[name="required"]').forEach(n=>{n.checked=false;});
        else $(key).value='';
        continue;
      }
      if(key==='late')form.elements.namedItem('late').checked=value;
      else if(key==='required')form.querySelectorAll('[name="required"]').forEach(n=>{n.checked=value.includes(n.value);});
      else $(key).value=String(value);
    }
    $('proposal-status').textContent=p.missing.length ? `AI chưa xác định: ${p.missing.map(k=>fieldLabels[k]).join(', ')}. Các ô chưa rõ đã được xóa giá trị cũ. Hãy điền lại; ô điều kiện bỏ chọn nghĩa là không bắt buộc sau khi bạn xác nhận.` : 'AI đã điền đề xuất. Hãy kiểm tra ý nghĩa và sửa nếu chưa đúng trước khi xác nhận.';
    $('evidence').innerHTML=Object.entries(p.evidence).filter(([k])=>p.criteria[k]!==null).map(([k,v])=>`<li>${fieldLabels[k]}: “${escape(v)}”</li>`).join('')+p.questions.map(q=>`<li>Cần làm rõ: ${escape(q.replace(/\b(budget|destination|mode|maxMinutes|people|late|required|priority)\b/g,k=>fieldLabels[k]))}</li>`).join('');
  }catch(error){if(own===revision)$('proposal-status').textContent='Chưa phân tích được. Hãy thử lại hoặc tự điền tiêu chí.';}
  finally{if(own===revision){$('confirmed').disabled=false;$('confirmed').checked=false;$('extract').disabled=false;$('extract').textContent='1. Nhờ AI đọc nhu cầu';$('find').disabled=false;}}
});
function render(result) {
  $('result-count').textContent = `${result.eligibleCount}/${result.inventoryCount} phù hợp`;
  $('cards').innerHTML = result.cards.length ? result.cards.map((card,index) => `<article class="room-card">
    <div class="room-art" aria-hidden="true"><div class="window-art"><i></i><i></i><i></i><i></i></div><small>PHÒNG MẪU</small></div>
    <div><div class="room-top"><div><span class="room-id">${escape(card.id)} · ${card.area} M²</span><h3>${escape(card.name)}</h3></div><span class="rank">GỢI Ý ${index+1}</span></div>
    <p class="price">${money(card.total)} <small>/ tháng · mẫu</small></p><p class="breakdown">Thuê ${money(card.rent)} + sinh hoạt giả định ${money(card.expenses)}. ${escape(card.costNote||'')}</p>
    <div class="tags"><span class="tag">${card.minutes} phút · giả lập</span>${card.features.map(key=>`<span class="tag">${labels[key]}</span>`).join('')}<span class="tag">${escape(card.accessLabel||(card.late?'Ra vào 24h':'Đóng cửa 23h'))}</span></div>
    <p class="explanation" id="explanation-${escape(card.id)}">${escape(card.explanation)}</p>
    <p class="comparison">${escape(card.tradeoff || "")}</p><details><summary>Điểm cần cân nhắc</summary><ul>${card.concerns.map(text=>`<li>${escape(text)}</li>`).join('')}</ul></details></div></article>`).join('')
    : '<div class="empty-start"><h3>Chưa có góc trọ đáp ứng đủ.</h3><p>Bạn có thể chủ động đổi ngân sách, thời gian đi lại hoặc tiện ích.<br>Demo không tự bỏ điều kiện bạn đã chọn.</p></div>';
  const reasons = {invalid:'Dữ liệu phòng không hợp lệ',unavailable:'Không còn trống',budget:'Vượt ngân sách tổng',capacity:'Không đủ sức chứa',late:'Không ra vào được 24 giờ',amenities:'Thiếu tiện ích bắt buộc',travel:'Quá thời gian đi lại',unknown:'Chưa có dữ liệu đường đi đáng tin cậy'};
  $('exclusions').innerHTML = Object.entries(result.excluded).filter(([,count])=>count).map(([key,count])=>`<li>${reasons[key]}: ${count} phòng</li>`).join('');
  $('audit').hidden = false;
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!$('confirmed').checked){$('status').textContent='Bạn cần xác nhận các tiêu chí trước.';return;}
  controller?.abort();controller=new AbortController();const own=++revision;
  $('find').disabled=true;$('extract').disabled=true;$('cards').replaceChildren();$('audit').hidden=true;
  $('status').textContent='Đang lọc tất cả phòng theo điều kiện bắt buộc…';$('ai-source').textContent='Chưa chọn phòng.';
  let filtered;
  try {
    const body={confirmed:true,preferences:preferences()};
    filtered=await post('/demo/candidates',body,controller.signal);if(own!==revision)return;
    $('result-count').textContent=`${filtered.eligibleCount}/${filtered.inventoryCount} đủ điều kiện`;
    if(!filtered.eligibleCount){render(filtered);$('status').textContent='Không có phòng đáp ứng đủ. Không gọi AI và không tự nới điều kiện.';return;}
    $('status').textContent=`Đã lọc được ${filtered.eligibleCount} phòng. Qwen đang so sánh và chọn tối đa 3 phòng…`;
    $('ai-source').textContent=filtered.eligibleCount>24?'AI xét toàn bộ ứng viên theo nhóm tối đa 24 rồi chọn tiếp qua nhiều vòng. Có thể mất vài phút, tối đa 15 phút; đổi tiêu chí để hủy.':'AI có thể chọn trong toàn bộ nhóm đủ điều kiện. Chờ tối đa 60 giây.';
    const result=await post('/demo/select',body,controller.signal);if(own!==revision)return;
    render(result);$('status').textContent=result.message;
    $('ai-source').textContent=result.source==='ollama'?'Nguồn lựa chọn: Qwen3 1.7B · Ưu điểm và đánh đổi lấy từ dữ liệu đã kiểm tra.':'Nguồn lựa chọn: bộ lọc dự phòng, không phải AI.';
  }catch(error){if(own===revision){$('cards').replaceChildren();$('status').textContent=error.message;$('ai-source').textContent='Chưa có lựa chọn được xác nhận. Bạn có thể thử lại.';}}
  finally{if(own===revision){$('find').disabled=false;$('extract').disabled=false;}}
});
