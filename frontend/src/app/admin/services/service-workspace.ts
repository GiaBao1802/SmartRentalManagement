export const SERVICE_WORKSPACE_SECTIONS = [
  { href: "/admin/services/utilities", label: "Điện & nước", key: "utilities" },
  { href: "/admin/services/fixed", label: "Tiện ích cố định", key: "fixed" },
  { href: "/admin/services/flexible", label: "Tiện ích phát sinh", key: "flexible" },
  { href: "/admin/services/parking", label: "Gửi xe", key: "parking" },
] as const;

export type ServiceWorkspaceKey = (typeof SERVICE_WORKSPACE_SECTIONS)[number]["key"];
