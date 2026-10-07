import DataManagement from "../../components/data-management";

export const metadata = { title: "Quản lý khách thuê" };

export default function TenantManagementPage() {
  return <DataManagement active="/admin/tenants" title="Quản lý khách thuê" description="Quản lý thông tin lưu trú, phương tiện và trạng thái đăng ký tạm trú của khách thuê." endpoint="/api/tenants" searchKeys={["fullName", "nationalId", "phone", "email"]} summary="Tổng khách thuê" columns={[
    { key: "fullName", label: "Họ và tên" }, { key: "nationalId", label: "CCCD" }, { key: "phone", label: "Điện thoại" },
    { key: "propertyName", label: "Khu vực" }, { key: "roomNumber", label: "Phòng" }, { key: "vehicleSummary", label: "Phương tiện" },
    { key: "email", label: "Email" }, { key: "status", label: "Lưu trú", format: "status" }, { key: "registrationStatus", label: "Tạm trú", format: "status" },
  ]} fields={[
    { key: "nationalId", label: "CCCD (12 số)", required: true }, { key: "fullName", label: "Họ và tên", required: true },
    { key: "phone", label: "Số điện thoại" }, { key: "email", label: "Email" },
    { key: "status", label: "Tình trạng lưu trú", type: "select", options: [{ value: "RESIDENT", label: "Đang ở" }, { value: "FORMER", label: "Đã rời đi" }] },
    { key: "registrationStatus", label: "Đăng ký tạm trú", type: "select", options: [{ value: "UNREGISTERED", label: "Chưa đăng ký" }, { value: "REGISTERED", label: "Đã đăng ký" }] },
  ]} />;
}
