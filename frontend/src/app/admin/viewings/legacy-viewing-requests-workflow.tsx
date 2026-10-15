import DataManagement from "../../components/data-management";

/** Preserved workflow source for a future version; not rendered by the current route. */
export default function LegacyViewingRequestsWorkflow() {
  return <DataManagement active="/admin/viewings" title="Lịch xem phòng" description="Liên hệ người tìm phòng, xác nhận thời gian xem và theo dõi trạng thái từng yêu cầu." endpoint="/api/viewing-requests" searchKeys={["visitorName", "phone", "email", "room"]} summary="Tổng yêu cầu xem phòng" allowCreate={false} columns={[
    { key: "visitorName", label: "Người liên hệ" }, { key: "phone", label: "Điện thoại" },
    { key: "email", label: "Email" }, { key: "room", label: "Phòng quan tâm" },
    { key: "preferredDate", label: "Ngày mong muốn", format: "date" }, { key: "preferredTime", label: "Khung giờ" },
    { key: "createdAt", label: "Ngày gửi", format: "date" }, { key: "status", label: "Trạng thái", format: "status" },
  ]} fields={[
    { key: "status", label: "Trạng thái", type: "select", required: true, options: [
      { value: "PENDING", label: "Chờ liên hệ" }, { value: "CONTACTED", label: "Đã liên hệ" },
      { value: "CONFIRMED", label: "Đã xác nhận lịch" }, { value: "COMPLETED", label: "Đã xem phòng" },
      { value: "CANCELLED", label: "Đã hủy" },
    ] },
  ]} defaultStatus={{ key: "status", value: "CONTACTED", label: "Đánh dấu đã liên hệ" }} />;
}
