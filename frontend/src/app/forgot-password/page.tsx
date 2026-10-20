import CredentialForm from "../components/credential-form";
export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" as const, robots: { index: false, follow: false } };
export default function Page() { return <CredentialForm mode="forgot" />; }
