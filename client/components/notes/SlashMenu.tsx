"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { SlashItem } from "@/components/notes/slashItems";

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(
  { items, command },
  ref,
) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = items.length ? Math.min(index, items.length - 1) : 0;

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (!items.length) return false;
        if (event.key === "ArrowUp") {
          setIndex((selected - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setIndex((selected + 1) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          command(items[selected]);
          return true;
        }
        return false;
      },
    }),
    [command, items, selected],
  );

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="nm-slash" role="listbox" aria-label="Insert block">
      <p className="nm-slash-title">Blocks</p>
      <div className="nm-slash-list" ref={listRef}>
        {items.length ? (
          items.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={itemIndex === selected}
              data-index={itemIndex}
              className={`nm-slash-item${itemIndex === selected ? " is-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setIndex(itemIndex)}
              onClick={() => command(item)}
            >
              <span className="nm-slash-icon">
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                {item.badge ? <span className="nm-slash-badge">{item.badge}</span> : null}
              </span>
              <span className="nm-slash-bd">
                <span className="nm-slash-label">{item.label}</span>
                <span className="nm-slash-hint">{item.hint}</span>
              </span>
            </button>
          ))
        ) : (
          <p className="nm-slash-empty">No matching blocks</p>
        )}
      </div>
    </div>
  );
});
