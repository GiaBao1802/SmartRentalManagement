import AdminShell from "../../../components/admin-shell";
import ParkingManagement from "./parking-management";
import ServiceWorkspaceNav from "../service-workspace-nav";

export const metadata = { title: "Gửi xe · Dịch vụ & Tiện ích" };

export default function ParkingServicesPage() {
  return <AdminShell active="/admin/services"><main className="admin-main utility-page service-management-page parking-page">
    <div className="breadcrumb">Dịch vụ &amp; Tiện ích · Gửi xe</div>
    <div className="page-heading"><div><h1>Quản lý gửi xe</h1><p>Quản lý bãi xe, chỗ đỗ, phương tiện, đăng ký gửi xe và mức phí.</p></div></div>
    <ServiceWorkspaceNav active="parking" />
    <ParkingManagement />
  </main></AdminShell>;
}
