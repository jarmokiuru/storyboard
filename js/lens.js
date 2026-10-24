// Reading and writing the Lens/Focal text that comes from Shot List.xlsx (INTEGRATION.md item 1).
// The shot list's text and the Shot Generator's focal length must agree.

// "50mm", "50 mm", "50", "Z 50mm", "Cooke S4 32mm T2" → { focal: 50 … }.
// A zoom range "24-70mm" → { focal: 24, range: [24, 70] }. Nothing usable → null.
export function parseLens(text) {
  const s = String(text ?? "").replace(",", ".");
  const range = s.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (ok(a) && ok(b) && b > a) return { focal: a, range: [a, b] };
  }
  // Prefer a number written with "mm"; otherwise the first plausible number (skipping T-stops like "T2.1").
  const mm = s.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (mm && ok(Number(mm[1]))) return { focal: Number(mm[1]) };
  for (const m of s.matchAll(/(^|[^A-Za-z\d.])(\d+(?:\.\d+)?)(?![\d.])/g)) {
    if (ok(Number(m[2]))) return { focal: Number(m[2]) };
  }
  return null;
}

const ok = (n) => Number.isFinite(n) && n >= 4 && n <= 1200;

// 50 → "50mm"; 37.5 → "37.5mm".
export const lensText = (focal) => `${Math.round(focal * 10) / 10}mm`;

// Does the board's Lens/Focal already describe this focal length? A zoom covers its whole range.
export function lensMatches(text, focal) {
  const lens = parseLens(text);
  if (!lens) return false;
  if (lens.range) return focal >= lens.range[0] - 0.05 && focal <= lens.range[1] + 0.05;
  return Math.abs(lens.focal - focal) < 0.05;
}
