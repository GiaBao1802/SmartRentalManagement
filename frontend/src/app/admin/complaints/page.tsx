import DataManagement from "../../components/data-management";

export const metadata = { title: "Xử lý khiếu nại" };

export default function ComplaintsPage() {
  return <DataManagement active="/admin/complaints" title="Xử lý khiếu nại" description="Tiếp nhận phản ánh của cư dân, theo dõi nội dung, mức độ ưu tiên và trạng thái xử lý." endpoint="/api/maintenance-requests" searchKeys={["code", "tenant", "property", "room", "category", "content"]} summary="Tổng yêu cầu" columns={[
    { key: "code", label: "Mã yêu cầu" }, { key: "tenant", label: "Người gửi" },
    { key: "property", label: "Khu vực" }, { key: "room", label: "Phòng" },
    { key: "category", label: "Loại phản ánh" }, { key: "content", label: "Nội dung" },
    { key: "priority", label: "Ưu tiên", format: "status" }, { key: "createdAt", label: "Ngày gửi", format: "date" },
    { key: "status", label: "Trạng thái", format: "status" },
  ]} />;
}
