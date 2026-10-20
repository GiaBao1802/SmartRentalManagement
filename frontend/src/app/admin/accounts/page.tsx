import styles from "../../components/auth-flow.module.css";
import AccountsContent from "./accounts-content";
export const metadata = { title: "Tài khoản và quyền truy cập" };
export default function AccountsPage() { return <div className={styles.invitationScope}><AccountsContent /></div>; }
