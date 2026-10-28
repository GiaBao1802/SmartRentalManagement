import { amenities, destinations, rooms } from './catalog.mjs';
export const money = n => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
export function validatePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Bộ tiêu chí không hợp lệ.');
  const allowed = ['budget','destination','mode','maxMinutes','people','late','required','priority','note'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Có tiêu chí không được hỗ trợ.');
  for (const [key,min,max] of [['budget',500000,20000000],['maxMinutes',5,120],['people',1,5]]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw new Error(`Giá trị ${key} không hợp lệ.`);
  }
  if (typeof value.destination !== 'string' || !Object.hasOwn(destinations,value.destination) || !['motorbike','bus'].includes(value.mode)
      || !['commute','budget','space'].includes(value.priority) || typeof value.late !== 'boolean'
      || !Array.isArray(value.required) || value.required.length > 4
      || value.required.some(key => typeof key !== 'string' || !Object.hasOwn(amenities,key))
      || typeof value.note !== 'string' || value.note.length > 500) throw new Error('Vui lòng kiểm tra các tiêu chí.');
  return { ...value, required: [...new Set(value.required)], note: value.note.trim() };
}
function validRoom(room) {
  return room && typeof room.id === 'string' && /^(?:DEMO-\d{2}|SYN-R\d{4})$/.test(room.id)
    && typeof room.name === 'string' && room.name.length > 0
    && [room.rent,room.expenses,room.total].every(n => Number.isSafeInteger(n) && n >= 0)
    && room.total === room.rent + room.expenses
    && Number.isFinite(room.area) && room.area > 0
    && Number.isSafeInteger(room.capacity) && room.capacity > 0
    && typeof room.late === 'boolean' && typeof room.available === 'boolean'
    && Array.isArray(room.features) && room.features.every(key => typeof key === 'string' && Object.hasOwn(amenities,key));
}
export function recommend(input, inventory = rooms, limit = 3) {
  const p = validatePreferences(input);
  const excluded = { invalid: 0, unavailable: 0, budget: 0, capacity: 0, late: 0, amenities: 0, travel: 0, unknown: 0 };
  const eligible = [];
  const seen = new Set();
  for (const room of inventory) {
    if (!validRoom(room) || seen.has(room.id)) { excluded.invalid++; continue; }
    seen.add(room.id);
    const minutes = room.travel?.[p.destination]?.[p.mode];
    // First exclusion only: counts add up to the number of excluded rooms.
    const reason = !room.available ? 'unavailable' : room.total > p.budget ? 'budget'
      : room.capacity < p.people ? 'capacity' : p.late && !room.late ? 'late'
      : p.required.some(key => !room.features.includes(key)) ? 'amenities'
      : !Number.isFinite(minutes) || minutes < 0 ? 'unknown' : minutes > p.maxMinutes ? 'travel' : null;
    if (reason) { excluded[reason]++; continue; }
    eligible.push({ ...room, minutes });
  }
  const sorters = { commute: (a,b) => a.minutes - b.minutes, budget: (a,b) => a.total - b.total, space: (a,b) => b.area - a.area };
  eligible.sort((a,b) => sorters[p.priority](a,b) || a.total - b.total || a.id.localeCompare(b.id));
  const cards = eligible.slice(0,limit).map(room => {
    const facts = [
      { id: 'budget', text: `Tổng chi phí mẫu ${money(room.total)}/tháng, trong ngân sách đã xác nhận.` },
      { id: 'travel', text: `Đến ${destinations[p.destination]} khoảng ${room.minutes} phút theo dữ liệu đường đi giả lập.` },
      { id: 'hours', text: room.accessLabel ? `${room.accessLabel} theo nội quy mẫu.` : room.late ? 'Ra vào 24 giờ theo nội quy mẫu.' : 'Đóng cửa lúc 23 giờ theo nội quy mẫu.' },
      { id: 'space', text: `Diện tích ${room.area} m², sức chứa tối đa ${room.capacity} người.` },
      { id: 'amenities', text: `Tiện ích mẫu: ${room.features.map(key => amenities[key]).join(', ').toLowerCase()}.` },
    ];
    const concerns = [
      ...(!room.features.includes('ac') ? ['Không có máy lạnh trong dữ liệu mẫu.'] : []),
      ...(!room.late ? ['Chưa đáp ứng yêu cầu ra vào 24 giờ vô điều kiện.'] : []),
      ...(room.extraConcerns || []),
      ...(p.budget - room.total < 300000 ? ['Ngân sách dự phòng dưới 300.000 đ/tháng.'] : []),
      'Chưa có dữ liệu xác minh tiếng ồn, ngập nước hoặc an ninh.',
    ];
    return { ...room, facts, concerns, explanation: facts.slice(0,3).map(f => f.text).join(' ') };
  });
  return { preferences: p, inventoryCount: inventory.length, eligibleCount: eligible.length, excluded, cards };
}
// The new AI selection flow receives every eligible room in the small demo catalog.
export const filterCandidates = input => recommend(input, rooms, Infinity);
