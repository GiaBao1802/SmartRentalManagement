(() => {
  const G = window.GT;
  const tenantRoot = document.getElementById('v-tenant');
  const searchRoot = document.getElementById('v-room-search');
  if (!G || !tenantRoot || !searchRoot) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iso = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
  const dateText = value => value ? new Date(value+'T00:00:00').toLocaleDateString('vi-VN') : '—';
  const money = value => Number(value||0).toLocaleString('vi-VN')+' ₫';
  const tenant = () => G.T.find(t => t.cccd === G.currentUser?.cccd) || {};
  let weekShift = 0, tenantToastTimer, searchToastTimer, page = 1, pageSize = 6, query = '', province = '';
  const slots = ['06:00–08:00','08:00–10:00','10:00–12:00','12:00–14:00','14:00–16:00','16:00–18:00','18:00–20:00','20:00–22:00'];
  const notices = [
    ['Quan trọng','Lịch thanh toán tiền thuê','Vui lòng hoàn tất tiền thuê và hóa đơn dịch vụ trước ngày 10 hằng tháng.'],
    ['Bảo trì','Bảo trì hệ thống nước','Khu vực sẽ tạm ngưng cấp nước từ 09:00 đến 11:00 sáng thứ Tư.'],
    ['Chung','Cập nhật đăng ký tiện ích','Cư dân có thể đăng ký máy giặt, bếp chung và các tiện ích trên lịch tuần.'],
    ['Chung','Nhắc nhở an toàn','Vui lòng khóa cửa và giữ lối thoát hiểm thông thoáng.']
  ];
  const flash = (root, text, which) => {
    const node = root.querySelector(which);
    if (!node) return;
    node.textContent = text;
    node.classList.add('on');
    const old = which === '#tenantToast' ? tenantToastTimer : searchToastTimer;
    clearTimeout(old);
    const timer = setTimeout(() => node.classList.remove('on'), 2800);
    if (which === '#tenantToast') tenantToastTimer = timer; else searchToastTimer = timer;
  };
  const openModal = id => { const modal=tenantRoot.querySelector(id); modal?.classList.add('open'); modal?.setAttribute('aria-hidden','false'); };
  const closeModal = modal => { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); };

  function renderTenantInfo() {
    const t=tenant(), c=G.cOf(t), a=G.aOf(t.area);
    const items=[['Họ và tên',t.name||G.currentUser?.n||'Cư dân'],['CCCD',t.cccd||'—'],['Số điện thoại',t.phone||'—'],['Phòng',(t.room||'—')+(a?' · '+a.n:'')],['Thời hạn thuê',c?dateText(c.s)+' – '+dateText(c.e):'Chưa có hợp đồng'],['Số tiền cọc',c?money(c.dep):'—']];
    tenantRoot.querySelector('#tenantInfo').innerHTML=items.map(x=>'<div class="tenant-info-item"><small>'+esc(x[0])+'</small><strong>'+esc(x[1])+'</strong></div>').join('');
    tenantRoot.querySelector('#tenantGreeting').textContent=(t.name||G.currentUser?.n||'cư dân').split(' ')[0];
    tenantRoot.querySelector('#tenantNavUser').textContent=(t.name||'Cư dân')+' · Phòng '+(t.room||'—');
    searchRoot.querySelector('#roomSearchUser').textContent=(t.name||'Cư dân')+' · Phòng '+(t.room||'—');
  }
  function renderNotices() {
    tenantRoot.querySelector('#tenantNotices').innerHTML=notices.map((n,i)=>'<article class="tenant-notice"><div class="tenant-notice-top"><span class="tenant-tag '+(i===0?'important':'')+'">'+esc(n[0])+'</span><time>'+dateText(G.off(-i))+'</time></div><div class="tenant-notice-title">'+esc(n[1])+'</div><p>'+esc(n[2])+'</p></article>').join('');
  }
  function weekStart() {
    const d=new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7)+weekShift*7); d.setHours(0,0,0,0); return d;
  }
  function ensureDemoBookings() {
    G.B=Array.isArray(G.B)?G.B:[];
    if(G.B.length) return;
    const start=weekStart(), add=(day,service,time,room,cccd)=>{const d=new Date(start);d.setDate(start.getDate()+day);return {id:'BK-DEMO-'+day+'-'+service.replace(/\W/g,''),amenity:service,date:iso(d),time,room,cccd,status:'Đã xác nhận'};};
    G.B=[add(1,'Máy giặt','08:00–10:00','A101',tenant().cccd),add(2,'Gym','16:00–18:00','A205','079112233445'),add(0,'Hồ bơi','10:00–12:00','C310','048055512345'),add(3,'Bếp chung','08:00–10:00','B102','001098765432')];
    G.save();
  }
  function renderCalendar() {
    ensureDemoBookings();
    const start=weekStart(), days=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
    const labelDate=d=>String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
    tenantRoot.querySelector('#tenantWeekLabel').textContent=labelDate(days[0])+' – '+labelDate(days[6])+'/'+days[6].getFullYear();
    tenantRoot.querySelector('#tenantCalendarHead').innerHTML='<tr><th class="time">Giờ</th>'+days.map((d,i)=>'<th>'+['T2','T3','T4','T5','T6','T7','CN'][i]+'<br>'+labelDate(d)+'</th>').join('')+'</tr>';
    const filter=tenantRoot.querySelector('#tenantAmenity').value||'Tất cả', t=tenant();
    tenantRoot.querySelector('#tenantCalendarBody').innerHTML=slots.map(time=>'<tr><td class="time">'+time+'</td>'+days.map(d=>{
      const item=G.B.find(b=>b.date===iso(d)&&b.time===time&&(filter==='Tất cả'||b.amenity===filter));
      if(!item)return '<td></td>';
      const mine=item.cccd===t.cccd;
      return '<td class="'+(mine?'mine':'booked')+'" title="'+esc(item.amenity)+' · '+esc(item.room||'')+'">'+esc(item.amenity)+' · '+(mine?'Bạn':esc(item.room||'Đã đặt'))+'</td>';
    }).join('')+'</tr>').join('');
  }
  function renderTenant() {
    if(!G.UT?.length) return;
    const opts=G.UT.map(x=>'<option value="'+esc(x.n)+'">'+esc(x.n)+'</option>').join('');
    tenantRoot.querySelector('#tenantAmenity').innerHTML='<option value="Tất cả">Tất cả tiện ích</option>'+opts;
    tenantRoot.querySelector('#tenantBookingForm [name="amenity"]').innerHTML='<option value="">Chọn tiện ích</option>'+opts;
    renderTenantInfo(); renderNotices(); renderCalendar();
  }

  function renderRooms() {
    const all=G.vacant().filter(x=>!province||x.a.p===province).filter(x=>{
      const hay=[x.a.ad,x.a.n,x.a.p,x.room,x.a.pf].join(' ').toLocaleLowerCase('vi');
      return !query||hay.includes(query.toLocaleLowerCase('vi'));
    });
    const pages=Math.max(1,Math.ceil(all.length/pageSize)); page=Math.min(page,pages);
    const list=all.slice((page-1)*pageSize,page*pageSize);
    searchRoot.querySelector('#tenantRoomCount').textContent='Tìm thấy '+all.length+' phòng trống';
    searchRoot.querySelector('#tenantRoomPaginationLabel').textContent=all.length?'Hiển thị '+((page-1)*pageSize+1)+'–'+Math.min(page*pageSize,all.length)+' / '+all.length:'Không có phòng phù hợp';
    searchRoot.querySelector('#tenantRoomCards').innerHTML=list.map(x=>{
      const manager=G.T.find(t=>t.name===x.a.mg), phone=manager?.phone||'0901 234 567';
      const map='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(x.a.ad+', '+x.a.p);
      return '<article class="room-card"><div class="room-photo" aria-label="Ảnh phòng minh họa">⌂</div><div class="room-content"><div class="room-title">Phòng '+esc(x.room)+' · '+esc(x.a.n)+'</div><div class="room-province">'+esc(x.a.ad)+' · '+esc(x.a.p)+'</div><div class="room-price">'+money(x.a.gia)+' <small>/ tháng</small></div><div class="room-meta">Diện tích: '+esc(x.a.dt||'—')+' m² · Tầng '+x.fl+'</div><div class="room-meta">Chủ trọ: '+esc(x.a.mg||'Góc Trọ')+'</div><a class="room-map" target="_blank" rel="noopener" href="'+map+'">Xem Google Maps ↗</a></div><div class="room-actions"><a class="tenant-button primary" href="tel:'+esc(phone.replace(/\s/g,''))+'">Liên hệ chủ trọ</a><button class="tenant-button" type="button" data-report-room="'+esc(x.a.c+'|'+x.room)+'">Báo cáo</button></div></article>';
    }).join('')||'<div class="tenant-card"><div class="tenant-card-body">Chưa tìm thấy phòng trống theo bộ lọc này.</div></div>';
    searchRoot.querySelector('#tenantRoomPagination').innerHTML=Array.from({length:pages},(_,i)=>'<button class="tenant-button '+(i+1===page?'current':'')+'" type="button" data-room-page="'+(i+1)+'">'+(i+1)+'</button>').join('');
  }

  tenantRoot.addEventListener('click',e=>{
    const open=e.target.closest('[data-tenant-open]');
    if(open){openModal(open.dataset.tenantOpen==='booking'?'#tenantBookingModal':'#tenantComplaintModal');return;}
    const close=e.target.closest('[data-tenant-close]');
    if(close){closeModal(close.closest('.tenant-modal'));return;}
    if(e.target.classList.contains('tenant-modal'))closeModal(e.target);
  });
  tenantRoot.querySelector('#tenantAmenity').addEventListener('change',renderCalendar);
  tenantRoot.querySelector('#tenantWeekPrev').addEventListener('click',()=>{weekShift--;renderCalendar();});
  tenantRoot.querySelector('#tenantWeekNext').addEventListener('click',()=>{weekShift++;renderCalendar();});
  tenantRoot.querySelector('#tenantBookingForm').addEventListener('submit',e=>{
    e.preventDefault(); const form=e.currentTarget, data=Object.fromEntries(new FormData(form)), t=tenant();
    if(G.B.some(b=>b.date===data.date&&b.time===data.time&&b.amenity===data.amenity&&b.status!=='Đã hủy')){flash(tenantRoot,'Khung giờ này đã có người đăng ký. Hãy chọn giờ khác.','#tenantToast');return;}
    G.B.push({id:'BK-'+Date.now(),amenity:data.amenity,date:data.date,time:data.time,note:data.note,room:t.room,cccd:t.cccd,status:'Đã xác nhận'});G.save();form.reset();closeModal(tenantRoot.querySelector('#tenantBookingModal'));renderCalendar();flash(tenantRoot,'Đã đăng ký tiện ích thành công.','#tenantToast');
  });
  tenantRoot.querySelector('#tenantComplaintForm').addEventListener('submit',e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),t=tenant();
    const next=(G.KN||[]).reduce((m,x)=>Math.max(m,Number(String(x.id||'').replace(/\D/g,''))||0),0)+1;
    G.KN=G.KN||[];G.KN.unshift({id:'KN-'+String(next).padStart(4,'0'),cccd:t.cccd,room:t.room,type:data.type,content:data.content.trim(),created:G.today(),status:'Chờ xử lý',priority:/thiết bị|cơ sở vật chất/i.test(data.type)?'Cao':'Trung bình'});
    G.save();e.currentTarget.reset();closeModal(tenantRoot.querySelector('#tenantComplaintModal'));flash(tenantRoot,'Đã gửi khiếu nại đến chủ trọ.','#tenantToast');
  });
  searchRoot.querySelector('#tenantRoomFilter').addEventListener('submit',e=>{e.preventDefault();query=searchRoot.querySelector('#tenantRoomKeyword').value.trim();province=searchRoot.querySelector('#tenantRoomProvince').value;page=1;renderRooms();});
  searchRoot.querySelector('#tenantRoomFilter').addEventListener('reset',()=>setTimeout(()=>{query='';province='';page=1;renderRooms();},0));
  searchRoot.querySelector('#tenantRoomPagination').addEventListener('click',e=>{const b=e.target.closest('[data-room-page]');if(b){page=Number(b.dataset.roomPage);renderRooms();searchRoot.querySelector('#tenantRoomCards').scrollIntoView({behavior:'smooth',block:'start'});}});
  searchRoot.querySelector('#tenantRoomCards').addEventListener('click',e=>{
    const b=e.target.closest('[data-report-room]');if(!b)return;
    const text=window.prompt('Mô tả vấn đề bạn muốn báo cáo về nhà trọ này:');if(!text?.trim())return;
    let reports=[];try{reports=JSON.parse(localStorage.getItem('gt_room_reports')||'[]');}catch(_){}
    reports.push({id:'RP-'+Date.now(),room:b.dataset.reportRoom,content:text.trim(),created:G.today(),user:G.currentUser?.cccd||''});localStorage.setItem('gt_room_reports',JSON.stringify(reports));flash(searchRoot,'Đã ghi nhận báo cáo nhà trọ của bạn.','#roomSearchToast');
  });

  const provinces=Array.from(new Set(G.A.map(a=>a.p).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'vi'));
  searchRoot.querySelector('#tenantRoomProvince').insertAdjacentHTML('beforeend',provinces.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join(''));
  renderTenant();renderRooms();
})();
