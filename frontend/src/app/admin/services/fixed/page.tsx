import ServiceCatalog from "../service-catalog";

export const metadata = { title: "Dịch vụ cố định" };
export default function FixedServicesPage() { return <ServiceCatalog kind="FIXED_SERVICE" />; }
