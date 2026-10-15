import AdminShell from "../../components/admin-shell";
import DeferredFeatureScreen, { DEFERRED_FEATURES } from "../../components/deferred-feature-screen";

export const metadata = { title: "Lịch tiện ích" };

export default function ViewingRequestsPage() {
  return <AdminShell active="/admin/viewings"><DeferredFeatureScreen {...DEFERRED_FEATURES.amenityCalendar} /></AdminShell>;
}
