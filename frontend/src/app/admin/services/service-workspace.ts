export const SERVICE_WORKSPACE_SECTIONS = [
  { href: "/admin/services/utilities", label: "Điện & nước", key: "utilities" },
  { href: "/admin/services/fixed", label: "Dịch vụ cố định", key: "fixed" },
  { href: "/admin/services/flexible", label: "Tiện ích phát sinh", key: "flexible" },
  { href: "/admin/services/parking", label: "Parking", key: "parking" },
] as const;

export type ServiceWorkspaceKey = (typeof SERVICE_WORKSPACE_SECTIONS)[number]["key"];
