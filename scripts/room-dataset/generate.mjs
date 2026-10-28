import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const out = fileURLToPath(new URL('../../data/room-ai/v1/', import.meta.url));
let state = 20261026;
const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
const int = (a,b) => a + Math.floor(random() * (b-a+1));
const pick = a => a[int(0,a.length-1)];
const money = n => new Intl.NumberFormat('vi-VN').format(n) + ' đồng';
const themes = [
 ['sinh_vien','Trọ sinh viên',1500000,24],['tiet_kiem','Trọ tiết kiệm',1200000,20],
 ['di_lam','Trọ người đi làm',2600000,28],['ca_dem','Trọ ca đêm',2200000,26],
 ['gia_dinh','Trọ gia đình',3500000,40],['thu_cung','Trọ cho nuôi thú cưng',2800000,30],
 ['studio','Studio',4300000,32],['co_gac','Phòng có gác',2100000,24],
 ['san_vuon','Trọ sân vườn',3000000,30],['lam_viec_tai_nha','Phòng làm việc tại nhà',3600000,32],
 ['co_living','Co-living, thuê cả phòng',2400000,26],['tiep_can','Phòng ưu tiên tiếp cận',3100000,32],
];
const zones = ['Bến Nắng','Vườn Mây','Suối Lam','Đồi Gió','Cầu Lá','Phố Trúc','Bờ Sương','Ngõ Sen','Sân Sao','Bến Mộc','Đường Mơ','Vịnh Nhỏ'];
const featureLabels = {cooking:'được nấu ăn',parking:'chỗ để xe',pets:'cho phép thú cưng',ac:'máy lạnh',fridge:'tủ lạnh',washer:'máy giặt riêng',shared_laundry:'khu giặt chung',wifi:'Wi-Fi',balcony:'ban công',window:'cửa sổ',loft:'gác lửng',private_bathroom:'WC riêng',furnished:'nội thất',desk:'bàn làm việc',elevator:'thang máy',garden:'sân vườn',step_free:'lối vào không bậc',ev_charging:'điểm sạc xe điện'};
const properties=[]; const rooms=[];
for(let p=0;p<60;p++) {
 const theme=themes[p%12], id=`SYN-P${String(p+1).padStart(3,'0')}`;
 const accessMode=theme[0]==='ca_dem'?'24h':['24h','curfew','notify_late','unknown'][(p+Math.floor(p/12))%4];
 const access={mode:accessMode,gate_opens:accessMode==='curfew'?pick(['05:00','05:30','06:00']):null,gate_closes:accessMode==='curfew'?pick(['21:30','22:00','22:30','23:00']):null,late_notice_before:accessMode==='notify_late'?'21:00':null,quiet_hours:{from:pick(['21:30','22:00','23:00']),to:pick(['06:00','07:00'])}};
 const property={id,synthetic:true,name:`${theme[1]} ${zones[Math.floor(p/5)]} ${p+1}`,theme:theme[0],location:{city:'Thành phố Mô Phỏng',zone:zones[Math.floor(p/5)],address_label:`Lô giả lập ${p+1}, khu ${zones[Math.floor(p/5)]}`,coordinates:null},access,owner_on_site:p%3===0,guest_hours:{from:'08:00',to:pick(['20:00','21:00','22:00'])},overnight_guests:pick(['not_allowed','prior_approval','allowed']),viewing:{days:['Tue','Thu','Sat'],from:'09:00',to:'18:00',appointment_required:true},split:['train','train','train','validation','test'][Math.floor(p/12)]};
 properties.push(property);
 for(let j=0;j<5;j++) {
  const n=p*5+j+1, rid=`SYN-R${String(n).padStart(4,'0')}`, area=theme[3]+int(-4,12), capacity=theme[0]==='gia_dinh'?int(3,5):int(1,3);
  const cooking=theme[0]==='gia_dinh'||random()>.2, pets=theme[0]==='thu_cung'||random()>.7;
  const features=new Set(['wifi']); if(cooking)features.add('cooking'); if(pets)features.add('pets');
  for(const [key,chance] of Object.entries({parking:.86,ac:.6,fridge:.4,washer:.25,shared_laundry:.55,balcony:.35,window:.85,private_bathroom:.9,furnished:.5,desk:.55,elevator:.3,ev_charging:.18}))if(random()<chance)features.add(key);
  if(theme[0]==='co_gac')features.add('loft');if(theme[0]==='san_vuon')features.add('garden');if(theme[0]==='tiep_can')features.add('step_free');if(theme[0]==='lam_viec_tai_nha')features.add('desk');
  const rent=theme[2]+int(0,24)*100000, kwh=pick([2500,3000,3500,4000]), water=pick([15000,20000,25000]);
  const fixed={internet_vnd:pick([0,50000,100000]),service_vnd:pick([0,50000,100000,150000]),parking_per_vehicle_vnd:features.has('parking')?pick([0,100000,150000]):null};
  const estimate={people:capacity,electricity_kwh:capacity*45,water_m3:capacity*3,vehicles:features.has('parking')?1:0};
  const expense=estimate.electricity_kwh*kwh+estimate.water_m3*water+fixed.internet_vnd+fixed.service_vnd+estimate.vehicles*(fixed.parking_per_vehicle_vnd??0);
  const status=n%10===0?'occupied':n%10===1?'maintenance':n%10===2?'available_later':'available';
  const room={id:rid,property_id:id,synthetic:true,split:property.split,name:`${theme[1]} ${String.fromCharCode(65+j)}${String(p+1).padStart(2,'0')}`,theme:theme[0],location:property.location,area_m2:area,capacity,floor:features.has('step_free')?0:int(0,5),features:[...features].sort(),access:property.access,
   rules:{cooking:cooking?'allowed':'not_allowed',pets:pets?{allowed:true,max_count:1,max_weight_kg:pick([5,10,15]),approval_required:true}:{allowed:false,max_count:0,max_weight_kg:null,approval_required:false},smoking:pick(['not_allowed','outdoor_only']),overnight_guests:property.overnight_guests,owner_on_site:property.owner_on_site,guest_hours:property.guest_hours},
   pricing:{currency:'VND',rent_per_room_month_vnd:rent,deposit_months:pick([1,1,2]),electricity_per_kwh_vnd:kwh,water_per_m3_vnd:water,...fixed,estimate_assumptions:estimate,estimated_expenses_vnd:expense,estimated_total_month_vnd:rent+expense,estimate_is_quote:false},
   lease:{minimum_months:pick([1,3,6,12]),notice_days:30},availability:{status,available_from:status==='available_later'?'2026-12-01':null,as_of:'2026-10-26'},
   travel_minutes:{campus:{motorbike:n%11===0?null:int(5,50),bus:n%13===0?null:int(12,80)},office:{motorbike:int(5,55),bus:int(15,85)},tech:{motorbike:int(8,60),bus:n%7===0?null:int(20,90)}},
   environment:{day_noise:pick(['low','medium','high','unknown']),natural_light:features.has('window')?pick(['low','medium','high']):'low',internet_mbps_advertised:pick([50,100,150,200]),flood_history:null},viewing:property.viewing};
  const hours=accessMode==='24h'?'Ra vào 24/7':accessMode==='curfew'?`Mở cổng ${access.gate_opens}, đóng cổng ${access.gate_closes}`:accessMode==='notify_late'?`Về trễ cần báo trước ${access.late_notice_before}`:'Giờ ra vào chưa xác minh';
  room.description=`[GIẢ LẬP] ${room.name}, ${area} m², tối đa ${capacity} người. Giá thuê cả phòng ${money(rent)}/tháng. ${hours}; giờ yên tĩnh ${access.quiet_hours.from}–${access.quiet_hours.to}. ${room.features.map(x=>featureLabels[x]).join(', ')}. ${cooking?'Cho phép nấu ăn.':'Không cho nấu ăn.'} ${pets?'Thú cưng cần chủ trọ duyệt trước.':'Không nhận thú cưng.'} Tổng ước tính ${money(rent+expense)}/tháng theo mức sử dụng mẫu, không phải báo giá. Trạng thái: ${status}.`;
  rooms.push(room);
 }
}
const catalog={schema_version:'1.0.0',dataset_id:'goctro-room-ai-300-v1',synthetic:true,seed:20261026,as_of:'2026-10-26',currency:'VND',notes:['Tất cả phòng, địa chỉ, giá và thời gian đi lại đều giả lập.','Không phải dữ liệu production hoặc seed PostgreSQL V1.8.','null nghĩa là chưa biết, không phải không có hoặc bằng 0.','Giá thuê cả phòng/tháng; tổng là ước tính theo assumptions từng phòng.'],destinations:{campus:'Trường A (giả lập)',office:'Văn phòng B (giả lập)',tech:'Khu công nghệ C (giả lập)'},feature_labels:featureLabels,properties,rooms};
const examples=[];
for(const r of rooms){
 const hours=r.access.mode==='24h'?'Ra vào 24/7, nhưng vẫn phải tuân thủ giờ yên tĩnh.':r.access.mode==='curfew'?`Cổng mở ${r.access.gate_opens}, đóng ${r.access.gate_closes}; không có thông tin ngoại lệ.`:r.access.mode==='notify_late'?`Về trễ phải báo trước ${r.access.late_notice_before}; không được coi là tự do vô điều kiện.`:'Chưa biết giờ ra vào, cần hỏi chủ trọ.';
 const pairs=[
  [pick(['Phòng này tiền thuê và tổng chi phí khoảng bao nhiêu?','Tính giúp mình chi phí mỗi tháng của phòng này.','Giá ghi ở đây tính theo người hay cả phòng?']),`Giá thuê cả phòng là ${money(r.pricing.rent_per_room_month_vnd)}/tháng. Tổng ước tính ${money(r.pricing.estimated_total_month_vnd)} cho ${r.pricing.estimate_assumptions.people} người, ${r.pricing.estimate_assumptions.electricity_kwh} kWh, ${r.pricing.estimate_assumptions.water_m3} m³ nước và ${r.pricing.estimate_assumptions.vehicles} xe; thực tế phụ thuộc sử dụng. Tiền cọc ${r.pricing.deposit_months} tháng thuê chưa nằm trong tổng.`],
  [pick(['Mình làm ca đêm, giờ ra vào thế nào?','Mình hay về sau 0h, nội quy cổng ra sao?','Có tự do giờ giấc không, có cần báo trước không?']),hours+` Giờ yên tĩnh ${r.access.quiet_hours.from}–${r.access.quiet_hours.to}.`],
  [pick(['Tôi muốn nấu ăn và đem mèo theo, phòng cho phép không?','Phòng này có bếp và cho nuôi thú cưng chứ?','Cho mình biết quy định nấu ăn với nuôi mèo.']),`${r.rules.cooking==='allowed'?'Cho phép nấu ăn; chưa xác định thiết bị bếp.':'Không cho phép nấu ăn.'} ${r.rules.pets.allowed?`Cho tối đa ${r.rules.pets.max_count} thú cưng, không quá ${r.rules.pets.max_weight_kg} kg, cần được duyệt trước.`:'Không nhận thú cưng.'}`],
  ['Phòng còn trống không? Khu này có bị ngập không?',`Trạng thái tại ${r.availability.as_of}: ${r.availability.status}${r.availability.available_from?', dự kiến từ '+r.availability.available_from:''}. Chưa có dữ liệu lịch sử ngập; không thể khẳng định không ngập. Cần xác nhận tình trạng mới nhất trước khi đặt phòng.`],
 ];
 pairs.forEach(([q,a],i)=>examples.push({id:`${r.id}-QA${i+1}`,room_id:r.id,property_id:r.property_id,split:r.split,synthetic:true,task:['cost','access','rules','unknown_and_availability'][i],messages:[{role:'system',content:'Bạn tư vấn phòng từ JSON được cung cấp. Không bịa dữ kiện; null là chưa biết. Dữ liệu giả lập, không phải tin cho thuê thật.'},{role:'user',content:`Dữ liệu phòng:\n${JSON.stringify(r)}\nCâu hỏi: ${q}`},{role:'assistant',content:a}]}));
}
await mkdir(out,{recursive:true});
const files={'rooms.json':JSON.stringify(catalog,null,2)+'\n'};
for(const split of ['train','validation','test'])files[`${split}.jsonl`]=examples.filter(x=>x.split===split).map(x=>JSON.stringify(x)).join('\n')+'\n';
const countBy=key=>Object.fromEntries([...new Set(rooms.map(key))].map(v=>[v,rooms.filter(r=>key(r)===v).length]));
files['stats.json']=JSON.stringify({rooms:rooms.length,properties:properties.length,examples:examples.length,themes:countBy(r=>r.theme),access:countBy(r=>r.access.mode),availability:countBy(r=>r.availability.status),splits:countBy(r=>r.split),rent_range:[Math.min(...rooms.map(r=>r.pricing.rent_per_room_month_vnd)),Math.max(...rooms.map(r=>r.pricing.rent_per_room_month_vnd))],unknown_flood_history:rooms.length},null,2)+'\n';
for(const [name,content]of Object.entries(files))await writeFile(out+name,content);
await writeFile(out+'manifest.json',JSON.stringify({dataset_id:catalog.dataset_id,sha256:Object.fromEntries(Object.entries(files).map(([f,s])=>[f,createHash('sha256').update(s).digest('hex')]))},null,2)+'\n');
console.log(`Generated ${rooms.length} synthetic rooms, ${properties.length} properties, ${examples.length} grounded QA examples.`);
