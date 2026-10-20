import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "../components/brand-logo";
import Reveal from "./reveal";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Giới thiệu Góc Trọ",
  description: "Khám phá Góc Trọ: tìm phòng trên bản đồ, xem thông tin rõ ràng và gửi liên hệ đến nơi phù hợp.",
};

const WindowMark = ({ lit = false }: { lit?: boolean }) => <span className={lit ? styles.windowLit : styles.window} />;

function FeatureIcon({ kind }: { kind: "map" | "room" | "contact" }) {
  if (kind === "map") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m4 7 7-3 10 4 7-3v20l-7 3-10-4-7 3Z"/><path d="M11 4v20M21 8v20"/></svg>;
  if (kind === "room") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 27V7h22v20M10 27V13h12v14"/><path d="M17 20h1"/></svg>;
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 6h22v16H13l-6 5v-5H5Z"/><path d="M10 12h12M10 17h8"/></svg>;
}

export default function LandingPage() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.logo} href="/" aria-label="Góc Trọ — Tìm phòng"><BrandLogo /></Link>
        <nav className={styles.nav} aria-label="Điều hướng trang giới thiệu">
          <a href="#tim-phong">Tìm phòng</a>
          <a href="#hanh-trinh">Cách hoạt động</a>
          <a href="#quan-ly">Dành cho chủ nhà</a>
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.login} href="/login">Đăng nhập</Link>
          <Link className={styles.primarySmall} href="/">Tìm phòng ngay</Link>
        </div>
      </div>
    </header>

    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>KHÁM PHÁ NƠI Ở THEO CÁCH TRỰC QUAN HƠN</p>
          <h1>Tìm một góc<br/><span>để yên tâm ở.</span></h1>
          <p className={styles.heroLead}>Bắt đầu từ bản đồ Việt Nam, lọc theo nhu cầu, xem thông tin phòng và gửi liên hệ đến nơi phù hợp — trong một hành trình liền mạch.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primary} href="/">Tìm phòng ngay <span aria-hidden="true">→</span></Link>
            <a className={styles.textLink} href="#hanh-trinh">Xem cách hoạt động <span aria-hidden="true">↓</span></a>
          </div>
          <p className={styles.heroNote}><span /> Thông tin hiển thị từ các tin phòng đang được công khai trên hệ thống.</p>
        </div>

        <div className={styles.heroVisual} role="img" aria-label="Minh họa giao diện khám phá phòng trên bản đồ">
          <div className={styles.windowField} aria-hidden="true">
            {Array.from({ length: 30 }, (_, index) => <WindowMark key={index} lit={[8, 21].includes(index)} />)}
          </div>
          <div className={styles.productFrame}>
            <div className={styles.frameBar}><i/><i/><i/><span>Góc Trọ · Khám phá Việt Nam</span></div>
            <div className={styles.frameBody}>
              <aside className={styles.framePanel}>
                <span className={styles.frameKicker}>TÌM DỄ, Ở YÊN</span>
                <strong>Chọn nơi bạn muốn sống</strong>
                <p>Tìm tỉnh/thành</p>
                <span className={styles.frameAction}>Xem phòng</span>
              </aside>
              <div className={styles.mapShape} aria-hidden="true">
                <span className={styles.mapNorth}/><span className={styles.mapCenter}/><span className={styles.mapSouth}/><i />
              </div>
              <div className={styles.roomPeek}><span>PHÒNG ĐANG CÔNG KHAI</span><strong>Xem thông tin rõ ràng</strong><small>Giá thuê · diện tích · sức chứa</small></div>
            </div>
          </div>
          <span className={styles.visualCaption}>Minh họa sản phẩm · không phải số liệu phòng thực tế</span>
        </div>
      </div>
    </section>

    <section className={styles.statement}>
      <Reveal className={styles.statementInner}>
        <p>“Trọ” không chỉ là một chỗ ở tạm.</p>
        <h2>Đó là một góc của riêng mình — đủ rõ ràng để lựa chọn, đủ gọn gàng để bắt đầu.</h2>
      </Reveal>
    </section>

    <section className={styles.features} id="tim-phong">
      <div className={styles.sectionInner}>
        <Reveal className={styles.sectionHeading}>
          <p className={styles.eyebrow}>MỘT HÀNH TRÌNH TÌM PHÒNG GỌN HƠN</p>
          <h2>Từ toàn cảnh đến căn phòng bạn muốn xem.</h2>
          <p>Góc Trọ giúp bạn đi từ địa điểm đến thông tin cụ thể mà không phải ghép nối nhiều nguồn rời rạc.</p>
        </Reveal>
        <div className={styles.featureLayout}>
          <Reveal className={`${styles.featureMain} ${styles.featureCard}`}>
            <div className={styles.icon}><FeatureIcon kind="map" /></div>
            <span>01 · KHÁM PHÁ</span>
            <h3>Nhìn toàn cảnh trên bản đồ</h3>
            <p>Chọn trực tiếp tỉnh/thành hoặc tìm bằng tên để xem khu vực đang có tin phòng công khai.</p>
            <div className={styles.miniMap} aria-hidden="true"><i/><i/><i/><i/></div>
          </Reveal>
          <div className={styles.featureSide}>
            <Reveal className={styles.featureCard} delay={80}>
              <div className={styles.icon}><FeatureIcon kind="room" /></div>
              <span>02 · SO SÁNH</span>
              <h3>Lọc và xem thông tin phòng</h3>
              <p>Thu hẹp theo giá, diện tích và khu vực; mở chi tiết để xem nội dung mà nơi cho thuê đã công khai.</p>
            </Reveal>
            <Reveal className={`${styles.featureCard} ${styles.darkCard}`} delay={130}>
              <div className={styles.icon}><FeatureIcon kind="contact" /></div>
              <span>03 · KẾT NỐI</span>
              <h3>Gửi nhu cầu liên hệ</h3>
              <p>Để lại thông tin ngay tại phòng quan tâm để đơn vị vận hành tiếp nhận và phản hồi.</p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>

    <section className={styles.journey} id="hanh-trinh">
      <div className={styles.sectionInner}>
        <Reveal className={styles.journeyHeading}>
          <p className={styles.eyebrow}>CÁCH HOẠT ĐỘNG</p>
          <h2>Ba bước, một hướng đi rõ ràng.</h2>
        </Reveal>
        <div className={styles.steps}>
          <Reveal className={styles.step}>
            <strong>01</strong><span className={styles.stepWindow}/><div><h3>Tìm nơi phù hợp</h3><p>Chọn tỉnh/thành trên bản đồ hoặc dùng ô tìm kiếm.</p></div>
          </Reveal>
          <Reveal className={styles.step} delay={90}>
            <strong>02</strong><span className={styles.stepWindow}/><div><h3>Xem phòng chi tiết</h3><p>Đọc giá thuê, diện tích, sức chứa và mô tả công khai.</p></div>
          </Reveal>
          <Reveal className={styles.step} delay={180}>
            <strong>03</strong><span className={`${styles.stepWindow} ${styles.stepWindowLit}`}/><div><h3>Gửi liên hệ</h3><p>Chuyển nhu cầu của bạn đến đúng nơi đang vận hành phòng.</p></div>
          </Reveal>
        </div>
        <Reveal className={styles.journeyAction}><Link className={styles.secondary} href="/">Mở bản đồ tìm phòng <span aria-hidden="true">↗</span></Link></Reveal>
      </div>
    </section>

    <section className={styles.management} id="quan-ly">
      <div className={styles.managementInner}>
        <Reveal className={styles.managementCopy}>
          <p className={styles.eyebrow}>PHÍA SAU MỘT NƠI Ở GỌN GÀNG</p>
          <h2>Công việc vận hành cũng cần một góc rõ ràng.</h2>
          <p>Góc Trọ cung cấp các workspace quản lý cư dân, hợp đồng, hóa đơn, dịch vụ và phòng. Mỗi vai trò đăng nhập vào đúng khu vực để theo dõi công việc thuộc phạm vi của mình.</p>
          <Link className={styles.managementLink} href="/login">Đi đến trang đăng nhập <span aria-hidden="true">→</span></Link>
        </Reveal>
        <Reveal className={styles.managementBoard} delay={120}>
          <div className={styles.boardTop}><span>KHÔNG GIAN QUẢN LÝ</span><i /></div>
          <div className={styles.boardGrid}>
            {[
              ["Cư dân", "Tài khoản và hồ sơ"],
              ["Hợp đồng", "Thời hạn và trạng thái"],
              ["Hóa đơn", "Kỳ thu và chi tiết"],
              ["Dịch vụ", "Tiện ích và biểu giá"],
            ].map(([title, note], index) => <div key={title}><span className={index === 2 ? styles.boardWindowLit : styles.boardWindow}/><strong>{title}</strong><small>{note}</small></div>)}
          </div>
          <p>Khả năng hiển thị phụ thuộc vai trò và dữ liệu được cấp quyền.</p>
        </Reveal>
      </div>
    </section>

    <section className={styles.finalCta}>
      <Reveal className={styles.finalInner}>
        <div className={styles.finalMark} aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <WindowMark key={index} lit={index === 5} />)}</div>
        <p className={styles.eyebrow}>GÓC CỦA BẠN CÓ THỂ BẮT ĐẦU TỪ ĐÂY</p>
        <h2>Tìm một nơi vừa với cuộc sống của mình.</h2>
        <p>Khám phá các tin phòng đang được công khai trên Góc Trọ.</p>
        <Link className={styles.primary} href="/">Tìm phòng ngay <span aria-hidden="true">→</span></Link>
      </Reveal>
    </section>

    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <Link href="/" aria-label="Góc Trọ — Trang tìm phòng"><BrandLogo light /></Link>
        <p>Một góc yên tâm.</p>
        <nav aria-label="Liên kết cuối trang"><Link href="/">Tìm phòng</Link><Link href="/login">Đăng nhập</Link><a href="#tim-phong">Giới thiệu</a></nav>
        <small>© 2026 Góc Trọ</small>
      </div>
    </footer>
  </main>;
}
