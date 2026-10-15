"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import AdminShell from "../../components/admin-shell";
import { ApiError } from "../../../lib/api/errors";
import { invoiceApi, type InvoiceListQuery, type InvoiceListResponse, type InvoiceStatus } from "../../../lib/api/invoiceApi";
import { propertyApi, type Property } from "../../../lib/api/propertyApi";
import { roomApi } from "../../../lib/api/roomApi";
import { residentApi, type Resident } from "../../../lib/api/residentApi";
import { BusinessCombobox } from "./business-combobox";
import { filterProperties, filterResidents, filtersForInvoiceApi, propertyOption, residentOption, roomOption, type BusinessOption } from "./invoice-list.logic";
import { InvoiceListContent } from "./invoice-list-content";

type InvoiceFilters = Pick<InvoiceListQuery, "property_id" | "room_id" | "resident_id" | "status" | "period_start" | "period_end">;
const emptyFilters: InvoiceFilters = {};
const pageSize = 20;

export default function InvoiceList() {
  const [rows, setRows] = useState<InvoiceListResponse["data"]>([]);
  const [meta, setMeta] = useState<InvoiceListResponse["meta"] | null>(null);
  const [page, setPage] = useState(1);
  const [property, setProperty] = useState<BusinessOption | null>(null);
  const [room, setRoom] = useState<BusinessOption | null>(null);
  const [resident, setResident] = useState<BusinessOption | null>(null);
  const [propertyQuery, setPropertyQuery] = useState("");
  const [roomQuery, setRoomQuery] = useState("");
  const [residentQuery, setResidentQuery] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<InvoiceFilters>(emptyFilters);
  const [properties, setProperties] = useState<BusinessOption[]>([]);
  const allPropertiesCache = useRef<Property[] | null>(null);
  const [rooms, setRooms] = useState<BusinessOption[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [propertyLoading, setPropertyLoading] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const [residentLoading, setResidentLoading] = useState(false);
  const [lookupsLoaded, setLookupsLoaded] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(""); setRows([]); setMeta(null);
    try {
      const result = await invoiceApi.list({ page, page_size: pageSize, ...appliedFilters });
      setRows(result.data); setMeta(result.meta);
    } catch (reason) {
      setLoadError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "Không thể tải danh sách hóa đơn. Vui lòng thử lại.");
    } finally { setLoading(false); }
  }, [appliedFilters, page]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      setPropertyLoading(true); setLookupError("");
      try {
        const query = propertyQuery.trim();
        const matches = await propertyApi.list({ page: 1, page_size: 100, search: query || undefined });
        let options = filterProperties(matches.data, query);
        // The existing API search may not remove Vietnamese diacritics. On a miss,
        // scan the Owner-scoped pages once and cache them for normalized local search.
        if (query && options.length === 0) {
          if (!allPropertiesCache.current) {
            const firstPage = await propertyApi.list({ page: 1, page_size: 100 });
            const all = [...firstPage.data];
            for (let currentPage = 2; currentPage <= firstPage.meta.total_pages; currentPage += 1) {
              const next = await propertyApi.list({ page: currentPage, page_size: 100 });
              all.push(...next.data);
            }
            allPropertiesCache.current = all;
          }
          options = filterProperties(allPropertiesCache.current, query);
        }
        if (!cancelled) setProperties(options.map(propertyOption));
      } catch (reason) { if (!cancelled) setLookupError(reason instanceof Error ? reason.message : "Không thể tìm khu trọ."); }
      finally { if (!cancelled) setPropertyLoading(false); }
    }, propertyQuery ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [propertyQuery]);

  useEffect(() => {
    if (!property) { setRooms([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      setRoomLoading(true); setLookupError("");
      try {
        const result = await roomApi.list(property.id, 1, 100, undefined, roomQuery.trim());
        if (!cancelled) setRooms(result.data.map(roomOption));
      } catch (reason) { if (!cancelled) setLookupError(reason instanceof Error ? reason.message : "Không thể tìm phòng trong khu trọ."); }
      finally { if (!cancelled) setRoomLoading(false); }
    }, roomQuery ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [property?.id, roomQuery]);

  const loadResidents = useCallback(async () => {
    if (lookupsLoaded || residentLoading) return;
    setResidentLoading(true); setLookupError("");
    try {
      const all: Resident[] = [];
      let currentPage = 1;
      let totalPages = 1;
      do {
        const result = await residentApi.list({ page: currentPage, page_size: 100 });
        all.push(...result.data);
        totalPages = result.meta.total_pages;
        currentPage += 1;
      } while (currentPage <= totalPages);
      setResidents(all); setLookupsLoaded(true);
    } catch (reason) { setLookupError(reason instanceof Error ? reason.message : "Không thể tải danh sách cư dân để tìm kiếm."); }
    finally { setResidentLoading(false); }
  }, [lookupsLoaded, residentLoading]);

  const filteredResidents = useMemo(() => filterResidents(residents, residentQuery).slice(0, 50).map(residentOption), [residents, residentQuery]);
  const residentIndex = useMemo(() => residents.map((item) => ({ resident_id: item.resident_id, full_name: item.full_name })), [residents]);
  const [rowResidentIndex, setRowResidentIndex] = useState<Array<{ resident_id: string; full_name: string }>>([]);
  useEffect(() => {
    let current = true;
    const ids = [...new Set(rows.map((item) => item.contract?.representative_resident_id).filter((id): id is string => Boolean(id)))];
    void Promise.all(ids.map(async (id) => {
      try { const value = await residentApi.get(id); return { resident_id: value.resident_id, full_name: value.full_name }; }
      catch { return null; }
    })).then((values) => { if (current) setRowResidentIndex(values.filter((value): value is { resident_id: string; full_name: string } => value !== null)); });
    return () => { current = false; };
  }, [rows]);
  const knownResidents = useMemo(() => [...residentIndex, ...rowResidentIndex], [residentIndex, rowResidentIndex]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFilterError("");
    if (periodStart && periodEnd && periodEnd < periodStart) { setFilterError("Ngày kết thúc kỳ phải bằng hoặc sau ngày bắt đầu kỳ."); return; }
    setAppliedFilters(filtersForInvoiceApi({ property, room, resident, status, periodStart, periodEnd }));
    setPage(1); setReloadKey((value) => value + 1);
  }

  function resetFilters() {
    setProperty(null); setRoom(null); setResident(null); setPropertyQuery(""); setRoomQuery(""); setResidentQuery("");
    setStatus(""); setPeriodStart(""); setPeriodEnd(""); setAppliedFilters(emptyFilters); setFilterError(""); setLookupError("");
    setPage(1); setReloadKey((value) => value + 1);
  }

  return <AdminShell active="/admin/invoices">
    <main className="admin-main invoice-page">
      <div className="breadcrumb">Vận hành · Hóa đơn</div>
      <div className="page-heading"><div><h1>Quản lý hóa đơn</h1><p>Theo dõi kỳ thu, trạng thái thanh toán và xử lý hóa đơn trong phạm vi chủ trọ.</p></div></div>
      <div className="summary-grid invoice-summary-grid"><section className="summary-card"><span>Tổng hóa đơn theo bộ lọc</span><strong>{meta ? meta.total_items : "—"}</strong><small>Phạm vi chủ trọ được xác định từ phiên đăng nhập</small></section></div>

      <section className="admin-card invoice-filter-card" aria-labelledby="invoice-filter-title">
        <h2 id="invoice-filter-title">Tìm kiếm và bộ lọc</h2>
        <form className="filter-form invoice-filter-grid" onSubmit={applyFilters}>
          <BusinessCombobox label="Tòa nhà / Khu trọ" placeholder="Tìm theo tên hoặc địa chỉ" selected={property} options={properties} loading={propertyLoading} onSearch={(value) => { setProperties([]); setPropertyQuery(value); }} onSelect={(value) => { setProperty(value); setRoom(null); setRoomQuery(""); setRooms([]); }} />
          <BusinessCombobox key={property?.id ?? "no-property"} label="Phòng" placeholder={property ? "Tìm theo mã phòng" : "Chọn khu trọ trước"} selected={room} options={rooms} loading={roomLoading} disabled={!property} emptyText={property ? "Không tìm thấy phòng trong khu trọ này." : "Chọn khu trọ để tìm phòng."} onSearch={(value) => { setRooms([]); setRoomQuery(value); }} onSelect={setRoom} />
          <BusinessCombobox label="Người thuê" placeholder="Tìm theo tên, CCCD hoặc số điện thoại" selected={resident} options={filteredResidents} loading={residentLoading} emptyText={lookupsLoaded ? "Không tìm thấy người thuê phù hợp." : "Nhập nội dung để tải danh sách người thuê."} onSearch={(value) => { setResidentQuery(value); void loadResidents(); }} onSelect={setResident} />
          <label>Kỳ bắt đầu từ ngày<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
          <label>Kỳ kết thúc đến ngày<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
          <label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatus | "")}><option value="">Tất cả trạng thái</option><option value="draft">Đang chuẩn bị</option><option value="unpaid">Chưa thanh toán</option><option value="paid">Đã thanh toán</option></select></label>
          <p className="invoice-filter-hint">Nhập tên hoặc địa chỉ để tìm khu trọ; danh sách hóa đơn được lọc phía máy chủ khi áp dụng.</p>
          {lookupError && <p className="notice invoice-filter-error" role="alert">{lookupError}</p>}
          {filterError && <p className="notice invoice-filter-error" role="alert">{filterError}</p>}
          <div className="filter-actions"><button className="button primary" type="submit">Áp dụng bộ lọc</button><button className="button" type="button" onClick={resetFilters}>Đặt lại</button></div>
        </form>
      </section>

      <InvoiceListContent rows={rows} meta={meta} page={page} loading={loading} error={loadError} onRetry={() => setReloadKey((value) => value + 1)} onPage={setPage} residents={knownResidents} />
    </main>
  </AdminShell>;
}
