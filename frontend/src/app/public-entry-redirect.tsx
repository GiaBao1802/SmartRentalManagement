"use client";

import { useEffect, useRef } from "react";
import { firstEntryDestination } from "../lib/public-entry";

export default function PublicEntryRedirect() {
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;
    try {
      const destination = firstEntryDestination(window.sessionStorage);
      const query = window.location.search;
      const hash = window.location.hash;
      window.location.replace(destination === "intro" ? "/intro/index.html" : `/tim-phong${query}${hash}`);
    } catch {
      window.location.replace(`/tim-phong${window.location.search}${window.location.hash}`);
    }
  }, []);

  return <main aria-busy="true" aria-label="Đang mở Góc Trọ" className="public-entry-loading"><span>Góc Trọ</span></main>;
}
