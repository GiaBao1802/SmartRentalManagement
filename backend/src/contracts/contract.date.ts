export const contractBusinessTimeZone = "Asia/Ho_Chi_Minh";

export function contractBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: contractBusinessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function sqlDate(value: Date): string { return value.toISOString().slice(0, 10); }

export function dateAtBusinessMidnight(date: string): Date { return new Date(`${date}T00:00:00.000Z`); }
