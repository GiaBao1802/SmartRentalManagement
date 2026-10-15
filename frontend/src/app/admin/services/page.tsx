import { redirect } from "next/navigation";

export const metadata = { title: "Dịch vụ & Tiện ích" };

export default function ServicesPage() {
  redirect("/admin/services/utilities");
}
