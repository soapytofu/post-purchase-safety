"use client";

import Form from "next/form";
import { flushSync } from "react-dom";
import { useId, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { parseSearchHistory, rememberSearch, type RecentSearch } from "@/lib/search-history";

export function SearchForm({ action, historyKey, defaultQuery, label, placeholder, children, className = "toolbar" }: {
  action: "/purchases" | "/notices"; historyKey: string; defaultQuery: string; label: string; placeholder: string; children: ReactNode; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState(defaultQuery);
  const [history, setHistory] = useState<RecentSearch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = history.filter(item => item.query.toLowerCase().includes(query.trim().toLowerCase()));
  const expanded = open && suggestions.length > 0;

  function readHistory() {
    try { return parseSearchHistory(localStorage.getItem(historyKey)); } catch { return []; }
  }
  function choose(value: string) {
    flushSync(() => { setQuery(value); setOpen(false); setActive(-1); });
    input.current?.form?.requestSubmit();
  }

  return <Form action={action} className={className} autoComplete="off" onSubmit={() => {
    const recent = rememberSearch(readHistory(), input.current?.value ?? "");
    setHistory(recent); setOpen(false); setActive(-1);
    try { localStorage.setItem(historyKey, JSON.stringify(recent)); } catch { /* Search works even when browser storage is disabled. */ }
  }}>
    <div className="search-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }}>
      <label className="search"><Search size={17} aria-hidden="true" /><input ref={input} name="q" type="text" autoComplete="off" spellCheck={false} maxLength={200} value={query} aria-label={label} placeholder={placeholder} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => { setHistory(readHistory()); setOpen(true); setActive(-1); }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") { setOpen(false); setActive(-1); }
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
            event.preventDefault(); setOpen(true);
            setActive(current => event.key === "ArrowDown" ? (current + 1) % suggestions.length : (current <= 0 ? suggestions.length : current) - 1);
          }
          if (event.key === "Enter" && expanded && active >= 0) { event.preventDefault(); choose(suggestions[active].query); }
        }} /></label>
      {expanded && <div className="search-history-popup">
        <div className="search-history-heading"><strong>Recent searches</strong><button type="button" onClick={() => { try { localStorage.removeItem(historyKey); } catch { /* No persisted history to remove. */ } setHistory([]); setActive(-1); input.current?.focus(); }}>Clear history</button></div>
        <ul id={listId} role="listbox" aria-label={`${label} history`}>{suggestions.map((item, index) => <li id={`${listId}-${index}`} role="option" aria-selected={active === index} key={item.query} className={active === index ? "selected" : ""} onMouseDown={event => event.preventDefault()} onClick={() => choose(item.query)}>{item.query}</li>)}</ul>
        <p>On this browser only · searches from the last 30 days</p>
      </div>}
    </div>
    {children}
  </Form>;
}
