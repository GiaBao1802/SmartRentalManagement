// Synthetic fixtures only. These are NOT public Room records or real routes.
export const destinations = { campus: 'Trường A', office: 'Văn phòng B', tech: 'Khu công nghệ C' };
export const amenities = { cooking: 'Nấu ăn', parking: 'Chỗ để xe', pets: 'Nuôi thú cưng', ac: 'Máy lạnh' };
const rows = [
  ['Hiên Nắng', 2900000, 600000, 24, 2, false, ['cooking','parking'], [10,22,35]],
  ['Ô Cửa Xanh', 3200000, 600000, 26, 2, true, ['cooking','parking','ac'], [18,12,28]],
  ['Gác Nhỏ', 3900000, 600000, 32, 3, true, ['cooking','parking','pets','ac'], [8,20,32]],
  ['Vườn Ban Mai', 2600000, 500000, 22, 2, true, ['cooking','parking'], [25,28,18]],
  ['Sân Lá', 2800000, 550000, 25, 2, true, ['cooking','parking','pets'], [20,25,15]],
  ['Nhà Bên Hiên', 2400000, 500000, 20, 1, false, ['parking'], [12,18,36]],
  ['Nắng Cuối Ngày', 3400000, 550000, 28, 2, true, ['cooking','parking','ac'], [15,10,30]],
  ['Góc Bình Yên', 3000000, 550000, 27, 2, false, ['cooking','pets'], [16,14,26]],
  ['Mái Ngói', 2200000, 450000, 18, 1, false, ['cooking','parking'], [30,32,22]],
  ['Hiên Mưa', 2500000, 500000, 21, 2, true, ['cooking'], [28,24,20]],
  ['Cửa Sổ Lớn', 3600000, 650000, 30, 2, true, ['cooking','parking','ac'], [9,8,34]],
  ['Ban Công Nhỏ', 3100000, 600000, 25, 2, true, ['cooking','parking','pets'], [22,16,24]],
  ['Sắc Lá', 2700000, 500000, 23, 2, true, ['parking','ac'], [14,26,16]],
  ['Hẻm Sáng', 2300000, 450000, 19, 1, false, ['cooking'], [35,30,25]],
  ['Một Góc Nhà', 3300000, 600000, 29, 3, true, ['cooking','parking','pets','ac'], [26,18,12]],
  ['Hiên Gió', 2950000, 550000, 26, 2, true, ['cooking','parking'], [null,20,17]],
  ['Đèn Vàng', 2000000, 400000, 17, 1, true, ['cooking','parking'], [12,15,21]],
  ['Vòm Xanh', 2850000, 500000, 24, 2, true, ['cooking','parking'], [17,19,23]],
];
export const rooms = rows.map(([name,rent,expenses,area,capacity,late,features,times], i) => ({
  id: `DEMO-${String(i + 1).padStart(2,'0')}`, name, rent, expenses, total: rent + expenses,
  area, capacity, late, features, available: i !== 16,
  // Explicit synthetic minutes by destination and mode, not distance estimates.
  travel: Object.fromEntries(Object.keys(destinations).map((key,j) => [key, {
    motorbike: times[j], bus: times[j] === null ? null : times[j] + 18,
  }])),
}));
