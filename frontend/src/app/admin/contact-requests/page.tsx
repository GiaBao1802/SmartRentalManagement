import type { Metadata } from "next";
import ContactRequestInbox from "./contact-request-inbox";

export const metadata: Metadata = { title: "Khách quan tâm", description: "Theo dõi các yêu cầu liên hệ từ khách tìm phòng." };

export default function ContactRequestsPage() { return <ContactRequestInbox />; }
