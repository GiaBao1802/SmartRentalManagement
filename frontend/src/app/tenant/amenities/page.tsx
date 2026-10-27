"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "../../components/brand-logo";
import { useAuth } from "../../components/auth-provider";
import { displayName } from "../../../lib/api/authApi";
import { ApiError } from "../../../lib/api/errors";
import { residentServiceApi, type ResidentService, type ResidentServiceBooking, type ResidentServiceProperty, type ResidentServiceSlot } from "../../../lib/api/residentServiceApi";
import ResidentPrimaryNavigation from "../resident-primary-navigation";

function message(reason: unknown) {
  return reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể tải danh sách tiện ích.";
}

function money(value: string) {
  try { return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ₫`; }
  catch { return "Chưa có giá hiện hành"; }
}

function date(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? "" : parsed.toLocaleDateString("vi-VN");
}

function todayHcm() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function serviceDateLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00+07:00`);
  return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat("vi-VN", { dateStyle: "full", timeZone: "Asia/Ho_Chi_Minh" }).format(parsed);
}

function bookingStatusLabel(booking: ResidentServiceBooking) {
  if (booking.status === "PENDING") return "Chờ chủ trọ duyệt";
  if (booking.status === "REJECTED") return "Chưa được duyệt";
  if (booking.status === "CANCELLED") return "Đã hủy";
  if (booking.invoice_no) {
    const state = booking.invoice_status === "paid" ? "đã thanh toán" : booking.invoice_status === "unpaid" ? "chưa thanh toán" : "bản nháp";
    return `Hóa đơn ${booking.invoice_no} · ${state}`;
  }
  return "Đã duyệt · chờ lập hóa đơn";
}

const weekdayNames = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];

function ServiceIcon({ small = false }: { small?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={small ? "resident-amenity-icon is-small" : "resident-amenity-icon"}>
    <path d="M12 3.5 14.3 9l5.7 2.2-5.7 2.3-2.3 5.6-2.2-5.6L4 11.2 9.8 9 12 3.5Z" />
    <path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z" />
  </svg>;
}

function ServiceCard({
  service, expanded, onToggle, serviceDate, onDateChange, slots, slotsLoading, slotsError, selectedTime, onTimeChange, onCheckAvailability, onBook, bookingPending, quotedPrice,
}: {
  service: ResidentService;
  expanded: boolean;
  onToggle: () => void;
  serviceDate: string;
  onDateChange: (value: string) => void;
  slots: ResidentServiceSlot[] | null;
  slotsLoading: boolean;
  slotsError: string;
  selectedTime: string;
  onTimeChange: (value: string) => void;
  onCheckAvailability: () => void;
  onBook: () => void;
  bookingPending: boolean;
  quotedPrice: { unit_price: string | null; unit: string } | null;
}) {
  const configuration = service.service_configuration;
  const isBooking = configuration?.service_mode === "BOOKING";
  const serviceType = !configuration ? "Chưa có lịch" : isBooking ? "Đặt theo khung giờ" : "Gói đăng ký";
  const availableDays = configuration?.available_weekdays.map((day) => weekdayNames[day]).join(" · ");
  return <article className={`resident-amenity-card${expanded ? " is-expanded" : ""}`}>
    <div className="resident-amenity-card-top">
      <span className="resident-amenity-card-icon"><ServiceIcon /></span>
      <span className="resident-amenity-kind">{serviceType}</span>
    </div>
    <h3>{service.name}</h3>
    <p className="resident-amenity-card-description">{service.description?.trim() || "Chủ trọ chưa thêm mô tả cho tiện ích này."}</p>
    <div className="resident-amenity-card-price">
      <span>Giá hiện hành</span>
      <strong>{service.current_price ? money(service.current_price.unit_price) : "Chưa có giá áp dụng"}</strong>
      {service.current_price && <small>{service.unit ? `/${service.unit}` : ""}</small>}
    </div>
    {expanded && <div className="resident-amenity-details">
      <div><span>Đơn vị tính</span><strong>{service.unit || "Chưa cập nhật"}</strong></div>
      {service.current_price && <div><span>Áp dụng từ</span><strong>{date(service.current_price.effective_from) || "Chưa xác định"}</strong></div>}
      {!configuration && <p>Lịch sử dụng chưa được chủ trọ cấu hình nên hiện chưa thể đặt.</p>}
      {configuration && <div><span>Ngày mở</span><strong>{availableDays || "Chưa xác định"}</strong></div>}
      {configuration && <div><span>Giờ hoạt động</span><strong>{configuration.opens_at}–{configuration.closes_at}</strong></div>}
      {isBooking && configuration?.booking && <div><span>Thời lượng mỗi lượt</span><strong>{configuration.booking.slot_duration_minutes} phút</strong></div>}
      {configuration?.service_mode === "SUBSCRIPTION" && configuration.subscription && <div><span>Thời hạn gói</span><strong>{configuration.subscription.duration_count} {configuration.subscription.duration_unit === "MONTH" ? "tháng" : "năm"}</strong></div>}
      <p>Thông tin lịch và loại sử dụng được đồng bộ từ chủ trọ.</p>
    </div>}
    {expanded && isBooking && <div className="resident-amenity-booking-panel">
      <h4>Đặt lịch sử dụng</h4>
      <div className="resident-amenity-booking-controls">
        <label>Chọn ngày<input type="date" min={todayHcm()} value={serviceDate} disabled={bookingPending} onChange={(event) => onDateChange(event.target.value)} /></label>
        <button className="resident-secondary-button" type="button" disabled={slotsLoading || !serviceDate} onClick={onCheckAvailability}>{slotsLoading ? "Đang tìm giờ trống…" : "Xem giờ trống"}</button>
      </div>
      {slotsError && <p className="resident-amenity-booking-error" role="alert">{slotsError}</p>}
      {slots && slots.length === 0 && !slotsLoading && <p className="resident-amenity-booking-empty">Ngày này chưa mở hoặc các khung giờ đã đủ chỗ. Hãy chọn ngày khác.</p>}
      {slots && slots.length > 0 && <div className="resident-amenity-booking-slot-row">
        <label>Khung giờ còn chỗ<select value={selectedTime} disabled={bookingPending} onChange={(event) => onTimeChange(event.target.value)}>
          <option value="">Chọn một khung giờ</option>
          {slots.map((slot) => <option key={slot.start_time} value={slot.start_time}>{slot.start_time}–{slot.end_time} · còn {slot.remaining_capacity} chỗ</option>)}
        </select></label>
        <button className="resident-amenity-book-button" type="button" disabled={!selectedTime || bookingPending || !quotedPrice?.unit_price} onClick={onBook}>{bookingPending ? "Đang gửi…" : "Gửi yêu cầu"}</button>
      </div>}
      {quotedPrice && <p className="resident-amenity-booking-quote">{quotedPrice.unit_price === null ? "Chưa có giá hiệu lực cho ngày này nên chưa thể gửi yêu cầu." : <>Phí dự kiến <strong>{money(quotedPrice.unit_price)} / {quotedPrice.unit}</strong>. Giá này được ghi nhận khi gửi; chỉ tính vào hóa đơn sau khi chủ trọ duyệt.</>}</p>}
      <p className="resident-amenity-booking-footnote">Yêu cầu giữ một chỗ trong sức chứa của khung giờ và chờ chủ trọ duyệt. Chưa thu tiền tại bước đăng ký.</p>
    </div>}
    {expanded && configuration?.service_mode === "SUBSCRIPTION" && <div className="resident-amenity-booking-panel">
      <h4>Gói sử dụng</h4>
      <p>Gói có thời hạn {configuration.subscription?.duration_count} {configuration.subscription?.duration_unit === "MONTH" ? "tháng" : "năm"}, sử dụng trong các ngày và khung giờ ở trên. Đăng ký và thanh toán gói chưa nằm trong luồng đặt lịch này.</p>
    </div>}
    <button className="resident-amenity-detail-button" type="button" aria-expanded={expanded} onClick={onToggle}>
      {expanded ? "Thu gọn" : "Xem chi tiết"}<span aria-hidden="true">{expanded ? "−" : "＋"}</span>
    </button>
  </article>;
}

export default function ResidentAmenitiesPage() {
  const router = useRouter();
  const { status, user, logout } = useAuth();
  const [groups, setGroups] = useState<ResidentServiceProperty[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<ResidentServiceBooking[] | null>(null);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState("");
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [availabilitySlots, setAvailabilitySlots] = useState<ResidentServiceSlot[] | null>(null);
  const [availabilityQuote, setAvailabilityQuote] = useState<{ unit_price: string | null; unit: string } | null>(null);
  const [availabilityServiceId, setAvailabilityServiceId] = useState<string | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [bookingPending, setBookingPending] = useState(false);
  const [bookingNotice, setBookingNotice] = useState("");
  const [bookingActionError, setBookingActionError] = useState("");
  const [cancelPendingId, setCancelPendingId] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?next=%2Ftenant%2Famenities");
    else if (status === "authenticated" && user?.account.role === "admin") router.replace("/admin/properties");
  }, [router, status, user]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || user?.account.role !== "resident") return () => { active = false; };
    setAvailabilityDate((current) => current || todayHcm());
    setLoading(true);
    setError("");
    void residentServiceApi.list()
      .then((result) => { if (active) setGroups(result); })
      .catch((reason: unknown) => { if (active) setError(message(reason)); })
      .finally(() => { if (active) setLoading(false); });
    setBookingsLoading(true);
    setBookingsError("");
    void residentServiceApi.bookings()
      .then((result) => { if (active) setBookings(result); })
      .catch((reason: unknown) => { if (active) setBookingsError(message(reason)); })
      .finally(() => { if (active) setBookingsLoading(false); });
    return () => { active = false; };
  }, [retry, status, user]);

  async function refreshBookings() {
    setBookingsError("");
    try { setBookings(await residentServiceApi.bookings()); }
    catch (reason) { setBookingsError(message(reason)); }
  }

  async function checkAvailability(serviceId: string, dateValue = availabilityDate) {
    setAvailabilityServiceId(serviceId);
    setAvailabilitySlots(null);
    setAvailabilityQuote(null);
    setSelectedTime("");
    setAvailabilityError("");
    setAvailabilityLoading(true);
    try {
      const result = await residentServiceApi.availability(serviceId, dateValue);
      setAvailabilitySlots(result.slots);
      setAvailabilityQuote({ unit_price: result.unit_price, unit: result.unit });
    }
    catch (reason) { setAvailabilityError(message(reason)); }
    finally { setAvailabilityLoading(false); }
  }

  function toggleService(service: ResidentService) {
    const nextId = expandedServiceId === service.service_id ? null : service.service_id;
    setExpandedServiceId(nextId);
    setAvailabilityServiceId(null);
    setAvailabilitySlots(null);
    setAvailabilityQuote(null);
    setAvailabilityError("");
    setSelectedTime("");
    setBookingNotice("");
    setBookingActionError("");
    setAvailabilityDate(todayHcm());
  }

  async function handleBook(service: ResidentService) {
    if (!selectedTime || bookingPending) return;
    setBookingPending(true);
    setBookingNotice("");
    setBookingActionError("");
    try {
      const booking = await residentServiceApi.book(service.service_id, availabilityDate, selectedTime);
      const quotedFee = booking.amount === null ? "" : ` Phí dự kiến ${money(booking.amount)}; `;
      setBookingNotice(`Đã gửi yêu cầu ${service.name} vào ${availabilityDate}, ${selectedTime}.${quotedFee}đang chờ chủ trọ duyệt.`);
      setSelectedTime("");
      await Promise.all([refreshBookings(), checkAvailability(service.service_id, availabilityDate)]);
    } catch (reason) { setBookingActionError(message(reason)); }
    finally { setBookingPending(false); }
  }

  async function handleCancel(booking: ResidentServiceBooking) {
    if (!booking.can_cancel || cancelPendingId) return;
    if (!window.confirm(`Hủy lịch ${booking.service_name} vào ${booking.service_date}, ${booking.start_time}?`)) return;
    setCancelPendingId(booking.booking_id);
    setBookingNotice("");
    setBookingActionError("");
    try {
      await residentServiceApi.cancel(booking.booking_id);
      setBookingNotice("Đã hủy yêu cầu. Chỗ trống đã được cập nhật.");
      await refreshBookings();
      if (expandedServiceId) await checkAvailability(expandedServiceId, availabilityDate);
    } catch (reason) { setBookingActionError(message(reason)); }
    finally { setCancelPendingId(null); }
  }

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError("");
    try { await logout(); }
    catch { setLogoutError("Không thể kết thúc phiên với máy chủ. Hãy kiểm tra kết nối và thử lại."); }
    finally { setLogoutPending(false); }
  }

  const name = user ? displayName(user) : "Cư dân";
  const initials = name.trim().split(/\s+/).slice(-2).map((part) => part.charAt(0)).join("").toUpperCase();
  const serviceCount = useMemo(() => groups?.reduce((sum, group) => sum + group.services.length, 0) ?? 0, [groups]);

  if (status === "loading" || (status === "authenticated" && user?.account.role === "resident" && loading && groups === null && !error)) {
    return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><ServiceIcon /></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang tải tiện ích</h1><p>Vui lòng chờ trong giây lát.</p><span className="resident-progress" aria-label="Đang tải" /></div></main>;
  }
  if (status !== "authenticated" || user?.account.role !== "resident") {
    return <main className="tenant-page resident-state-page"><div className="resident-state-card"><span className="resident-state-symbol"><ServiceIcon /></span><span className="resident-eyebrow">CỔNG CƯ DÂN</span><h1>Đang chuyển đến trang phù hợp</h1><p>Hệ thống đang kiểm tra phiên đăng nhập của bạn.</p><span className="resident-progress" aria-label="Đang chuyển trang" /></div></main>;
  }

  return <main className="tenant-page resident-home resident-amenities-page">
    <header className="tenant-header resident-topbar">
      <a href="/" aria-label="Trang chủ Góc Trọ"><BrandLogo /></a>
      <ResidentPrimaryNavigation active="amenities" />
      <div className="resident-topbar-actions"><span className="resident-user-avatar" aria-hidden="true">{initials}</span><div className="resident-user-copy"><strong>{name}</strong><span>Cư dân</span></div><button className="resident-logout-button" type="button" disabled={logoutPending} onClick={() => void handleLogout()}>{logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}</button></div>
    </header>

    <div className="tenant-content resident-layout resident-amenities-layout">
      <section className="resident-amenity-hero" aria-labelledby="resident-amenity-title">
        <div className="resident-amenity-hero-copy"><span className="resident-eyebrow">DỊCH VỤ DÀNH CHO NƠI Ở CỦA BẠN</span><h1 id="resident-amenity-title">Tiện ích</h1><p>Xem dịch vụ, chọn lịch còn chỗ và theo dõi lịch đã đặt ngay tại đây.</p></div>
        <div className="resident-amenity-hero-art" aria-hidden="true"><span className="resident-amenity-orbit orbit-one" /><span className="resident-amenity-orbit orbit-two" /><span className="resident-amenity-hero-icon"><ServiceIcon /></span><i className="resident-amenity-spark spark-one" /><i className="resident-amenity-spark spark-two" /></div>
        <div className="resident-amenity-hero-count"><strong>{groups === null || loading ? "…" : serviceCount}</strong><span>tiện ích đang mở</span></div>
      </section>

      {logoutError && <p className="notice resident-inline-notice" role="alert">{logoutError}</p>}
      {bookingNotice && <p className="notice resident-inline-notice" role="status">{bookingNotice}</p>}
      {bookingActionError && <p className="notice resident-inline-notice is-error" role="alert">{bookingActionError}</p>}

      <section className="resident-amenity-bookings" aria-labelledby="resident-amenity-bookings-title">
        <div className="resident-amenity-section-heading"><div><span className="resident-eyebrow">LỊCH CỦA BẠN</span><h2 id="resident-amenity-bookings-title">Yêu cầu & lịch tiện ích</h2></div><span className="resident-amenity-count-pill"><i />{bookingsLoading ? "Đang tải" : `${bookings?.filter((booking) => booking.status === "PENDING").length ?? 0} chờ duyệt`}</span></div>
        {bookingsError && <div className="resident-amenity-state is-error" role="alert"><span className="resident-amenity-state-icon"><ServiceIcon /></span><div><h3>Chưa tải được lịch</h3><p>{bookingsError}</p><button className="resident-secondary-button" type="button" onClick={() => void refreshBookings()}>Tải lại</button></div></div>}
        {!bookingsError && bookingsLoading && <div className="resident-amenity-state" role="status"><span className="resident-progress" aria-label="Đang tải" /><p>Đang tải lịch đã đặt…</p></div>}
        {!bookingsError && !bookingsLoading && (!bookings || bookings.length === 0) && <div className="resident-amenity-bookings-empty">Bạn chưa đặt lịch tiện ích nào.</div>}
        {!bookingsError && !bookingsLoading && bookings && bookings.length > 0 && <div className="resident-amenity-booking-list">
          {bookings.map((booking) => <article className={`resident-amenity-booking-item${booking.status === "CANCELLED" ? " is-cancelled" : booking.status === "PENDING" ? " is-pending" : booking.status === "REJECTED" ? " is-rejected" : ""}`} key={booking.booking_id}>
            <span className="resident-amenity-booking-item-icon"><ServiceIcon small /></span>
            <div className="resident-amenity-booking-item-main"><strong>{booking.service_name}</strong><span>{booking.property_name ? `${booking.property_name} · ` : ""}{serviceDateLabel(booking.service_date)} · {booking.start_time}–{booking.end_time}</span>{booking.amount !== null && <span>Phí dự kiến: <strong>{money(booking.amount)} / {booking.unit}</strong></span>}{booking.decision_note && <span>Lý do: {booking.decision_note}</span>}</div>
            <span className={`resident-amenity-booking-status${booking.status === "CANCELLED" ? " is-cancelled" : booking.status === "PENDING" ? " is-pending" : booking.status === "REJECTED" ? " is-rejected" : ""}`}>{bookingStatusLabel(booking)}</span>
            {booking.can_cancel && <button className="resident-amenity-cancel-button" type="button" disabled={cancelPendingId === booking.booking_id} onClick={() => void handleCancel(booking)}>{cancelPendingId === booking.booking_id ? "Đang hủy…" : "Hủy yêu cầu"}</button>}
          </article>)}
        </div>}
      </section>

      <section className="resident-amenity-content" aria-label="Danh sách tiện ích">
        <div className="resident-amenity-section-heading"><div><span className="resident-eyebrow">THEO KHU TRỌ ĐANG CƯ TRÚ</span><h2>Tiện ích hiện có</h2></div><span className="resident-amenity-count-pill"><i />{groups === null || loading ? "Đang cập nhật" : `${serviceCount} dịch vụ`}</span></div>

        {error && <div className="resident-amenity-state is-error" role="alert"><span className="resident-amenity-state-icon"><ServiceIcon /></span><div><h3>Chưa tải được danh sách</h3><p>{error}</p><button className="resident-secondary-button" type="button" onClick={() => setRetry((current) => current + 1)}>Thử tải lại</button></div></div>}
        {!error && loading && groups === null && <div className="resident-amenity-state" role="status"><span className="resident-progress" aria-label="Đang tải" /><p>Đang tải danh mục tiện ích…</p></div>}
        {!error && !loading && groups?.length === 0 && <div className="resident-amenity-state"><span className="resident-amenity-state-icon"><ServiceIcon /></span><div><h3>Chưa có nơi ở đang hoạt động</h3><p>Danh sách tiện ích sẽ hiển thị khi tài khoản được liên kết với nơi ở hiện tại.</p></div></div>}

        {!error && !loading && groups && groups.length > 0 && <div className="resident-amenity-properties">
          {groups.map((group) => <section className="resident-amenity-property" key={group.property_id} aria-labelledby={`resident-amenity-property-${group.property_id}`}>
            <div className="resident-amenity-property-heading"><div><span className="resident-amenity-property-mark"><ServiceIcon small /></span><div><span className="resident-eyebrow">KHU TRỌ</span><h3 id={`resident-amenity-property-${group.property_id}`}>{group.property_name}</h3></div></div><span>{group.services.length} tiện ích</span></div>
            {group.services.length === 0
              ? <div className="resident-amenity-property-empty"><span>Chưa có tiện ích phát sinh được đăng tải tại khu trọ này.</span></div>
              : <div className="resident-amenity-grid">{group.services.map((service) => <ServiceCard
                key={service.service_id}
                service={service}
                expanded={expandedServiceId === service.service_id}
                onToggle={() => toggleService(service)}
                serviceDate={availabilityDate}
                onDateChange={(value) => { setAvailabilityDate(value); setAvailabilityServiceId(null); setAvailabilitySlots(null); setAvailabilityQuote(null); setAvailabilityError(""); setSelectedTime(""); }}
                slots={availabilityServiceId === service.service_id ? availabilitySlots : null}
                slotsLoading={availabilityServiceId === service.service_id && availabilityLoading}
                slotsError={availabilityServiceId === service.service_id ? availabilityError : ""}
                selectedTime={availabilityServiceId === service.service_id ? selectedTime : ""}
                onTimeChange={setSelectedTime}
                onCheckAvailability={() => void checkAvailability(service.service_id)}
                onBook={() => void handleBook(service)}
                bookingPending={bookingPending && expandedServiceId === service.service_id}
                quotedPrice={availabilityServiceId === service.service_id ? availabilityQuote : null}
              />)}</div>}
          </section>)}
        </div>}
      </section>

      <footer className="resident-footer"><span className="resident-footer-mark"><ServiceIcon small /></span><span>Góc Trọ <b>·</b> Cổng cư dân</span><span className="resident-footer-caption">Một góc yên tâm.</span></footer>
    </div>
  </main>;
}
