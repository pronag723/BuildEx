"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The platform picker in the contact-links editor.
//
// This was a native <select>. Native selects cannot be styled below the
// trigger, so the open list rendered as an OS menu — white background, blue
// system highlight, no platform icons — on a dark green-accented form. It also
// gave a builder no way to see which platforms they had already added: the
// already-used rows were `disabled`, which most browsers render as grey text
// with no explanation.
//
// This is a listbox with the same semantics and the same keyboard behaviour a
// select has, so nothing is lost:
//   Enter / Space / ArrowDown / ArrowUp  open the list
//   ArrowUp / ArrowDown / Home / End     move between selectable options
//   typing a letter                      jumps to the next option starting with it
//   Enter                                picks the active option
//   Escape / Tab / outside click         close without changing anything
// Options already used by another row stay in the list, greyed out and marked
// "added", so the set of platforms is always visible.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../../../lib/icons";

export default function PlatformSelect({
  value,
  options,
  usedKeys,
  onChange,
  label = "Link type",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Flip the panel above the trigger when the last row of a long form sits
  // near the bottom of the window.
  const [dropUp, setDropUp] = useState(false);

  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const typeahead = useRef({ text: "", at: 0 });

  const listId = useId();
  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.key === value),
    [options, value]
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const isDisabled = useCallback(
    (option) => option.key !== value && usedKeys.has(option.key),
    [usedKeys, value]
  );

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openList = useCallback(
    (startAt = "selected") => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        // The panel is at most ~344px tall. With less than that below the
        // trigger, and more above it, it opens upwards instead.
        const needed = Math.min(344, window.innerHeight * 0.52) + 12;
        setDropUp(window.innerHeight - rect.bottom < needed && rect.top > needed);
      }
      setOpen(true);
      if (startAt === "first") {
        setActiveIndex(options.findIndex((o) => !isDisabled(o)));
      } else if (startAt === "last") {
        const reversed = [...options].reverse().findIndex((o) => !isDisabled(o));
        setActiveIndex(reversed < 0 ? -1 : options.length - 1 - reversed);
      } else {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
      }
    },
    [options, isDisabled, selectedIndex]
  );

  const pick = useCallback(
    (option) => {
      if (!option || isDisabled(option)) return;
      if (option.key !== value) onChange(option.key);
      close();
    },
    [isDisabled, onChange, value, close]
  );

  // Step to the next selectable option, wrapping around.
  const move = useCallback(
    (delta) => {
      setActiveIndex((current) => {
        const total = options.length;
        let next = current < 0 ? (delta > 0 ? -1 : 0) : current;
        for (let step = 0; step < total; step += 1) {
          next = (next + delta + total) % total;
          if (!isDisabled(options[next])) return next;
        }
        return current;
      });
    },
    [options, isDisabled]
  );

  // Close on an outside click or on a scroll that would leave the panel
  // detached from its trigger.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) close(false);
    };
    const onScroll = (event) => {
      if (listRef.current?.contains(event.target)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  // Keep the active option in view when the arrows walk past the panel edge.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function onKeyDown(event) {
    const { key } = event;

    if (!open) {
      if (key === "Enter" || key === " " || key === "ArrowDown") {
        event.preventDefault();
        openList("selected");
      } else if (key === "ArrowUp") {
        event.preventDefault();
        openList("last");
      }
      return;
    }

    if (key === "Escape") {
      event.preventDefault();
      close();
    } else if (key === "Tab") {
      close(false);
    } else if (key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (key === "Home") {
      event.preventDefault();
      setActiveIndex(options.findIndex((o) => !isDisabled(o)));
    } else if (key === "End") {
      event.preventDefault();
      const reversed = [...options].reverse().findIndex((o) => !isDisabled(o));
      if (reversed >= 0) setActiveIndex(options.length - 1 - reversed);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      pick(options[activeIndex]);
    } else if (key.length === 1 && /\S/.test(key)) {
      // Type-ahead, the one select behaviour people miss when it is gone.
      const now = Date.now();
      const state = typeahead.current;
      state.text = now - state.at > 900 ? key.toLowerCase() : state.text + key.toLowerCase();
      state.at = now;
      const match = options.findIndex(
        (o) => !isDisabled(o) && o.label.toLowerCase().startsWith(state.text)
      );
      if (match >= 0) setActiveIndex(match);
    }
  }

  return (
    <div ref={rootRef} className={`platform-select ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label || ""}`}
        className={`onb-input platform-select-trigger ${open ? "is-open" : ""}`}
      >
        <Icon name={selected?.icon} size={15} className="platform-select-glyph" />
        <span className="platform-select-value">{selected?.label}</span>
        <Icon
          name="chevronDown"
          size={15}
          className={`platform-select-caret ${open ? "is-open" : ""}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          onKeyDown={onKeyDown}
          className={`platform-select-panel bx-scroll ${dropUp ? "is-up" : ""}`}
        >
          {options.map((option, index) => {
            const disabled = isDisabled(option);
            const isSelected = option.key === value;
            return (
              <li key={option.key}>
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={disabled}
                  disabled={disabled}
                  tabIndex={-1}
                  onMouseEnter={() => !disabled && setActiveIndex(index)}
                  onClick={() => pick(option)}
                  className={`platform-select-option ${index === activeIndex ? "is-active" : ""} ${
                    isSelected ? "is-selected" : ""
                  }`}
                >
                  <Icon name={option.icon} size={15} className="platform-select-option-glyph" />
                  <span className="platform-select-option-label">{option.label}</span>
                  {disabled ? (
                    <span className="platform-select-option-note">added</span>
                  ) : (
                    isSelected && <Icon name="check" size={15} className="platform-select-tick" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
