import {readFileSync} from 'node:fs';
import {amenities} from './catalog.mjs';
export const dataset = JSON.parse(readFileSync(new URL('../../data/room-ai/v1/rooms.json',import.meta.url),'utf8'));
if(dataset.synthetic!==true || dataset.schema_version!=='1.0.0')throw new Error('Unsupported synthetic dataset');
export function datasetInventory(preferences, source=dataset){
 return source.rooms.map(room=>{
  const p=room.pricing, people=preferences.people, vehicles=preferences.mode==='motorbike'&&room.features.includes('parking')?1:0;
  const fees=[p.rent_per_room_month_vnd,p.electricity_per_kwh_vnd,p.water_per_m3_vnd,p.internet_vnd,p.service_vnd];
  if(room.synthetic!==true || !fees.every(n=>Number.isSafeInteger(n)&&n>=0) || (vehicles&&(!Number.isSafeInteger(p.parking_per_vehicle_vnd)||p.parking_per_vehicle_vnd<0)))return {id:room.id};
  // Shared demo assumptions, not the dataset's heterogeneous stored totals.
  const expenses=p.electricity_per_kwh_vnd*45*people+p.water_per_m3_vnd*3*people+p.internet_vnd+p.service_vnd+(vehicles?p.parking_per_vehicle_vnd:0);
  const access=room.access;
  const accessLabel=access.mode==='24h'?'Ra vào 24h':access.mode==='curfew'?`Giờ cổng ${access.gate_opens}–${access.gate_closes}`:access.mode==='notify_late'?`Về trễ báo trước ${access.late_notice_before}`:'Chưa rõ giờ ra vào';
  const pet=room.rules.pets;
  return {id:room.id,name:room.name,rent:p.rent_per_room_month_vnd,expenses,total:p.rent_per_room_month_vnd+expenses,
   area:room.area_m2,capacity:room.capacity,available:room.availability.status==='available',late:access.mode==='24h',accessLabel,
   features:room.features.filter(k=>Object.hasOwn(amenities,k)&& (k!=='pets'||pet.allowed===true)&&(k!=='cooking'||room.rules.cooking==='allowed')),
   travel:room.travel_minutes,costNote:`Ước tính cho ${people} người: ${45*people} kWh, ${3*people} m³ nước, ${vehicles} xe; chưa gồm cọc hoặc gửi xe ngoài.`,
   extraConcerns:[`Dữ liệu giả lập tại ${room.availability.as_of}; cần xác nhận tình trạng thực tế.`,
    `Cọc ${p.deposit_months} tháng; thuê tối thiểu ${room.lease.minimum_months} tháng.`,
    ...(pet.allowed?[`Thú cưng: tối đa ${pet.max_count} con, ${pet.max_weight_kg===null?'chưa rõ giới hạn cân nặng':`tối đa ${pet.max_weight_kg} kg`}${pet.approval_required?', cần chủ trọ duyệt':''}.`]:[]),
    ...(access.mode==='24h'?[]:[accessLabel+'. Không xác nhận ra vào 24h vô điều kiện.'])],
  };
 });
}
