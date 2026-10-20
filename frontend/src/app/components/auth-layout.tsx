import type { ReactNode } from "react";
import styles from "./auth-flow.module.css";
import BrandLogo from "./brand-logo";
export default function AuthLayout({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return <main className={styles.page}>
    <a className={styles.back} href="/">← Về trang chủ</a>
    <div className={styles.layout}>
      <aside className={styles.brand} aria-label="Góc trọ">
        <a className={styles.logo} href="/" aria-label="Góc Trọ · Một góc yên tâm."><BrandLogo light /></a>
        <div className={styles.windows} aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span key={index} />)}</div>
        <h2>Một góc yên tâm.</h2><p>Thông tin rõ ràng, việc quản lý gọn gàng. Góc của bạn, có người lo.</p>
      </aside>
      <section className={styles.card} aria-labelledby="auth-title">
        <span className={styles.kicker}>TÀI KHOẢN GÓC TRỌ</span><h1 id="auth-title">{title}</h1><p className={styles.description}>{description}</p>
        {children}{footer && <div className={styles.footer}>{footer}</div>}
      </section>
    </div>
  </main>;
}
