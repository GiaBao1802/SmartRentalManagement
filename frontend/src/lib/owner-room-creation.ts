export type OwnerRoomProperty={property_id:string;name:string;province:string};
export type OwnerRoomCreateDraft={propertyId:string;roomCode:string;area:string;rent:string;capacity:string};
export type OwnerRoomCreateStep='property'|'code'|'area'|'rent'|'capacity'|'confirm';

const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();

export function isOwnerRoomCreationRequest(value:string){
 const text=normalized(value);
 return /\b(tao|them|bo sung|mo)\b/.test(text)&&/\bphong\b/.test(text)&&! /\b(phong nao|danh sach phong|bao nhieu phong)\b/.test(text);
}

export function parseOwnerRoomCreateDraft(value:string,properties:OwnerRoomProperty[]):OwnerRoomCreateDraft{
 const text=normalized(value),codeMatch=/\bphong\s+([a-z0-9][a-z0-9-]{0,39})/i.exec(text);
 const candidates=properties.filter(property=>text.includes(normalized(property.name)));
 const property=candidates.length===1?candidates[0]:null;
 return {propertyId:property?.property_id||'',roomCode:codeMatch?.[1].toUpperCase()||'',area:'',rent:'',capacity:''};
}

export function nextOwnerRoomCreateStep(draft:OwnerRoomCreateDraft):OwnerRoomCreateStep{
 return !draft.propertyId?'property':!draft.roomCode?'code':!draft.area?'area':!draft.rent?'rent':!draft.capacity?'capacity':'confirm';
}

export function validateOwnerRoomCreateValue(step:OwnerRoomCreateStep,value:string){
 if(step==='code')return value.length>40||!/[a-z0-9]/i.test(value)||/\s/.test(value)?'Mã phòng tối đa 40 ký tự và không có khoảng trắng. Nhập lại nhé.':'';
 if(step==='area'){
  const area=value.replace(',', '.');
  return !/^(?:\d{1,6})(?:\.\d{1,2})?$/.test(area)||Number(area)<=0||Number(area)>999999.99?'Diện tích phải lớn hơn 0, tối đa 2 chữ số thập phân. Ví dụ 25.5.':'';
 }
 if(step==='rent')return !/^\d{1,18}$/.test(value.replace(/[.,\sđ₫]/gi,''))?'Giá thuê cần là số nguyên VND, ví dụ 2500000.':'';
 if(step==='capacity'){
  const capacity=Number(normalized(value));
  return !/^\d+(?:\s*nguoi)?$/.test(normalized(value))||!Number.isSafeInteger(capacity)||capacity<1||capacity>1_000_000?'Sức chứa phải là số nguyên từ 1 đến 1.000.000 người.':'';
 }
 return '';
}

export function normalizeOwnerRoomCreateValue(step:OwnerRoomCreateStep,value:string){
 if(step==='code')return value.trim().toUpperCase();
 if(step==='area')return value.trim().replace(',', '.');
 if(step==='rent')return value.trim().replace(/[.,\sđ₫]/gi,'');
 if(step==='capacity')return normalized(value).match(/^\d+/)?.[0]||'';
 return value.trim();
}
