// Codes and names from the pinned 34-feature geographic dataset.
export const provinces = [
  ["01", "Hà Nội"],
  ["04", "Cao Bằng"],
  ["08", "Tuyên Quang"],
  ["11", "Điện Biên"],
  ["12", "Lai Châu"],
  ["14", "Sơn La"],
  ["15", "Lào Cai"],
  ["19", "Thái Nguyên"],
  ["20", "Lạng Sơn"],
  ["22", "Quảng Ninh"],
  ["24", "Bắc Ninh"],
  ["25", "Phú Thọ"],
  ["31", "Hải Phòng"],
  ["33", "Hưng Yên"],
  ["37", "Ninh Bình"],
  ["38", "Thanh Hoá"],
  ["40", "Nghệ An"],
  ["42", "Hà Tĩnh"],
  ["44", "Quảng Trị"],
  ["46", "Huế"],
  ["48", "Đà Nẵng"],
  ["51", "Quảng Ngãi"],
  ["52", "Gia Lai"],
  ["56", "Khánh Hoà"],
  ["66", "Đắk Lắk"],
  ["68", "Lâm Đồng"],
  ["75", "Đồng Nai"],
  ["79", "Hồ Chí Minh"],
  ["80", "Tây Ninh"],
  ["82", "Đồng Tháp"],
  ["86", "Vĩnh Long"],
  ["91", "An Giang"],
  ["92", "Cần Thơ"],
  ["96", "Cà Mau"],
] as const;

// Explicit pre-2025 aliases. Unrecognized strings remain unmapped, never guessed.
const mergers: Record<string, string[]> = {
  "08": ["Hà Giang"], "15": ["Yên Bái"], "19": ["Bắc Kạn"], "24": ["Bắc Giang"],
  "25": ["Vĩnh Phúc", "Hòa Bình"], "31": ["Hải Dương"], "33": ["Thái Bình"],
  "37": ["Hà Nam", "Nam Định"], "44": ["Quảng Bình"], "46": ["Thừa Thiên Huế"],
  "48": ["Quảng Nam"], "51": ["Kon Tum"], "52": ["Bình Định"], "56": ["Ninh Thuận"],
  "66": ["Phú Yên"], "68": ["Đắk Nông", "Bình Thuận"], "75": ["Bình Phước"],
  "79": ["Bình Dương", "Bà Rịa - Vũng Tàu", "TP HCM", "TPHCM", "TP Hồ Chí Minh"],
  "80": ["Long An"], "82": ["Tiền Giang"], "86": ["Bến Tre", "Trà Vinh"],
  "91": ["Kiên Giang"], "92": ["Hậu Giang", "Sóc Trăng"], "96": ["Bạc Liêu"],
};
export function normalizeProvince(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/^(tinh|thanh pho|tp[.]?)\s+/, "").replace(/[^a-z0-9]/g, "");
}
export function provinceCode(name: string): string | null {
  const normalized = normalizeProvince(name);
  return provinces.find(([code, current]) => [current, ...(mergers[code] ?? [])].some(alias => normalizeProvince(alias) === normalized))?.[0] ?? null;
}

