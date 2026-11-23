// The real sun's place in the sky for a spot on Earth and a clock time there, worked out on the device (no network).
// Method: NOAA's solar calculator (the "General Solar Position" spreadsheet equations), with its refraction
// correction, so a low sun reads as a light meter would see it. Good to well under a degree for film dates.
// Plain JavaScript, no three.js, so the editor and the camera plan can use it too.

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const wrap = (d) => ((d % 360) + 360) % 360;

// utcMs: a moment (ms since 1970, UTC). Returns { azimuth (° true bearing the sun is in, 0 = north, 90 = east),
// elevation (° above the horizon, refraction included; negative = below) }.
export function sunPosition(utcMs, lat, lon) {
  const jd = utcMs / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = wrap(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda)));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eqTime = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M))
    + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
    - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));   // minutes
  const dayMin = (((utcMs % 86400000) + 86400000) % 86400000) / 60000;
  const solarTime = (((dayMin + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  let ha = solarTime / 4 - 180;
  if (ha < -180) ha += 360;
  const phi = rad(lat), H = rad(ha);
  const cosZ = Math.min(1, Math.max(-1, Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H)));
  const zenith = deg(Math.acos(cosZ));
  const azimuth = wrap(deg(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi))) + 180);
  const e0 = 90 - zenith;
  let refr = 0;   // arc seconds
  if (e0 <= 85) {
    const t = Math.tan(rad(e0));
    if (e0 > 5) refr = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5;
    else if (e0 > -0.575) refr = 1735 + e0 * (-518.2 + e0 * (103.4 + e0 * (-12.79 + e0 * 0.711)));
    else refr = -20.774 / t;
  }
  return { azimuth, elevation: e0 + refr / 3600, geometric: e0 };
}

// How far a time zone's clock is ahead of UTC at a moment, in ms (summer time included). Uses the time-zone
// tables built into the browser, which work offline.
function zoneOffset(utcMs, timeZone) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// date "YYYY-MM-DD", minutes after midnight on the location's clock → the moment in UTC (ms).
export function localToUtc(date, minutes, timeZone) {
  const [y, m, d] = String(date).split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d) + minutes * 60000;
  let utc = guess - zoneOffset(guess, timeZone);
  utc = guess - zoneOffset(utc, timeZone);   // second pass lands right on summer-time change days
  return utc;
}

// The device's own time zone, the default for a location without one.
export const deviceZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

export function validZone(z) {
  if (typeof z !== "string" || !z) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; }
}

// Every zone the browser knows, for a pick list (older browsers: just the device's own).
export function zoneList() {
  try { return Intl.supportedValuesOf("timeZone"); } catch { return [deviceZone()]; }
}

// The sun at a location's clock time: { azimuth, elevation }. place = { lat, lon, timeZone }.
export function sunAt(place, date, minutes) {
  return sunPosition(localToUtc(date, minutes, place.timeZone || deviceZone()), place.lat, place.lon);
}

// Sunrise and sunset on the location's clock (minutes after midnight, or null when the sun stays up or down),
// found by stepping through the day a minute at a time — quick enough, and it needs no special cases.
export function sunTimes(place, date) {
  const start = localToUtc(date, 0, place.timeZone || deviceZone());
  let rise = null, set = null, prev = null, noon = 0, high = -90;
  for (let m = 0; m <= 1440; m += 1) {
    const { elevation: el, geometric } = sunPosition(start + m * 60000, place.lat, place.lon);
    const up = geometric > -0.833;   // NOAA's sunrise: the sun's top edge on the horizon, refraction allowed for
    if (prev !== null && up && !prev && rise === null) rise = m;
    if (prev !== null && !up && prev) set = m;
    if (el > high) { high = el; noon = m; }
    prev = up;
  }
  return { rise, set, noon, high };
}

// "GPS" as typed or pasted: "60.1699, 24.9384", "60.1699 N 24.9384 E", "60°10'12\"N 24°56'18\"E".
export function parseGps(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const parts = s.match(/-?\d+(?:[.,]\d+)?(?:\s*°\s*\d+(?:[.,]\d+)?\s*['′]?(?:\s*\d+(?:[.,]\d+)?\s*["″]?)?)?\s*[NSEWnsew]?/g);
  if (!parts || parts.length < 2) return null;
  const one = (p) => {
    const hemi = (p.match(/[NSEWnsew]/) || [""])[0].toUpperCase();
    const nums = p.match(/-?\d+(?:[.,]\d+)?/g).map((n) => Number(n.replace(",", ".")));
    let v = Math.abs(nums[0]) + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
    if (nums[0] < 0 || hemi === "S" || hemi === "W") v = -v;
    return v;
  };
  const lat = one(parts[0]), lon = one(parts[1]);
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

export const clock = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;
export function parseClock(t) {
  const m = String(t || "").match(/^(\d{1,2})[:.](\d{2})/);
  return m ? Math.min(1439, Number(m[1]) * 60 + Number(m[2])) : null;
}
