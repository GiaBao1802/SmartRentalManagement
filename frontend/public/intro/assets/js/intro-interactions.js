// Page-specific navigation and pointer behavior; no dependency on the animation bundle.
export function initIntroNavigation({ document: doc = document } = {}) {
  const win = doc.defaultView;
  const nav = doc.querySelector(".nav-links");
  if (!win || !nav) return;

  const sections = Array.from(nav.querySelectorAll('a[href^="#"]')).map(link => ({
    id: link.getAttribute("href").slice(1),
    element: doc.getElementById(link.getAttribute("href").slice(1)),
  })).filter(section => section.element);
  if (!sections.length) return;
  const links = Array.from(doc.querySelectorAll('.nav-links a[href^="#"], .mobile-menu .mm-link[href^="#"]'));
  const pill = doc.createElement("span");
  pill.className = "nav-pill";
  pill.setAttribute("aria-hidden", "true");
  nav.prepend(pill);

  let activeId = null;
  let pendingId = null;
  let pendingTimer = 0;
  let scrollFrame = 0;
  let measureFrame = 0;
  let positions = [];

  function positionPill() {
    const link = links.find(item => item.closest(".nav-links") && item.getAttribute("href") === `#${activeId}`);
    if (!link || !nav.offsetWidth) { pill.style.opacity = "0"; return; }
    const bounds = link.getBoundingClientRect();
    const parent = nav.getBoundingClientRect();
    pill.style.width = `${bounds.width}px`;
    pill.style.transform = `translateX(${bounds.left - parent.left}px)`;
    pill.style.opacity = "1";
  }

  function select(id) {
    if (id === activeId) return;
    activeId = id;
    for (const link of links) {
      if (link.getAttribute("href") === `#${id}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
    positionPill();
  }

  function clearPending() {
    pendingId = null;
    win.clearTimeout(pendingTimer);
  }

  function updateFromScroll() {
    scrollFrame = 0;
    const header = doc.querySelector(".site-header");
    const line = win.scrollY + Math.min(win.innerHeight * .35, (header?.offsetHeight || 72) + 24);
    let id = positions[0]?.id;
    for (const section of positions) if (section.top <= line) id = section.id;
    const maxScroll = doc.documentElement.scrollHeight - win.innerHeight;
    if (maxScroll > 0 && win.scrollY >= maxScroll - 2) id = positions.at(-1)?.id;
    // A click selects its destination immediately, without flashing intermediate sections.
    if (pendingId && id !== pendingId) return;
    if (pendingId) clearPending();
    if (id) select(id);
  }

  function scheduleScroll() {
    if (!scrollFrame) scrollFrame = win.requestAnimationFrame(updateFromScroll);
  }

  function measure() {
    measureFrame = 0;
    positions = sections.map(section => ({ id: section.id, top: section.element.getBoundingClientRect().top + win.scrollY }));
    updateFromScroll();
    positionPill();
  }

  function scheduleMeasure() {
    if (!measureFrame) measureFrame = win.requestAnimationFrame(measure);
  }

  doc.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.('a[href^="#"]');
    const id = link?.getAttribute("href").slice(1);
    if (!sections.some(section => section.id === id)) return;
    clearPending();
    pendingId = id;
    select(id);
    pendingTimer = win.setTimeout(() => { clearPending(); scheduleScroll(); }, 1800);
  }, { capture: true });

  const interrupt = () => { clearPending(); scheduleScroll(); };
  win.addEventListener("scroll", scheduleScroll, { passive: true });
  win.addEventListener("wheel", interrupt, { passive: true });
  win.addEventListener("touchstart", interrupt, { passive: true });
  doc.addEventListener("pointerdown", interrupt, { passive: true });
  doc.addEventListener("keydown", event => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) interrupt();
  });
  win.addEventListener("resize", scheduleMeasure);
  win.addEventListener("load", scheduleMeasure);
  win.addEventListener("pageshow", scheduleMeasure);
  win.addEventListener("hashchange", interrupt);
  if (win.ResizeObserver) {
    const observer = new win.ResizeObserver(scheduleMeasure);
    observer.observe(nav);
    for (const section of sections) observer.observe(section.element);
  }
  doc.fonts?.ready.then(scheduleMeasure);
  measure();
}

export function initIntroPointer({ document: doc = document } = {}) {
  const win = doc.defaultView;
  if (!win || doc.querySelector(".cursor-dot")) return;
  const dot = doc.createElement("div");
  dot.className = "cursor-dot";
  dot.setAttribute("aria-hidden", "true");
  doc.body.appendChild(dot);
  let frame = 0;
  let x = 0;
  let y = 0;
  function hide() {
    win.cancelAnimationFrame(frame);
    frame = 0;
    dot.classList.remove("is-live");
  }
  win.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") { hide(); return; }
    x = event.clientX;
    y = event.clientY;
    if (!frame) frame = win.requestAnimationFrame(() => {
      frame = 0;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      dot.classList.add("is-live");
    });
  }, { passive: true });
  doc.documentElement.addEventListener("pointerleave", hide);
  win.addEventListener("pointercancel", hide);
  win.addEventListener("blur", hide);
}
