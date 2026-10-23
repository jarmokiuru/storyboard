// Minimal PDF writer: pages with text in the built-in Helvetica fonts, lines, rectangles and JPEG pictures.
// Written here instead of using a library, so nothing has to be downloaded and it works offline.
// Coordinates are in points (1/72 inch) from the top-left corner of the page.

const enc = new TextEncoder();

export const FONTS = { regular: "F1", bold: "F2", italic: "F3" };

// Characters outside Latin-1 that Helvetica's standard (WinAnsi) encoding still has.
const WIN_ANSI = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99 };

function pdfString(s) {
  let out = "(";
  for (const ch of s) {
    let c = ch.codePointAt(0);
    if (c > 255 || (c >= 128 && c < 160)) c = WIN_ANSI[ch] ?? 63;   // 63 = "?"
    if (c === 40 || c === 41 || c === 92) out += "\\" + String.fromCharCode(c);
    else if (c < 32 || c > 126) out += "\\" + c.toString(8).padStart(3, "0");
    else out += String.fromCharCode(c);
  }
  return out + ")";
}

const num = (v) => String(Math.round(v * 100) / 100);
const rgb = (c) => c.map(num).join(" ");

class Page {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.ops = [];
  }

  // y is the text baseline, measured from the top.
  text(str, x, y, { size = 10, font = "regular", color = [0, 0, 0] } = {}) {
    this.ops.push(`BT /${FONTS[font]} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(this.h - y)} Td ${pdfString(str)} Tj ET`);
  }

  // Text turned by angle (radians, anticlockwise), starting at x, y.
  turnedText(str, x, y, angle, { size = 10, font = "regular", color = [0, 0, 0] } = {}) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.ops.push(`BT /${FONTS[font]} ${num(size)} Tf ${rgb(color)} rg ${num(c)} ${num(s)} ${num(-s)} ${num(c)} ${num(x)} ${num(this.h - y)} Tm ${pdfString(str)} Tj ET`);
  }

  rect(x, y, w, h, { stroke = [0, 0, 0], width = 0.5, fill = null } = {}) {
    const path = `${num(x)} ${num(this.h - y - h)} ${num(w)} ${num(h)} re`;
    if (fill) this.ops.push(`q ${rgb(fill)} rg ${path} f Q`);
    if (stroke) this.ops.push(`q ${rgb(stroke)} RG ${num(width)} w ${path} S Q`);
  }

  line(x1, y1, x2, y2, { color = [0, 0, 0], width = 0.5 } = {}) {
    this.ops.push(`q ${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(this.h - y1)} m ${num(x2)} ${num(this.h - y2)} l S Q`);
  }

  image(name, x, y, w, h) {
    this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.h - y - h)} cm /${name} Do Q`);
  }
}

export class PDF {
  constructor() {
    this.pages = [];
    this.images = [];
  }

  addPage(w, h) {
    const p = new Page(w, h);
    this.pages.push(p);
    return p;
  }

  // bytes: a JPEG file. Returns the name to draw it with.
  addJpeg(bytes, width, height) {
    this.images.push({ bytes, width, height });
    return "Im" + this.images.length;
  }

  toBlob() {
    const parts = [];
    const offsets = [];
    let length = 0;
    const add = (x) => {
      const b = typeof x === "string" ? enc.encode(x) : x;
      parts.push(b);
      length += b.length;
    };
    const obj = (id, write) => {
      offsets[id] = length;
      add(`${id} 0 obj\n`);
      write();
      add("\nendobj\n");
    };

    const IMG = 6;
    const PAGE = IMG + this.images.length;
    const total = PAGE + this.pages.length * 2;
    const pageId = (i) => PAGE + i * 2 + 1;
    const contentId = (i) => PAGE + i * 2;

    add("%PDF-1.4\n%âãÏÓ\n");
    obj(1, () => add("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, () => add(`<< /Type /Pages /Kids [${this.pages.map((_, i) => pageId(i) + " 0 R").join(" ")}] /Count ${this.pages.length} >>`));
    ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique"].forEach((name, i) => {
      obj(3 + i, () => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`));
    });
    this.images.forEach((img, i) => {
      obj(IMG + i, () => {
        add(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
        add(img.bytes);
        add("\nendstream");
      });
    });

    const xobjects = this.images.map((_, i) => `/Im${i + 1} ${IMG + i} 0 R`).join(" ");
    const resources = `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /XObject << ${xobjects} >> >>`;
    this.pages.forEach((p, i) => {
      const content = p.ops.join("\n");
      obj(contentId(i), () => {
        add(`<< /Length ${content.length} >>\nstream\n`);
        add(content);
        add("\nendstream");
      });
      obj(pageId(i), () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources ${resources} /Contents ${contentId(i)} 0 R >>`));
    });

    const xref = length;
    add(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let id = 1; id < total; id++) add(String(offsets[id]).padStart(10, "0") + " 00000 n \n");
    add(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: "application/pdf" });
  }
}
