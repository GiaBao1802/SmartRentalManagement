import ServiceCatalog from "../service-catalog";

export const metadata = { title: "Tiện ích cố định" };
export default function FixedServicesPage() { return <ServiceCatalog kind="FIXED_SERVICE" />; }
