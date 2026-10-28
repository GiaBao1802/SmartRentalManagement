const $=id=>document.getElementById(id);let revision=0,controller;
const money=n=>new Intl.NumberFormat('vi-VN').format(n)+' đ';
function invalidate(){revision++;controller?.abort();$('confirmed').checked=false;$('cards').replaceChildren();$('status').textContent='Phạm vi đã đổi. Kiểm tra và xác nhận lại.';$('interpret').disabled=false;$('view').disabled=false;}
async function post(path,body,signal){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(65000)])});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
for(const id of ['question','task','period','room'])$(id).addEventListener('input',invalidate);
$('confirmed').addEventListener('change',()=>{if(!$('confirmed').checked)invalidate();});
$('interpret').addEventListener('click',async()=>{
 invalidate();const own=revision;controller=new AbortController();$('interpret').disabled=true;$('task').value='';$('interpret-status').textContent='Qwen đang phân loại câu hỏi…';
 try{const data=await post('/demo/interpret',{question:$('question').value},controller.signal);if(own!==revision)return;$('task').value=data.task==='clarify'?'':data.task;$('interpret-status').textContent=data.message;}
 catch(error){if(own===revision)$('interpret-status').textContent=error.message+' Bạn có thể chọn trực tiếp.';}
 finally{if(own===revision)$('interpret').disabled=false;}
});
$('query').addEventListener('submit',async event=>{
 event.preventDefault();if(!$('confirmed').checked)return;
 controller?.abort();controller=new AbortController();const own=++revision;$('view').disabled=true;$('cards').replaceChildren();$('status').textContent='Đang đọc hóa đơn mẫu…';
 try{const data=await post('/demo/answer',{confirmed:true,task:$('task').value,period:$('period').value,room:$('room').value},controller.signal);if(own!==revision)return;
 $('title').textContent=data.title;$('status').textContent=data.summary;
 for(const card of data.cards){const el=document.createElement('article');el.className='card';
 const h=document.createElement('h3');h.textContent=`${card.room} · ${card.property}`;el.append(h);
 const badge=document.createElement('span');badge.className='badge';badge.textContent=card.status;el.append(badge);
 const period=document.createElement('p');period.className='help';period.textContent=`${card.id} · Kỳ ${card.period}`;el.append(period);
 const amount=document.createElement('p');amount.className='amount';amount.textContent=card.total===null?'Chưa có số tiền đã chốt':money(card.total)+' · tổng hóa đơn';el.append(amount);
 const list=document.createElement('ul');for(const detail of card.details){const li=document.createElement('li');li.textContent=detail;list.append(li);}el.append(list);$('cards').append(el);}
 if(!data.cards.length)$('status').textContent+=' Không có hóa đơn phù hợp; kiểm tra kỳ hoặc phòng đã chọn.';
 }catch(error){if(own===revision)$('status').textContent=error.message;}
 finally{if(own===revision)$('view').disabled=false;}
});
try{const response=await fetch('/demo/status');if(!response.ok)throw new Error();const data=await response.json();$('asof').textContent=data.asOf;
 $('status').textContent=data.roomCount?`Đã tải ${data.roomCount} phòng giả lập thuộc tài khoản này. Chọn kỳ để xem kết quả.`:'Tài khoản này chưa có bộ phòng thử nghiệm được gán.';
 for(const [value,label] of Object.entries(data.tasks))$('task').add(new Option(label,value));
 for(const period of data.periods)$('period').add(new Option(period,period));for(const room of data.rooms)$('room').add(new Option(room,room));
}catch{$('status').textContent='Chưa tải được dữ liệu mẫu. Hãy tải lại trang.';$('view').disabled=true;}
