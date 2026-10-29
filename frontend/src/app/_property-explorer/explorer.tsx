"use client";

import BrandLogo from "../components/brand-logo";
import dynamic from "next/dynamic";
import Link from "next/link";
import PublicAccountLinks from "../components/public-account-links";
import { PUBLIC_HOME } from "../../lib/public-navigation";
import { RoomFilters } from "./room-filters";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PublicRoomCard } from "../public-room-card";
import { useDialogFocus } from "../../lib/ui/dialog-accessibility";
import { listPublicRooms, serializePublicRoomFilters, type PublicRoomFilters, type PublicRoomListItem, type PublicRoomListResponse } from "../../lib/api/publicRoomApi";
import { demoOverview, demoResults, emptyFilters, overview, rooms, type Geography, type Overview } from "./explorer-data";
import type { CameraCommand } from "./vietnam-map";
import type { Insets } from "./scene-math";

const VietnamMap = dynamic(() => import("./vietnam-map"), { ssr: false, loading: () => <div className="explore-map-fallback">Đang mở bản đồ 3D…</div> });
const money = (value: string) => new Intl.NumberFormat("vi-VN").format(Number(value));
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();

export default function Explorer({ initialFilters }: { initialFilters?: PublicRoomFilters } = {}) {
  const [geo, setGeo] = useState<Geography | null>(null), [mapError, setMapError] = useState("");
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState("");
  const [mock, setMock] = useState(false), [retry, setRetry] = useState(0), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(""), [search, setSearch] = useState("");
  // Incoming Market links keep the public search semantics, including old province strings.
  // Selecting a geographic province then switches to the stable-code explorer endpoint.
  const [incomingSearch, setIncomingSearch] = useState(!!initialFilters);
  const [filters, setFilters] = useState<PublicRoomFilters>({ ...emptyFilters, ...initialFilters });
  const [results, setResults] = useState<PublicRoomListResponse | null>(null), [resultError, setResultError] = useState("");
  const [resultsLoading, setResultsLoading] = useState(false), [expanded, setExpanded] = useState(!!initialFilters);
  const [listOpen, setListOpen] = useState(false), [infoOpen, setInfoOpen] = useState(!initialFilters), [selectedCard, setSelectedCard] = useState("");
  const [reduced, setReduced] = useState(false), [mapUnavailable, setMapUnavailable] = useState(false);
  const [command, setCommand] = useState<CameraCommand>({ id: 0, kind: "home" });
  const [insets, setInsets] = useState<Insets>({ left: 24, right: 70, top: 30, bottom: 125 });
  const [preview, setPreview] = useState<PublicRoomListItem | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const scene = useRef<HTMLElement>(null), statsPanel = useRef<HTMLDivElement>(null), infoPanel = useRef<HTMLElement>(null);
  const listPanel = useRef<HTMLElement>(null), resultPanel = useRef<HTMLElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const hasResultsScope = !!selected || incomingSearch;
  useEffect(() => {
    const pathname = window.location.pathname;
    if (!["/", "/rooms", "/tim-phong"].includes(pathname) || mock) return;
    const query = incomingSearch ? `?${serializePublicRoomFilters(filters)}` : "";
    window.history.replaceState(null, "", `${PUBLIC_HOME}${query}`);
  }, [incomingSearch, filters, mock]);
  useDialogFocus(listOpen, listPanel);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches); update();
    media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let active = true; setMapError("");
    fetch("/maps/vietnam-34.geojson").then(r => { if (!r.ok) throw Error(); return r.json(); }).then((g: Geography) => {
      if (g.features.length !== 34 || new Set(g.features.map(f => f.properties.code)).size !== 34) throw Error();
      if (active) setGeo(g);
    }).catch(() => { if (active) { setMapError("Chưa tải được bản đồ. Bạn vẫn có thể tìm tỉnh và xem phòng."); setListOpen(true); } });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (mock) { if (geo) { setData(demoOverview(geo)); setLoading(false); setError(""); } return; }
    let active = true; setLoading(true); setError(""); setData(null);
    overview().then(d => { if (active) setData(d); }).catch(() => { if (active) setError("Chưa tải được tin đăng. Thử lại hoặc chọn dữ liệu minh họa."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mock, geo, retry]);
  useEffect(() => {
    setResults(null); setResultError("");
    if (!hasResultsScope || !data) { setResultsLoading(false); return; }
    let active = true; setResultsLoading(true);
    Promise.resolve().then(() => mock ? demoResults(selected, filters) : selected ? rooms(selected, filters) : listPublicRooms(filters)).then(r => { if (active) setResults(r); })
      .catch(error => { if (active) setResultError(error instanceof Error && error.message === "CLOUDY_RESULT_LIMIT" ? "Có quá nhiều kết quả để tải cùng lúc. Hãy thu hẹp khu vực, giá hoặc diện tích rồi thử lại." : "Không tải được danh sách phòng. Vui lòng thử lại."); }).finally(() => { if (active) setResultsLoading(false); });
    return () => { active = false; };
  }, [selected, filters, mock, data, retry, hasResultsScope]);
  useEffect(() => { if (preview) dialog.current?.showModal(); else dialog.current?.close(); }, [preview]);

  // Measure actual overlay rectangles; keep the fitted region in the remaining visible scene.
  useEffect(() => {
    const root = scene.current;
    if (!root) return;
    const update = () => {
      const rect = root.getBoundingClientRect(), mobile = rect.width <= 760;
      const visible = (el: HTMLElement | null) => el && el.getClientRects().length && getComputedStyle(el).display !== "none" ? el.getBoundingClientRect() : null;
      const stat = visible(statsPanel.current), info = visible(infoPanel.current), list = visible(listPanel.current), result = visible(resultPanel.current);
      const side = list;
      const next = mobile ? { top: stat ? stat.bottom - rect.top + 18 : 20,
        left: mobile ? 16 : side ? side.right - rect.left + 22 : 28,
        right: mobile ? 16 : info ? rect.right - info.left + 22 : 80,
        bottom: side ? rect.bottom - side.top + 20 : result ? rect.bottom - result.top + 20 : 100 }
        : { top: 30, left: 24, right: 70, bottom: 125 };
      setInsets(previous => Object.keys(next).every(key => Math.abs(previous[key as keyof Insets] - next[key as keyof Insets]) < 1) ? previous : next);
    };
    const observer = new ResizeObserver(update);
    [root, statsPanel.current, infoPanel.current, listPanel.current, resultPanel.current].forEach(el => { if (el) observer.observe(el); });
    update(); return () => observer.disconnect();
  }, [listOpen, infoOpen, expanded, selected, data, error]);

  const camera = useCallback((kind: CameraCommand["kind"]) => setCommand(c => ({ id: c.id + 1, kind })), []);
  const clear = useCallback(() => { setSelected(""); setIncomingSearch(false); setSelectedCard(""); setListOpen(false); setInfoOpen(false); setExpanded(false); setSearch(""); }, []);
  const mapFailed = useCallback(() => { setMapUnavailable(true); setListOpen(true); setExpanded(false); }, []);
  function home() { clear(); setInfoOpen(true); camera("home"); }
  function choose(code: string) {
    setSelected(code); setIncomingSearch(false); setSelectedCard(""); setFilters({ ...emptyFilters });
    setListOpen(false); setInfoOpen(true); setExpanded(false); setSearch("");
  }
  function toggleList() { setListOpen(v => !v); setExpanded(false); }
  function reset() { setFilters({ ...emptyFilters }); setSelectedCard(""); }
  function escape(e: KeyboardEvent) {
    if (e.key !== "Escape" || preview) return;
    e.preventDefault(); e.stopPropagation();
    if (listOpen) setListOpen(false); else if (search) setSearch(""); else if (expanded) setExpanded(false); else { clear(); searchInput.current?.focus(); }
  }
  const stat = data?.provinces.find(p => p.code === selected);
  const all = data?.provinces ?? geo?.features.map(f => f.properties) ?? [];
  const matches = all.filter(p => normalize(p.name).includes(normalize(search)));
  const provinceName = all.find(p => p.code === selected)?.name ?? (incomingSearch ? filters.location || filters.province || "Toàn quốc" : "Chọn một tỉnh/thành");
  const total = data?.provinces.reduce((sum, p) => sum + p.public_rooms, 0);
  const properties = data?.provinces.reduce((sum, p) => sum + p.public_properties, 0);
  const filteredEmpty = incomingSearch || !!stat?.public_rooms;
  const resultLabel = resultsLoading || loading ? "Đang tìm phòng…" : results ? `${results.meta.total_items} phòng khớp tìm kiếm` : resultError || !data ? "Chưa tải được kết quả" : "Chọn tỉnh để khám phá";
  const provinceButtons = () => matches.map(p => <button type="button" key={p.code} aria-pressed={p.code === selected} onClick={() => choose(p.code)}><span>{p.name}</span><small>{data?.provinces.find(s => s.code === p.code)?.public_rooms !== undefined ? `${data.provinces.find(s => s.code === p.code)!.public_rooms} phòng` : "Chưa có số liệu"}</small></button>);

  const returnTo = PUBLIC_HOME + (incomingSearch ? `?${serializePublicRoomFilters(filters)}` : "");

  return <main className="explorer" onKeyDown={escape}>
    <header className="explore-header">
      <Link className="explore-logo" href={PUBLIC_HOME} aria-label="Góc Trọ — Trang chủ tìm phòng" onClick={home}><BrandLogo /></Link>
      <form className="explore-header-search" role="search" onSubmit={e => { e.preventDefault(); if (matches[0]) choose(matches[0].code); }}>
        <span aria-hidden="true">⌕</span><input ref={searchInput} aria-label="Tìm tỉnh thành" placeholder="Tìm tỉnh/thành bạn muốn sống…" value={search} onChange={e => setSearch(e.target.value)} />
        {search && <div className="explore-search-results" aria-label="Gợi ý tỉnh thành">{matches.length ? provinceButtons() : <p>Không tìm thấy tỉnh/thành.</p>}</div>}
      </form>
      <div className="explore-header-actions"><button aria-expanded={listOpen} onClick={toggleList}><span>Danh sách</span></button></div>
      <nav aria-label="Điều hướng public"><a className="explore-about-link" href="/intro/index.html" onClick={() => { try { sessionStorage.removeItem('pd-trans'); } catch(e){} }}>Giới thiệu Góc Trọ</a></nav>
      <PublicAccountLinks returnTo={returnTo} className="explore-account-links" />
      <span className={`explore-mode ${mock ? "is-demo" : ""}`}><i />{mock ? "Dữ liệu minh họa" : loading ? "Đang tải tin…" : data ? "Tin đang đăng" : "Chưa tải được tin"}</span>
    </header>
    <section ref={scene} className="explore-scene" aria-label="Không gian khám phá Việt Nam">
      {mapError ? <div className="explore-map-fallback" role="alert">{mapError}<button onClick={() => setRetry(r => r + 1)}>Tải lại bản đồ</button></div> : geo ? <VietnamMap geo={geo} stats={data?.provinces ?? []} selected={selected} onSelect={choose} onClear={clear} command={command} insets={insets} reduced={reduced} onFailure={mapFailed} /> : <div className="explore-map-fallback" aria-busy="true">Đang tải bản đồ 34 tỉnh/thành…</div>}

      <div className="explore-stats" ref={statsPanel} aria-label="Tổng tin toàn quốc">
        <div><span className="explore-stat-icon">◫</span><p><span>Tỉnh/thành có tin</span><strong>{data ? data.provinces.filter(p => p.public_rooms > 0).length : "—"}<small>/ 34 tỉnh thành</small></strong></p></div>
        <div><span className="explore-stat-icon">⌂</span><p><span>Khu trọ có tin công khai</span><strong>{properties ?? "—"}<small>có phòng đang cho thuê</small></strong></p></div>
        <div><span className="explore-stat-icon">▦</span><p><span>Phòng đang đăng thuê</span><strong>{total ?? "—"}<small>tin công khai</small></strong></p></div>
      </div>

      {error && <div className="explore-alert" role="alert"><span>{error}</span><button onClick={() => setRetry(r => r + 1)}>Thử lại</button><button onClick={() => { clear(); setMock(true); }}>Xem minh họa</button></div>}
      {(mapUnavailable || mapError) && <div className="explore-map-status" role="status">Bản đồ tạm thời không khả dụng · <button onClick={toggleList}>Chọn tỉnh bằng danh sách</button></div>}

      {infoOpen && <aside ref={infoPanel} className="explore-info explore-panel" aria-label="Thông tin tỉnh">
        <div className="explore-panel-heading"><span className="explore-object-icon">⌖</span><div><small>{selected ? "TỈNH/THÀNH ĐANG CHỌN" : "GÓC TRỌ · KHÁM PHÁ VIỆT NAM"}</small><h1>{selected ? provinceName : "Tìm một nơi gọi là nhà"}</h1></div><button className="explore-icon-button" aria-label="Đóng bảng thông tin" onClick={() => setInfoOpen(false)}>×</button></div>
        {selected ? <><div className="explore-province-stats"><div><strong>{stat?.public_properties ?? "—"}</strong><span>Khu trọ có tin công khai</span></div><div><strong>{stat?.public_rooms ?? "—"}</strong><span>Phòng đang cho thuê</span></div></div><p className="explore-availability"><i />{stat ? stat.public_rooms ? "Có phòng đang được công khai" : "Hiện chưa có phòng công khai" : "Chưa tải được thông tin khu vực"}</p>
          <details className="explore-data-note"><summary>Phạm vi số liệu</summary><p>Đây là tổng tin toàn tỉnh, chưa áp dụng bộ lọc. Chưa có số liệu công khai về tổng cơ sở dùng hệ thống, phân loại khu trọ/căn hộ hoặc vị trí chính xác.</p></details>
          <div className="explore-info-actions"><button className="explore-primary" onClick={() => setExpanded(true)}>Xem phòng</button><button onClick={home}>Toàn cảnh</button></div></> : <><p className="explore-guide">Bấm trực tiếp một tỉnh trên bản đồ để xem phòng.</p><div className="explore-guide-steps"><span>01 Chọn tỉnh</span><span>02 Xem phòng</span><span>03 Xem chi tiết</span></div><p className="explore-guide-hint">Bản đồ cố định · Chọn tỉnh để khám phá<br />Hoặc dùng tìm kiếm và danh sách tỉnh.</p><button className="explore-primary" onClick={toggleList}>Khám phá 34 tỉnh/thành</button></>}
      </aside>}

      <div className="explore-camera-controls" aria-label="Điều khiển camera"><button aria-label="Phóng to" title="Phóng to" onClick={() => camera("in")}>+</button><button aria-label="Thu nhỏ" title="Thu nhỏ" onClick={() => camera("out")}>−</button><button aria-label="Toàn cảnh Việt Nam" title="Toàn cảnh Việt Nam" onClick={home}>⌂</button><button aria-label="Xem toàn bộ phạm vi gồm các đảo" title="Xem toàn bộ phạm vi gồm các đảo" onClick={() => camera("extent")}>⛶</button></div>
      <div className="explore-map-caption" aria-hidden="true"><span>VIỆT NAM</span><small>34 tỉnh/thành · Không gian khám phá</small></div>
      <div className="explore-legend" aria-label="Chú giải số phòng công khai"><span><i />{data ? "0 tin" : "Chưa có số liệu"}</span><span><i />1–5 tin</span><span><i />6+ tin</span><span><i />Đang chọn</span></div>

      {listOpen && <aside className="explore-province-list explore-panel" ref={listPanel} aria-label="Danh sách tỉnh thành"><div className="explore-panel-heading"><div><small>ĐỊA ĐIỂM CỦA BẠN</small><h2>34 tỉnh/thành</h2></div><button aria-label="Đóng danh sách tỉnh" className="explore-icon-button" onClick={() => setListOpen(false)}>×</button></div><div className="explore-province-buttons">{matches.length ? provinceButtons() : <p>Không tìm thấy tỉnh phù hợp.</p>}</div></aside>}

      <section ref={resultPanel} className={`explore-results explore-panel ${expanded && hasResultsScope ? "is-expanded" : ""}`} aria-label="Kết quả phòng">
        <div className="explore-results-heading"><span className="explore-object-icon">▦</span><div><small>{selected ? `${provinceName} · ${stat ? `${stat.public_rooms} phòng công khai toàn tỉnh` : "Chưa tải số liệu toàn tỉnh"}` : incomingSearch ? `Tìm kiếm: ${provinceName} · Kết quả theo bộ lọc trên liên kết` : "TÌM DỄ, Ở YÊN"}</small><h2 aria-live="polite">{hasResultsScope ? resultLabel : "Chọn tỉnh/thành để bắt đầu khám phá"}</h2></div>
          {hasResultsScope ? <div className="explore-results-heading-actions">{!mock && <Link className="explore-full-list-link" href={`/tim-phong/danh-sach?${serializePublicRoomFilters(incomingSearch ? filters : { ...filters, province: provinceName })}`}>Danh sách đầy đủ ↗</Link>}<button className="explore-results-toggle" aria-expanded={expanded} onClick={() => { setExpanded(v => !v); setListOpen(false); }}>{expanded ? "Thu gọn" : "Xem phòng"}</button></div> : <button onClick={toggleList}>Danh sách tỉnh</button>}
        </div>
        {hasResultsScope && expanded && <div className="explore-results-body"><RoomFilters filters={filters} allowProvince={incomingSearch} includePropertyFacilities={!mock} onApply={next => { setFilters(next); setSelectedCard(""); }} /><div className="explore-results-toolbar"><p>Danh sách phòng đang công khai</p><label>Sắp xếp<select value={filters.sort} onChange={e => { const sort = e.target.value as PublicRoomFilters["sort"]; setFilters({ ...filters, sort, page: 1 }); }}><option value="newest">Mới nhất</option><option value="price_asc">Giá tăng dần</option><option value="price_desc">Giá cao đến thấp</option><option value="area_asc">Diện tích tăng dần</option><option value="area_desc">Diện tích lớn đến nhỏ</option></select></label><label>Mỗi trang<select value={filters.page_size} onChange={e => { const page_size = Number(e.target.value); setFilters({ ...filters, page_size, page: 1 }); }}>{Array.from(new Set([1, 3, 6, filters.page_size ?? 6])).sort((a, b) => a - b).map(size => <option key={size} value={size}>{size} phòng</option>)}</select></label>
          {results && <div className="explore-pagination"><button aria-label="Trang trước" disabled={results.meta.page <= 1} onClick={() => setFilters({ ...filters, page: results.meta.page - 1 })}>←</button><span>{results.meta.page} / {Math.max(1, results.meta.total_pages)}</span><button aria-label="Trang sau" disabled={results.meta.page >= results.meta.total_pages} onClick={() => setFilters({ ...filters, page: results.meta.page + 1 })}>→</button></div>}</div>
          {resultsLoading || loading ? <div className="explore-state" aria-busy="true">Đang tìm phòng phù hợp…</div> : resultError || !data ? <div role="alert" className="explore-state"><strong>{resultError || "Chưa tải được tin đăng."}</strong><button onClick={() => setRetry(r => r + 1)}>Thử lại</button></div> : results && !results.data.length ? <div className="explore-state"><strong>{filteredEmpty ? "Không có phòng khớp bộ lọc" : "Chưa có phòng công khai khả dụng tại tỉnh này"}</strong><span>{filteredEmpty ? "Thử mở rộng khoảng giá hoặc diện tích." : "Chưa có số liệu công khai để xác định tình trạng tham gia của các cơ sở."}</span><button onClick={reset}>Đặt lại tìm kiếm</button></div> : null}
          <div className="explore-room-list">{results?.data.map(room => <article key={room.room_id} className={`explore-result-card ${selectedCard === room.room_id ? "is-selected" : ""}`} aria-label={`Phòng ${room.room_code}`} onClick={e => { if (!(e.target as HTMLElement).closest("a,button")) { setSelectedCard(room.room_id); } }}>
            <span className="explore-room-badge">TIN PHÒNG</span>{mock ? <div className="explore-demo-room"><div className="explore-demo-art"><img src="/assets/brand-v2/mark.svg" alt="" /><span>Ảnh minh họa</span></div><div><h3>{room.property.name} · {room.room_code}</h3><p>{room.property.address}</p><p>{room.area_m2} m² · {room.default_capacity} người</p><footer><strong>{money(room.default_rent)} đ<small>/tháng</small></strong><button onClick={() => setPreview(room)}>Xem trước</button></footer></div></div> : <PublicRoomCard room={room} returnTo={`/tim-phong?${serializePublicRoomFilters(incomingSearch ? filters : { ...filters, province: provinceName })}`} />}
          </article>)}</div>
        </div>}
      </section>
      <div className="explore-scene-footer"><button onClick={() => { clear(); setMock(v => !v); setInfoOpen(true); camera("home"); }}>{mock ? "Xem tin đang đăng" : "Thử dữ liệu minh họa"}</button><span>{!!data?.unmapped_rooms && `${data.unmapped_rooms} phòng chưa ánh xạ tỉnh · `}Bản đồ cộng đồng, chưa kiểm định ranh giới · <a href="/maps/source.json">Nguồn · MIT</a></span></div>
    </section>
    <dialog ref={dialog} onCancel={() => setPreview(null)} onClose={() => setPreview(null)} className="explore-preview"><button aria-label="Đóng cửa sổ xem trước" className="explore-icon-button" onClick={() => setPreview(null)}>×</button><small>DỮ LIỆU MINH HỌA</small><h2>{preview?.property.name}</h2><p>Phòng {preview?.room_code} · {preview?.area_m2} m² · {preview?.default_capacity} người</p><p>{preview?.property.address}</p><p>{preview?.public_description}</p><strong>{preview && money(preview.default_rent)} đ/tháng</strong><p>Thông tin phòng mẫu chỉ dùng để minh họa giao diện, không phải tin cho thuê thực tế.</p></dialog>
  </main>;
}
