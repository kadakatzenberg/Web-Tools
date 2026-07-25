/**
 * Command palette — the fast path to any combatant or action mid-fight.
 * Opened with Ctrl/Cmd + K.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { healthBand } from "@/domain/rules";
import { useStore, useStoreApi } from "@/state/store";
import { useFocusTrap, useScrollLock } from "./hooks";
import { playCue } from "@/fx/sound";
import "./palette.css";

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onGo,
  onExport,
  onImport,
  onClear,
  onToggleLog,
}: {
  open: boolean;
  onClose: () => void;
  onGo: (tab: "tracker" | "library" | "generator") => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  onToggleLog: () => void;
}) {
  const { present, past, future } = useStore();
  const { dispatch, undo, redo } = useStoreApi();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useFocusTrap(open, onClose);
  const listRef = useRef<HTMLUListElement>(null);
  useScrollLock(open);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [
      {
        id: "next-phase",
        label: "Advance phase",
        hint: "Space",
        group: "Combat",
        run: () => {
          dispatch({ type: "PHASE_ADVANCED" });
          playCue("phase");
        },
      },
      { id: "go-tracker", label: "Go to tracker", hint: "1", group: "Navigate", run: () => onGo("tracker") },
      { id: "go-library", label: "Go to library", hint: "2", group: "Navigate", run: () => onGo("library") },
      { id: "go-generator", label: "Go to generator", hint: "3", group: "Navigate", run: () => onGo("generator") },
      { id: "log", label: "Toggle combat log", hint: "L", group: "Navigate", run: onToggleLog },
      { id: "export", label: "Export encounter", group: "Data", run: onExport },
      { id: "import", label: "Import encounter", group: "Data", run: onImport },
      { id: "clear", label: "Clear the encounter", group: "Data", run: onClear },
    ];

    if (past.length) {
      list.unshift({ id: "undo", label: "Undo last action", hint: "Ctrl+Z", group: "Combat", run: undo });
    }
    if (future.length) {
      list.push({ id: "redo", label: "Redo", hint: "Ctrl+Shift+Z", group: "Combat", run: redo });
    }

    for (const c of present.combatants) {
      const band = healthBand(c.hp, c.maxHp);
      list.push({
        id: `focus-${c.id}`,
        label: c.name,
        hint: `${c.hp}/${c.maxHp}${band === "healthy" ? "" : ` · ${band}`}`,
        group: c.role === "Player" ? "Players" : "Enemies",
        run: () => {
          onGo("tracker");
          // Address the card by id. The previous selector was generic and
          // always resolved to the first card on the page, so searching for a
          // combatant scrolled you to somebody else entirely.
          requestAnimationFrame(() => {
            const card = document.querySelector<HTMLElement>(
              `[data-combatant="${CSS.escape(c.id)}"]`,
            );
            card?.scrollIntoView({ block: "center", behavior: "smooth" });
            card?.querySelector<HTMLElement>(".card__name")?.focus?.();
          });
        },
      });
      if (!c.done && c.hp > 0) {
        list.push({
          id: `done-${c.id}`,
          label: `Mark ${c.name} as acted`,
          group: "Combat",
          run: () => dispatch({ type: "COMBATANT_DONE_TOGGLED", id: c.id, done: true }),
        });
      }
    }

    return list;
  }, [present.combatants, past.length, future.length, dispatch, undo, redo, onGo, onExport, onImport, onClear, onToggleLog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 40);
    return items
      .filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
      .slice(0, 40);
  }, [items, query]);

  useEffect(() => {
    if (active >= filtered.length) setActive(0);
  }, [filtered.length, active]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="1"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const run = (item: Item | undefined) => {
    if (!item) return;
    item.run();
    onClose();
  };

  return createPortal(
    <div
      className="palette-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" ref={ref}>
        <input
          className="palette__input"
          value={query}
          autoFocus
          placeholder="Search combatants and commands…"
          aria-label="Search commands"
          aria-controls="palette-list"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(filtered[active]);
            }
          }}
        />

        <ul className="palette__list" id="palette-list" role="listbox" ref={listRef}>
          {filtered.length === 0 && <li className="palette__empty">Nothing matches “{query}”.</li>}
          {filtered.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                data-active={i === active ? "1" : undefined}
                className="palette__item"
                onMouseEnter={() => setActive(i)}
                onClick={() => run(item)}
              >
                <span className="palette__group">{item.group}</span>
                <span className="palette__label">{item.label}</span>
                {item.hint && <span className="palette__hint tnum">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>

        <footer className="palette__foot">
          <span>↑↓ move</span>
          <span>⏎ run</span>
          <span>esc close</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
