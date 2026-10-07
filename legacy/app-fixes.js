(() => {
 const G=window.GT, root=document.querySelector('#v-qt');
 if(!G||!root)return;
 // Rehydrate empty master lists in an existing browser snapshot so the demo stays usable.
 const offsetDate=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
 if(!G.A.length)G.A.push(...[
  {c:'KV01',n:'Tòa A',p:'TP. Hồ Chí Minh',pf:'A',ad:'12 Nguyễn Văn Linh, Q.7',r:20,gia:3500000,dt:25,mg:'Nguyễn Văn An',s:'Hoạt động',note:''},
  {c:'KV02',n:'Tòa B',p:'Hà Nội',pf:'B',ad:'88 Cầu Giấy, P. Dịch Vọng',r:16,gia:4200000,dt:30,mg:'Lê Thị Hoa',s:'Hoạt động',note:''},
  {c:'KV03',n:'Tòa C',p:'Đà Nẵng',pf:'C',ad:'45 Nguyễn Văn Thoại, Sơn Trà',r:30,gia:3200000,dt:28,mg:'Phạm Quốc Bảo',s:'Hoạt động',note:''},
  {c:'KV04',n:'Khu D',p:'TP. Hồ Chí Minh',pf:'D',ad:'25 Phan Văn Trị, Gò Vấp',r:30,gia:4500000,dt:30,mg:'',s:'Đang xây dựng',note:''},
  {c:'KV05',n:'Khu E',p:'Hà Nội',pf:'E',ad:'10 Trần Duy Hưng',r:10,gia:3000000,dt:22,mg:'Lê Thị Hoa',s:'Tạm ngưng',note:''}
 ]);
 if(!G.T.length)G.T.push(...[
  {name:'Nguyễn Văn A',cccd:'079012345678',phone:'0912 345 678',email:'vana@gmail.com',area:'KV01',room:'A101',status:'Đang ở',tt:'Đã đăng ký',kn:1,xe:[{l:'Xe máy',b:'59A1-123.45',sl:'S-12'}]},
  {name:'Trần Văn B',cccd:'079112233445',phone:'0945 678 901',email:'tranvanb@gmail.com',area:'KV01',room:'A205',status:'Đang ở',tt:'Chưa đăng ký',kn:0,xe:[]},
  {name:'Trần Thị B',cccd:'001098765432',phone:'0923 456 789',email:'mai.tran@gmail.com',area:'KV02',room:'B205',status:'Đang ở',tt:'Chưa đăng ký',kn:0,xe:[]},
  {name:'Lê Văn C',cccd:'048055512345',phone:'0934 567 890',email:'cuongle@gmail.com',area:'KV03',room:'C310',status:'Đã rời đi',tt:'Chưa đăng ký',kn:2,xe:[]},
  {name:'Phạm Thị D',cccd:'048077788899',phone:'0956 789 012',email:'dpham@gmail.com',area:'KV03',room:'C102',status:'Đang ở',tt:'Đã đăng ký',kn:0,xe:[]}
 ]);
 if(!G.C.length)G.C.push(...[
  {no:'HD001',cccd:'079012345678',area:'KV01',room:'A101',s:offsetDate(-270),e:offsetDate(95),dep:3500000,rent:3500000,ppl:2,e0:1250,w0:60,lastE:1330,lastW:74,signed:true,liq:null},
  {no:'HD002',cccd:'079112233445',area:'KV01',room:'A205',s:offsetDate(-215),e:offsetDate(25),dep:3500000,rent:3500000,ppl:1,e0:900,w0:40,lastE:980,lastW:52,signed:true,liq:null},
  {no:'HD003',cccd:'001098765432',area:'KV02',room:'B205',s:offsetDate(-200),e:offsetDate(10),dep:4200000,rent:4200000,ppl:2,e0:500,w0:30,lastE:610,lastW:41,signed:true,liq:null},
  {no:'HD004',cccd:'048055512345',area:'KV03',room:'C310',s:offsetDate(-480),e:offsetDate(-120),dep:3200000,rent:3200000,ppl:1,e0:100,w0:10,lastE:420,lastW:35,signed:true,liq:{d:offsetDate(-115),why:'Hết hạn',eEnd:420,wEnd:35,ded:0,refund:3200000}}
 ]);
 if(!G.I.length){const today=offsetDate(0),prev=offsetDate(-31),period=d=>d.slice(5,7)+'/'+d.slice(0,4);G.I.push(...[
  {id:'HD-101',no:'HD001',area:'KV01',room:'A101',cccd:'079012345678',per:period(today),total:4220000,eAmount:280000,wAmount:210000,st:'u',due:offsetDate(20)},
  {id:'HD-102',no:'HD003',area:'KV02',room:'B205',cccd:'001098765432',per:period(today),total:4770000,eAmount:385000,wAmount:165000,st:'p',due:offsetDate(20)},
  {id:'HD-203',no:'HD002',area:'KV01',room:'A205',cccd:'079112233445',per:period(prev),total:4090000,eAmount:280000,wAmount:180000,st:'u',due:offsetDate(-3)}
 ])}
 // Add one adjacent-period sample pair so Foxi can demonstrate a utility-spike check.
 const baselineInvoice=G.I.find(i=>i.id==='HD-101');
 if(baselineInvoice&&!G.I.some(i=>i.area===baselineInvoice.area&&i.room===baselineInvoice.room&&i.per!==baselineInvoice.per)){
  const now=new Date(),prior=new Date(now.getFullYear(),now.getMonth()-1,1),day=Math.min(now.getDate(),new Date(prior.getFullYear(),prior.getMonth()+1,0).getDate());prior.setDate(day);
  const period=String(prior.getMonth()+1).padStart(2,'0')+'/'+prior.getFullYear(),due=new Date(prior.getFullYear(),prior.getMonth(),5),iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  G.I.push({id:'HD-100',no:baselineInvoice.no,area:baselineInvoice.area,room:baselineInvoice.room,cccd:baselineInvoice.cccd,per:period,total:3715000,eAmount:140000,wAmount:75000,st:'p',due:iso(due)});
 }
 G.sync();G.save();G.subs.forEach(fn=>fn());
 const $=id=>root.querySelector('#'+id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let editing=-1,deleting=-1;
 const areaFor=code=>G.A.find(a=>a.c===code);
 const roomContract=(areaCode,room)=>G.C.filter(c=>c.area===areaCode&&c.room===room&&!c.liq&&(!c.e||c.e>=G.today())).sort((a,b)=>(b.s||'').localeCompare(a.s||''))[0]||null;
 const roomResidents=(areaCode,room,exclude=-1)=>G.T.filter((t,i)=>i!==exclude&&t.status==='Đang ở'&&t.area===areaCode&&t.room===room);
 const roomOptions=(areaCode, selected='')=>{
   const area=areaFor(areaCode);if(!area)return '<option value="">Chọn khu vực trước</option>';
   return '<option value="">Chọn phòng</option>'+G.rooms(area).map(r=>{
     const residents=roomResidents(areaCode,r,editing),contract=roomContract(areaCode,r),capacity=Math.max(1,Number(contract?.ppl)||1),full=residents.length>=capacity;
     const occupancy=`${residents.length}/${capacity} người`;
     return `<option value="${esc(r)}" ${selected===r?'selected':''} ${full&&selected!==r?'disabled':''}>${esc(r)} · ${occupancy}${full&&selected!==r?' · Đã đủ chỗ':''}</option>`;
   }).join('');
 };
 const fillAreas=selected=>{const prov=$('ktProv'),bld=$('ktBld');if(!prov||!bld)return;
   const provinces=[...new Set(G.A.map(a=>a.p))];prov.innerHTML=provinces.map(p=>`<option ${p===selected?'selected':''}>${esc(p)}</option>`).join('');
   const buildings=G.A.filter(a=>a.p===prov.value&&a.s==='Hoạt động');bld.innerHTML='<option value="">Chọn tòa nhà</option>'+buildings.map(a=>`<option value="${esc(a.c)}">${esc(a.n)}</option>`).join('');};
 const updateBuildings=selected=>{const p=$('ktProv')?.value, b=$('ktBld');if(!b)return;b.innerHTML='<option value="">Chọn tòa nhà</option>'+G.A.filter(a=>a.p===p&&a.s==='Hoạt động').map(a=>`<option value="${esc(a.c)}" ${a.c===selected?'selected':''}>${esc(a.n)}</option>`).join('');};
 const refreshFilters=()=>{const p=$('ktFP'),b=$('ktFB');if(!p||!b)return;let oldP=p.value,oldB=b.value;p.innerHTML='<option value="">Tất cả tỉnh / thành phố</option>'+[...new Set(G.A.map(a=>a.p))].map(x=>`<option>${esc(x)}</option>`).join('');p.value=oldP;const areas=G.A.filter(a=>!p.value||a.p===p.value);b.innerHTML='<option value="">Tất cả tòa nhà</option>'+areas.map(a=>`<option value="${esc(a.c)}">${esc(a.n)}</option>`).join('');b.value=oldB;};
 const render=()=>{refreshFilters();const query=$('ktFN').value.trim().toLowerCase(),idq=$('ktFC').value.trim(),prov=$('ktFP').value,bld=$('ktFB').value,status=$('ktFS').value,temp=$('ktFT').value,contract=$('ktFH').value;
   const unregistered=G.T.map((t,i)=>({t,i})).filter(({t})=>(t.tt||'Chưa đăng ký')!=='Đã đăng ký');
   $('ktUnregisteredCount').textContent=unregistered.length;
   $('ktUnregisteredRows').innerHTML=unregistered.map(({t})=>{const a=areaFor(t.area);return `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.cccd)}</td><td>${esc(a?.n||t.area||'—')}</td><td>${esc(t.room||'—')}</td><td><span class="chip ${t.status==='Đã rời đi'?'mut':'ok'}">${esc(t.status||'Đang ở')}</span></td></tr>`}).join('')||'<tr><td colspan="5" style="color:var(--mu)">Tất cả cư dân đã đăng ký tạm trú / tạm vắng.</td></tr>';
   let list=G.T.map((t,i)=>({t,i})).filter(({t})=>{const a=areaFor(t.area),c=G.cOf(t);const cs=!c?'Chưa có hợp đồng':c.liq?'Đã thanh lý':!c.signed?'Chờ ký':G.cSt(c);return(!query||t.name.toLowerCase().includes(query))&&(!idq||t.cccd.includes(idq))&&(!prov||(a&&a.p===prov))&&(!bld||t.area===bld)&&(!status||t.status===status)&&(!temp||t.tt===temp)&&(!contract||cs===contract)});
   $('ktTotal').textContent=G.T.length;
   $('ktRows').innerHTML=list.map(({t,i})=>{const a=areaFor(t.area),c=G.cOf(t),cs=!c?'Chưa có HĐ':c.liq?'Đã thanh lý':!c.signed?'Chờ ký':G.cSt(c),resident=t.status||'Đang ở',registration=t.tt||'Chưa đăng ký';return `<tr><td>${esc(a?.p||'—')}</td><td>${esc(a?.n||t.area)}</td><td>${esc(t.room||'—')}</td><td><b>${esc(t.name)}</b></td><td>${esc(t.cccd)}</td><td>${(t.xe||[]).length} xe</td><td>${esc(cs)}</td><td>${t.kn||0}</td><td><span class="chip ${registration==='Đã đăng ký'?'ok':'warn'}">${esc(registration)}</span></td><td><span class="chip ${resident==='Đang ở'?'ok':'mut'}">${esc(resident)}</span></td><td>${G.U.some(u=>u.cccd===t.cccd)?'Đã có':'—'}</td><td><button class="btn sm" data-edit-tenant="${i}">Sửa</button> <button class="btn sm r" data-delete-tenant="${i}">Xóa</button></td></tr>`}).join('')||'<tr><td colspan="12" style="color:var(--mu)">Không có khách thuê phù hợp</td></tr>';
   $('ktCount').textContent=`Hiển thị ${list.length} / ${G.T.length} khách thuê`;
 };
 const exportRegistrationForms=()=>{const people=G.T.filter(t=>(t.tt||'Chưa đăng ký')!=='Đã đăng ký');if(!people.length){alert('Hiện không có cư dân nào chưa đăng ký tạm trú / tạm vắng.');return}const h=v=>esc(v||'');const pages=people.map((t,i)=>{const a=areaFor(t.area),address=a?[a.ad,a.n,a.p].filter(Boolean).join(', '):t.area||'';return `<section class="page"><header><div>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br><b>Độc lập - Tự do - Hạnh phúc</b></div><h1>PHIẾU KHAI BÁO THÔNG TIN CƯ TRÚ</h1><p>(Dùng để kê khai thông tin đăng ký tạm trú / thông báo lưu trú hoặc khai báo tạm vắng)</p></header><p><b>1. Họ, chữ đệm và tên:</b> ${h(t.name)}</p><p><b>2. Số định danh cá nhân / CCCD:</b> ${h(t.cccd)}</p><p><b>3. Số điện thoại liên hệ:</b> ${h(t.phone)}　<b>Ngày sinh:</b> ................................　<b>Giới tính:</b> ........................</p><p><b>4. Nơi thường trú:</b> ................................................................................................................</p><p><b>5. Nơi đăng ký tạm trú / địa chỉ lưu trú:</b> ${h(address)}${t.room?`, phòng ${h(t.room)}`:''}</p><p><b>6. Nội dung khai báo:</b>　□ Đăng ký tạm trú　 □ Thông báo lưu trú　 □ Khai báo tạm vắng</p><p><b>7. Thời gian:</b> Từ ngày ....../....../.......... đến ngày ....../....../..........</p><p><b>8. Địa chỉ nơi đến (nếu tạm vắng):</b> .......................................................................................</p><p><b>9. Lý do / nội dung cần khai báo:</b></p><div class="lines"></div><p>Tôi cam đoan những nội dung kê khai trên là đúng sự thật và chịu trách nhiệm trước pháp luật về nội dung đã khai.</p><div class="sign"><div>NGƯỜI KHAI BÁO<br><small>(Ký và ghi rõ họ tên)</small><div class="space"></div>${h(t.name)}</div><div>Ngày ...... tháng ...... năm ..........<br><b>TIẾP NHẬN / XÁC NHẬN</b><div class="space"></div></div></div><footer>Thông tin cư dân hiện có đã được điền sẵn. Vui lòng kiểm tra, bổ sung các mục còn trống và xác nhận biểu mẫu với cơ quan có thẩm quyền trước khi sử dụng.</footer></section>`}).join('');const doc=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Biểu mẫu khai báo thông tin cư trú</title><style>body{font:14px Arial,sans-serif;color:#111;margin:0}.page{box-sizing:border-box;width:210mm;min-height:297mm;padding:20mm 22mm;margin:12px auto;background:#fff;page-break-after:always}header{text-align:center}header h1{font-size:18px;margin:28px 0 6px}header p{margin:0 0 24px;font-style:italic;font-size:12px}header div{line-height:1.6}section>p{line-height:1.7;margin:14px 0}.lines{height:66px;border-bottom:1px solid #888;background:repeating-linear-gradient(to bottom,transparent 0,transparent 31px,#aaa 32px)}.sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;text-align:center;margin-top:34px;line-height:1.6}.space{height:70px}footer{font-size:11px;color:#555;margin-top:18px;border-top:1px solid #ccc;padding-top:10px}@media print{.page{margin:0;box-shadow:none}}@media screen{body{background:#eee}.page{box-shadow:0 2px 10px #bbb}}</style></head><body>${pages}</body></html>`;const url=URL.createObjectURL(new Blob(['\ufeff',doc],{type:'text/html;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='bieu-mau-khai-bao-cu-tru.html';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 $('ktExportRegistration').addEventListener('click',exportRegistrationForms);
 const open=(idx=-1)=>{editing=idx;const t=idx>=0?G.T[idx]:{name:'',cccd:'',area:'',room:'',status:'Đang ở',tt:'Chưa đăng ký'};fillAreas(areaFor(t.area)?.p);updateBuildings(t.area);$('ktTitle').textContent=idx>=0?'Sửa thông tin khách thuê':'Thêm khách thuê';$('ktName').value=t.name;$('ktCccd').value=t.cccd;$('ktCccd').disabled=idx>=0;$('ktStat').value=t.status||'Đang ở';$('ktTt').value=t.tt||'Chưa đăng ký';$('ktRoom').innerHTML=roomOptions(t.area,t.room);if(t.area)$('ktBld').value=t.area;$('ktRoom').value=t.room||'';$('ktErr').textContent='';window.op('mAdd');};
 $('ktAdd').addEventListener('click',()=>open());$('ktProv').addEventListener('change',()=>{updateBuildings();$('ktRoom').innerHTML='<option value="">Chọn tòa nhà trước</option>'});$('ktBld').addEventListener('change',e=>$('ktRoom').innerHTML=roomOptions(e.target.value));
 $('ktSave').addEventListener('click',()=>{const name=$('ktName').value.trim(),cccd=$('ktCccd').value.trim(),area=$('ktBld').value,room=$('ktRoom').value,status=$('ktStat').value,tt=$('ktTt').value;
   if(!name)return $('ktErr').textContent='Vui lòng nhập họ tên.';if(!/^\d{12}$/.test(cccd))return $('ktErr').textContent='CCCD cần đúng 12 chữ số.';if(editing<0&&G.T.some(t=>t.cccd===cccd))return $('ktErr').textContent='CCCD đã tồn tại.';if(!area||!room)return $('ktErr').textContent='Vui lòng chọn khu vực và phòng.';
   const roomContractRecord=roomContract(area,room),others=roomResidents(area,room,editing),capacity=Math.max(1,Number(roomContractRecord?.ppl)||1);
   if(status==='Đang ở'&&others.length>=capacity)return $('ktErr').textContent=`Phòng ${room} đã đủ sức chứa (${others.length}/${capacity} người theo hợp đồng).`;
   const old=editing>=0?G.T[editing]:null,linkedContract=roomContractRecord?.no||(old&&old.area===area&&old.room===room?old.contractNo:'');const record={...(old||{}),name,cccd,area,room,status,tt,contractNo:status==='Đang ở'?linkedContract:(old?.contractNo||''),kn:old?.kn||0,xe:old?.xe||[]};if(editing>=0)G.T[editing]=record;else G.T.unshift(record);window.cl();G.emit();render();});
 $('ktRows').addEventListener('click',e=>{const edit=e.target.closest('[data-edit-tenant]'),del=e.target.closest('[data-delete-tenant]');if(edit)open(+edit.dataset.editTenant);if(del){deleting=+del.dataset.deleteTenant;$('ktDelName').textContent=G.T[deleting]?.name||'';window.op('mDel')}});
 $('ktDelOk').addEventListener('click',()=>{if(deleting<0)return;const t=G.T[deleting];if(G.C.some(c=>c.cccd===t.cccd))return $('ktDelName').textContent+=' · Không thể xóa vì đã có hợp đồng';G.T.splice(deleting,1);G.U=G.U.filter(u=>u.cccd!==t.cccd);deleting=-1;window.cl();G.emit();render()});
 ['ktFP','ktFB','ktFH','ktFS','ktFT'].forEach(id=>$(id).addEventListener('change',render));['ktFN','ktFC'].forEach(id=>$(id).addEventListener('input',render));$('ktFP').addEventListener('change',()=>{$('ktFB').value='';refreshFilters()});$('ktReset').addEventListener('click',()=>{['ktFP','ktFB','ktFH','ktFS','ktFT','ktFN','ktFC'].forEach(id=>$(id).value='');render()});
 G.subs.push(render);render();
 G.showTenant=cccd=>{location.hash='#/khach-thue';setTimeout(()=>{const f=root.querySelector('#ktFC');if(f){f.value=cccd;root.querySelector('#ktFP').value='';root.querySelector('#ktFB').value='';root.querySelector('#ktFN').value='';root.querySelector('#ktFH').value='';root.querySelector('#ktFS').value='';root.querySelector('#ktFT').value='';render()}},80)};
 // Area views may have drawn once before the demo seed ran; refresh after all page modules settle.
 setTimeout(()=>{const reset=root.querySelector('#kvReset');if(reset)reset.click();else G.subs.forEach(fn=>fn())},0);
})();
