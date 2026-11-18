// The Set dialog's list of doors, windows and panels (room.openings, 2026-11-18). One block per opening: kind and
// wall, then offset, width, height and sill in metres. + Door / + Window / + Panel add one; ✕ removes it.
// Returned as a "custom" field for formDialog: { element, read() }.

import { OPENING_KINDS, OPENING_DEFAULTS, newOpening } from "../model.js";

const KIND_LABEL = { door: "Door", window: "Window", panel: "Panel (screen, board)" };
const WALLS = [["n", "North"], ["s", "South"], ["e", "East"], ["w", "West"]];

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

const select = (options, value) => {
  const s = el("select");
  for (const [v, label] of options) s.append(el("option", { value: v, textContent: label, selected: v === value }));
  return s;
};

const numberBox = (label, value) => {
  const input = el("input", { value: String(value), inputMode: "decimal", autocomplete: "off" });
  return { label: el("label", {}, el("span", { textContent: label }), input), input };
};

const read = (input, fallback) => {
  const v = parseFloat(String(input.value).replace(",", "."));
  return Number.isFinite(v) ? v : fallback;
};

export function openingsEditor(openings) {
  const list = el("div", { className: "openings-list" });
  const rows = [];

  const add = (o) => {
    const kind = select(OPENING_KINDS.map((k) => [k, KIND_LABEL[k]]), o.kind);
    const wall = select(WALLS, o.wall);
    const remove = el("button", { type: "button", className: "opening-remove", textContent: "✕", title: "Remove" });
    const offset = numberBox("Offset", o.offset);
    const width = numberBox("Width", o.width);
    const height = numberBox("Height", o.height);
    const sill = numberBox("Sill", o.sill);
    const block = el("div", { className: "opening" },
      el("div", { className: "opening-top" }, kind, wall, remove),
      el("div", { className: "opening-sizes" }, offset.label, width.label, height.label, sill.label));
    // A door stands on the floor, so it has no sill. Changing the kind brings that kind's usual sizes.
    const showSill = () => (sill.label.style.visibility = kind.value === "door" ? "hidden" : "");
    kind.onchange = () => {
      const d = OPENING_DEFAULTS[kind.value];
      width.input.value = d.width;
      height.input.value = d.height;
      sill.input.value = d.sill;
      showSill();
    };
    showSill();
    const row = {
      block,
      value: () => {
        const d = OPENING_DEFAULTS[kind.value];
        return {
          kind: kind.value, wall: wall.value,
          offset: read(offset.input, 0),
          width: Math.max(0.05, read(width.input, d.width)),
          height: Math.max(0.05, read(height.input, d.height)),
          sill: kind.value === "door" ? 0 : Math.max(0, read(sill.input, d.sill)),
        };
      },
    };
    remove.onclick = () => {
      rows.splice(rows.indexOf(row), 1);
      block.remove();
      empty.hidden = rows.length > 0;
    };
    rows.push(row);
    list.append(block);
    empty.hidden = true;
  };

  const empty = el("p", { className: "form-note", textContent: "No doors, windows or panels." });
  const adders = el("div", { className: "opening-add" },
    ...OPENING_KINDS.map((k) => {
      const b = el("button", { type: "button", textContent: "+ " + (k === "panel" ? "Panel" : KIND_LABEL[k]) });
      b.onclick = () => add(newOpening(k, "n"));
      return b;
    }));
  const element = el("fieldset", { className: "openings" },
    el("legend", { textContent: "Doors, windows and panels (m)" }), empty, list, adders);
  for (const o of openings) add(o);
  empty.hidden = rows.length > 0;
  return { element, read: () => rows.map((r) => r.value()) };
}
