import AdminShell from "../../../components/admin-shell";
import ParkingManagement from "./parking-management";
import ServiceWorkspaceNav from "../service-workspace-nav";

export const metadata = { title: "Parking · Dịch vụ & Tiện ích" };

export default function ParkingServicesPage() {
  return <AdminShell active="/admin/services"><main className="admin-main utility-page service-management-page parking-page">
    <div className="breadcrumb">Dịch vụ &amp; Tiện ích · Parking</div>
    <div className="page-heading"><div><h1>Parking</h1><p>Quản lý khu vực, slot, phương tiện, đăng ký gửi xe và giá tính vào hóa đơn.</p></div></div>
    <ServiceWorkspaceNav active="parking" />
    <ParkingManagement />
  </main></AdminShell>;
}
