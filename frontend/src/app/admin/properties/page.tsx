import DataManagement from "../../components/data-management";

export const metadata = { title: "Quản lý khu vực" };

export default function PropertiesPage() {
  return <DataManagement active="/admin/properties" title="Quản lý khu vực" description="Quản lý khu vực và tòa nhà, theo dõi số phòng, giá thuê mặc định và trạng thái hoạt động." endpoint="/api/properties" searchKeys={["code", "name", "province", "address", "managerName"]} summary="Tổng khu vực / tòa nhà" columns={[
    { key: "code", label: "Mã khu vực" }, { key: "name", label: "Tên khu vực / tòa nhà" },
    { key: "province", label: "Tỉnh / Thành phố" }, { key: "address", label: "Địa chỉ" },
    { key: "managerName", label: "Người phụ trách" }, { key: "roomCount", label: "Số phòng" },
    { key: "defaultRentVnd", label: "Giá thuê mặc định", format: "money" }, { key: "status", label: "Trạng thái", format: "status" },
  ]} />;
}
