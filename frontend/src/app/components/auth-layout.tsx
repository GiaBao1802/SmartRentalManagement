import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./auth-flow.module.css";
import BrandLogo from "./brand-logo";
export default function AuthLayout({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return <main className={styles.page}>
    <Link className={styles.back} href="/tim-phong">← Về trang chủ</Link>
    <div className={styles.layout}>
      <aside className={styles.brand} aria-label="Góc trọ">
        <Link className={styles.logo} href="/tim-phong" aria-label="Góc Trọ · Một góc yên tâm."><BrandLogo light /></Link>
        <div className={styles.windows} aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span key={index} />)}</div>
        <h2>Một góc yên tâm.</h2><p>Tìm phòng, xem thông tin nơi ở và quản lý khu trọ trên Góc Trọ.</p>
      </aside>
      <section className={styles.card} aria-labelledby="auth-title">
        <span className={styles.kicker}>TÀI KHOẢN GÓC TRỌ</span><h1 id="auth-title">{title}</h1><p className={styles.description}>{description}</p>
        {children}{footer && <div className={styles.footer}>{footer}</div>}
      </section>
    </div>
  </main>;
}
