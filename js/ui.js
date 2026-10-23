// Small interface helpers: toast, banner, dialogs, drop-down menus, file picking and saving.

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

function button(label, onclick, cls = "") {
  return el("button", { type: "button", textContent: label, className: cls, onclick });
}

let toastTimer;
export function toast(text, ms = 2600) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// A strip across the bottom with a message and buttons; stays until a button is tapped.
export function banner(text, actions = []) {
  const b = $("banner");
  b.innerHTML = "";
  b.append(el("span", { textContent: text }));
  for (const a of actions) {
    b.append(button(a.label, () => { b.hidden = true; a.action?.(); }, a.primary ? "primary" : ""));
  }
  b.hidden = false;
}

// Resolves as soon as a button is tapped, not on the dialog's close event: that event can arrive
// late, after the next dialog has already opened. Escape still counts as cancel.
function modal(build) {
  const d = $("dialog");
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      if (d.open) d.close();
      resolve(v);
    };
    d.innerHTML = "";
    build(d, done);
    d.onclose = () => { if (!d.open) done(null); };
    d.showModal();
  });
}

const row = (...buttons) => el("div", { className: "dialog-buttons" }, ...buttons);

export function confirmBox(text, { ok = "OK", cancel = "Cancel", danger = false } = {}) {
  return modal((d, done) => {
    d.append(el("p", { textContent: text }), row(button(cancel, () => done(false)), button(ok, () => done(true), danger ? "danger" : "primary")));
  }).then((v) => v === true);
}

// options: [{ label, value, danger }]; resolves to the chosen value, or null.
export function choose(text, options) {
  return modal((d, done) => {
    d.append(el("p", { textContent: text }), row(button("Cancel", () => done(null)), ...options.map((o) => button(o.label, () => done(o.value), o.danger ? "danger" : "primary"))));
  });
}

// fields: [{ name, label, type: "text"|"textarea"|"select", value, options }]
// options are strings or [value, label] pairs. extra: [{ label, value }] buttons that resolve { __action: value }.
export function formDialog(title, fields, { ok = "Save", extra = [] } = {}) {
  return modal((d, done) => {
    const form = el("form", { method: "dialog" }, el("h2", { textContent: title }));
    for (const f of fields) {
      let input;
      if (f.type === "select") {
        input = el("select", { name: f.name });
        for (const o of f.options) {
          const [value, label] = Array.isArray(o) ? o : [o, o];
          input.append(el("option", { value, textContent: label, selected: String(f.value) === value }));
        }
      } else if (f.type === "textarea") {
        input = el("textarea", { name: f.name, rows: 3, value: f.value ?? "" });
      } else {
        input = el("input", { name: f.name, value: f.value ?? "", autocomplete: "off" });
      }
      form.append(el("label", {}, el("span", { textContent: f.label }), input));
    }
    const extras = extra.map((x) => button(x.label, () => done({ __action: x.value }), "danger left"));
    form.append(row(...extras, button("Cancel", () => done(null)), el("button", { type: "submit", textContent: ok, className: "primary" })));
    form.onsubmit = (e) => {
      e.preventDefault();
      done(Object.fromEntries(new FormData(form)));
    };
    d.append(form);
  });
}

// items: { label, action } | { type: "toggle", label, value, onChange } | { type: "range", label, min, max, value, onChange }
//        | { type: "select", label, value, options: [[value, label]], onChange } | { type: "sep" } | { type: "note", label }
export function openMenu(anchor, items) {
  const m = $("menu");
  m.innerHTML = "";
  for (const it of items) {
    if (it.type === "sep") m.append(el("hr"));
    else if (it.type === "note") m.append(el("div", { className: "menu-note", textContent: it.label }));
    else if (it.type === "toggle") {
      const b = button(it.label, () => {
        it.value = !it.value;
        b.classList.toggle("checked", it.value);
        it.onChange(it.value);
      }, "menu-item toggle" + (it.value ? " checked" : ""));
      m.append(b);
    } else if (it.type === "range") {
      const input = el("input", { type: "range", min: it.min, max: it.max, value: it.value });
      input.oninput = () => it.onChange(Number(input.value));
      m.append(el("label", { className: "menu-field" }, el("span", { textContent: it.label }), input));
    } else if (it.type === "select") {
      const s = el("select");
      for (const [value, label] of it.options) s.append(el("option", { value, textContent: label, selected: String(it.value) === value }));
      s.onchange = () => it.onChange(s.value);
      m.append(el("label", { className: "menu-field" }, el("span", { textContent: it.label }), s));
    } else {
      m.append(button(it.label, () => { closeMenu(); it.action(); }, "menu-item"));
    }
  }
  const r = anchor.getBoundingClientRect();
  m.style.top = r.bottom + 6 + "px";
  m.style.right = Math.max(8, window.innerWidth - r.right) + "px";
  m.hidden = false;
  setTimeout(() => document.addEventListener("pointerdown", outside, true));
}

function outside(e) {
  if (!$("menu").contains(e.target)) closeMenu();
}

function closeMenu() {
  $("menu").hidden = true;
  document.removeEventListener("pointerdown", outside, true);
}

export function pickFile(accept = "") {
  const input = $("file-input");
  input.value = "";
  input.accept = accept;
  return new Promise((resolve) => {
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

const size = (bytes) => (bytes > 1e6 ? (bytes / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1e3)) + " KB");

// Saving needs a fresh tap (Safari only opens the share sheet straight after one), so ask first.
export function shareFile(blob, filename, type) {
  const file = new File([blob], filename, { type });
  const canShare = !!navigator.canShare?.({ files: [file] });
  return modal((d, done) => {
    const save = button(canShare ? "Save or share…" : "Download", async () => {
      try {
        if (canShare) {
          await navigator.share({ files: [file] });
        } else {
          const a = el("a", { href: URL.createObjectURL(blob), download: filename });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        }
        done(true);
      } catch (err) {
        if (err.name !== "AbortError") toast("Couldn't save: " + err.message);
      }
    }, "primary");
    d.append(el("h2", { textContent: "File ready" }), el("p", { textContent: `${filename} · ${size(blob.size)}` }), row(button("Cancel", () => done(false)), save));
  }).then((v) => v === true);
}
