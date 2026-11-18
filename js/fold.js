// Folding panel sections (<details class="psec" data-sec="…">): which ones are folded is remembered on the device,
// under its own key per panel. Used by the board editor's panel and the Shot Generator's.

export function foldable(root, key) {
  let folded = [];
  try { folded = JSON.parse(localStorage.getItem(key)) || []; } catch { /* first run */ }
  const sections = () => [...root.querySelectorAll(":scope > details.psec")];
  for (const d of sections()) {
    d.open = !folded.includes(d.dataset.sec);
    d.addEventListener("toggle", () => {
      const now = sections().filter((x) => !x.open).map((x) => x.dataset.sec);
      try { localStorage.setItem(key, JSON.stringify(now)); } catch { /* not essential */ }
    });
  }
}
