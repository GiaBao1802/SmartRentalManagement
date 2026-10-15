export type NavItem = { href: string; label: string; adminOnly?: boolean; icon: string };
export type NavGroup = { label: string; items: NavItem[] };

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  { label: "Vận hành", items: [
    { href: "/admin/properties", label: "Khu vực & phòng", icon: "M3 10.5 12 3l9 7.5M5 9v11h14V9M9 20v-6h6v6" },
    { href: "/admin/tenants", label: "Cư dân", icon: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m6-7h6m-3-3v6" },
    { href: "/admin/contracts", label: "Hợp đồng", icon: "M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2m7 0v5h5M9 13h6m-6 4h6" },
    { href: "/admin/billing", label: "Vận hành hóa đơn", icon: "M4 5h16M4 12h16M4 19h10M7 2v6m10-6v6m-8 7 2 2 4-5" },
    { href: "/admin/invoices", label: "Hóa đơn", icon: "M5 3h14v18l-3-2-4 2-4-2-3 2V3m4 5h6m-6 4h6m-6 4h4" },
    { href: "/admin/contact-requests", label: "Khách quan tâm", icon: "M4 5h16v12H8l-4 4V5m4 4h8m-8 4h5" },
  ] },
  { label: "Dịch vụ & Hỗ trợ", items: [
    { href: "/admin/services", label: "Dịch vụ & Tiện ích", icon: "M4 6h16M4 12h16M4 18h16M8 6v.01M8 12v.01M8 18v.01" },
  ] },
  { label: "Quản trị", items: [
    { href: "/admin/accounts", label: "Tài khoản", adminOnly: true, icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-8 9a8 8 0 0 1 16 0" },
  ] },
];
