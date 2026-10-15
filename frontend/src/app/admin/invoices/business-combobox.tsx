"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { BusinessOption } from "./invoice-list.logic";

export function BusinessCombobox({
  label, placeholder, selected, options, loading = false, disabled = false, emptyText = "Không tìm thấy kết quả.", onSearch, onSelect,
}: {
  label: string; placeholder: string; selected: BusinessOption | null; options: BusinessOption[]; loading?: boolean; disabled?: boolean;
  emptyText?: string; onSearch: (query: string) => void; onSelect: (option: BusinessOption | null) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const isTyping = useRef(false);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => { if (isTyping.current) { isTyping.current = false; return; } setQuery(selected?.label ?? ""); }, [selected?.id, selected?.label]);
  useEffect(() => { setActiveIndex((index) => Math.min(index, Math.max(options.length - 1, 0))); }, [options.length]);
  useEffect(() => {
    function onPointerDown(event: PointerEvent) { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  function choose(option: BusinessOption) { onSelect(option); setQuery(option.label); setOpen(false); }
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, options.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
    else if (event.key === "Enter" && open && options[activeIndex]) { event.preventDefault(); choose(options[activeIndex]); }
    else if (event.key === "Escape") setOpen(false);
  }

  return <div className="invoice-business-field" ref={root}>
    <label htmlFor={`${id}-input`}>{label}</label>
    <div className="invoice-combobox-control">
      <input id={`${id}-input`} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-listbox`} aria-activedescendant={open && options[activeIndex] ? `${id}-option-${activeIndex}` : undefined} autoComplete="off" disabled={disabled} value={query} placeholder={placeholder}
        onFocus={() => { setOpen(true); onSearch(query); }}
        onChange={(event) => { const value = event.target.value; isTyping.current = true; setQuery(value); onSelect(null); setActiveIndex(0); setOpen(true); onSearch(value); }}
        onKeyDown={handleKeyDown} />
      {selected && <button className="invoice-combobox-clear" type="button" aria-label={`Xóa ${label.toLocaleLowerCase("vi")}`} onClick={() => { onSelect(null); setQuery(""); onSearch(""); setOpen(false); }}>×</button>}
      {open && !disabled && <ul className="invoice-combobox-options" id={`${id}-listbox`} role="listbox" aria-label={`Kết quả ${label.toLocaleLowerCase("vi")}`}>
        {loading ? <li className="invoice-combobox-state" role="status">Đang tìm…</li> : options.length ? options.map((option, index) => <li id={`${id}-option-${index}`} role="option" aria-selected={selected?.id === option.id} key={option.id} className={index === activeIndex ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</li>) : <li className="invoice-combobox-state">{emptyText}</li>}
      </ul>}
    </div>
  </div>;
}
