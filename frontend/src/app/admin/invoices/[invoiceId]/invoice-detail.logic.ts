export function validateInvoiceMeterReadings(
  electricity: string,
  water: string,
  openingElectricity: string | null,
  openingWater: string | null,
  requireBoth = false,
) {
  if (requireBoth && (!electricity || !water)) return "Cần nhập đủ chỉ số điện và nước cuối kỳ trước khi chốt.";
  if (electricity && (!/^\d+(?:\.\d{1,3})?$/.test(electricity) || (openingElectricity !== null && Number(electricity) < Number(openingElectricity)))) return "Chỉ số điện cuối kỳ phải là số không âm, tối đa 3 chữ số thập phân và không nhỏ hơn chỉ số đầu kỳ.";
  if (water && (!/^\d+(?:\.\d{1,3})?$/.test(water) || (openingWater !== null && Number(water) < Number(openingWater)))) return "Chỉ số nước cuối kỳ phải là số không âm, tối đa 3 chữ số thập phân và không nhỏ hơn chỉ số đầu kỳ.";
  return "";
}

export function invoiceMeterUsage(opening: string | null, ending: string) {
  if (opening === null || !/^\d+(?:\.\d{1,3})?$/.test(opening) || !ending || !/^\d+(?:\.\d{1,3})?$/.test(ending) || Number(ending) < Number(opening)) return null;
  return (Math.round(Number(ending) * 1000) - Math.round(Number(opening) * 1000)) / 1000;
}

export type InvoiceReadinessItem = { label: string; detail: string; state: "known" | "attention" | "server" };

export function invoiceReadiness(input: {
  contractNo: string | null;
  rentAmount: string;
  electricityPrevious: string | null;
  electricityCurrent: string;
  waterPrevious: string | null;
  waterCurrent: string;
}): InvoiceReadinessItem[] {
  const meterItems = (label: string, previous: string | null, current: string, unit: string, field: "electricity" | "water"): InvoiceReadinessItem[] => {
    const hasStart = previous !== null && previous !== "";
    const hasEnd = current.trim() !== "";
    const invalid = field === "electricity"
      ? validateInvoiceMeterReadings(current, "", previous, null)
      : validateInvoiceMeterReadings("", current, null, previous);
    return [
      { label: `${label} đầu kỳ`, detail: hasStart ? `${previous} ${unit}` : "Chưa có dữ liệu", state: hasStart ? "known" : "attention" },
      { label: `${label} cuối kỳ`, detail: !hasEnd ? "Chưa nhập" : invalid ? "Cần kiểm tra giá trị" : `${current} ${unit} · hợp lệ theo kiểm tra đầu vào`, state: !hasEnd || invalid ? "attention" : "known" },
    ];
  };

  return [
    { label: "Hợp đồng", detail: input.contractNo ? `Đã liên kết · ${input.contractNo}` : "Chưa nhận thông tin hợp đồng", state: input.contractNo ? "known" : "attention" },
    { label: "Giá thuê", detail: input.rentAmount !== "" ? "Đã có dữ liệu tiền thuê" : "Chưa có dữ liệu tiền thuê", state: input.rentAmount !== "" ? "known" : "attention" },
    ...meterItems("Điện", input.electricityPrevious, input.electricityCurrent, "kWh", "electricity"),
    ...meterItems("Nước", input.waterPrevious, input.waterCurrent, "m³", "water"),
    { label: "Biểu giá điện/nước, dịch vụ và bãi xe", detail: "Sẽ được hệ thống kiểm tra khi chốt.", state: "server" },
  ];
}
