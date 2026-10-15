import AdminShell from "../../components/admin-shell";
import DeferredFeatureScreen, { DEFERRED_FEATURES } from "../../components/deferred-feature-screen";

export const metadata = { title: "Khiếu nại" };

export default function ComplaintsPage() {
  return <AdminShell active="/admin/complaints"><DeferredFeatureScreen {...DEFERRED_FEATURES.complaints} /></AdminShell>;
}
