import Link from "next/link";
import { SERVICE_WORKSPACE_SECTIONS, type ServiceWorkspaceKey } from "./service-workspace";

export default function ServiceWorkspaceNav({ active }: { active: ServiceWorkspaceKey }) {
  return <nav className="service-workspace-nav" aria-label="Điều hướng Dịch vụ và Tiện ích">
    {SERVICE_WORKSPACE_SECTIONS.map((section) => <Link key={section.key} href={section.href} className={`service-workspace-tab${section.key === active ? " active" : ""}`} aria-current={section.key === active ? "page" : undefined}>
      {section.label}
    </Link>)}
  </nav>;
}
