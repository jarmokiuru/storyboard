// Finds scenes in a pasted script or a Fountain file (SPEC §4, route 3).
// Scene headings start with INT., EXT., INT./EXT., I/E or the Finnish SIS., ULK., SIS./ULK.

const HEADING = /^(?:(\d+[A-Z]?)[.)]?\s+)?(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT|SIS\.?\s*\/\s*ULK|ULK\.?\s*\/\s*SIS|SIS|ULK)(?:\.|\s)\s*(.*)$/;
const FORCED = /^\.(?!\.)(.+)$/;            // Fountain: a line starting with one dot is a heading
const NUMBER_TAG = /\s*#([\w.-]+)#\s*$/;    // Fountain scene number: INT. HOUSE - DAY #12#

function intExtOf(prefix) {
  const p = prefix.toUpperCase().replace(/[.\s]/g, "");
  if (p === "INT" || p === "SIS") return "INT";
  if (p === "EXT" || p === "ULK") return "EXT";
  return "INT/EXT";
}

// "KEITTIÖ - PÄIVÄ" → location and time of day, split at the last dash.
function splitPlace(rest) {
  const m = rest.match(/^(.*\S)\s+[-–—]\s+(.+)$/);
  return m ? { lokaatio: m[1].trim(), aika: m[2].trim() } : { lokaatio: rest.trim(), aika: "" };
}

const isCue = (line, next) =>
  next.trim() !== "" &&
  line.length < 40 &&
  /^[A-ZÅÄÖÜ0-9 .'\-]+(\s*\(.*\))?\s*\^?$/.test(line) &&
  /[A-ZÅÄÖÜ]/.test(line) &&
  !/TO:$/.test(line);

export function parseScript(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  // Skip a Fountain title page ("Title: …" lines up to the first blank line).
  if (/^\s*[A-Za-z ]+:\s*/.test(lines[0] || "")) {
    while (i < lines.length && lines[i].trim() !== "") i++;
  }

  const scenes = [];
  let count = 0;
  let current = null;
  for (; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    let m = raw.length < 140 && raw.match(HEADING);
    const forced = !m && raw.match(FORCED);
    if (m || forced) {
      let rest = m ? m[3] : forced[1];
      let number = m ? m[1] : null;
      const tag = rest.match(NUMBER_TAG);
      if (tag) {
        number = tag[1];
        rest = rest.replace(NUMBER_TAG, "");
      }
      count++;
      current = {
        kohtaus: number || String(count),
        intExt: m ? intExtOf(m[2]) : "",
        ...splitPlace(rest),
        synopsis: "",
        cast: new Set(),
        actBefore: "",
      };
      scenes.push(current);
      continue;
    }
    if (!current) continue;
    const next = lines[i + 1] || "";
    if (isCue(raw, next)) {
      current.cast.add(raw.replace(/\s*\(.*\)\s*/g, "").replace(/\^$/, "").trim());
      // Skip the dialogue that follows the name.
      while (i + 1 < lines.length && lines[i + 1].trim() !== "") i++;
      continue;
    }
    if (!current.synopsis) current.synopsis = raw.length > 160 ? raw.slice(0, 157).trimEnd() + "…" : raw;
  }

  return scenes.map(({ cast, ...s }) => ({ ...s, henkilot: [...cast].join(", ") }));
}
