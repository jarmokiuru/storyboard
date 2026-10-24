// Camera formats and lens maths. Angle of view comes from the sensor area actually imaged, not a "35 mm equivalent".
// ARRI figures checked 2026-10-24 against ARRI's own documents:
//   ALEXA 35 brochure (arri.com/resource/blob/274722/…/alexa-35-brochure-data.pdf)
//   ALEXA Mini LF technical data sheet (arri.com/resource/blob/261224/…/alexa-mini-lf-flyer-technical-data-sheet-data.pdf)
//   ALEXA Mini product page (arri.com/en/cine-systems/cine-cameras/legacy-cine-cameras/alexa-mini)
// The two "Generic" entries are common reference sizes, not a specific camera.

export const SENSORS = [
  { id: "a35-46k-og", camera: "ALEXA 35", mode: "4.6K 3:2 Open Gate", w: 28.0, h: 19.2 },
  { id: "a35-46k-169", camera: "ALEXA 35", mode: "4.6K 16:9", w: 28.0, h: 15.7 },
  { id: "a35-4k-169", camera: "ALEXA 35", mode: "4K 16:9", w: 24.9, h: 14.0 },
  { id: "a35-4k-21", camera: "ALEXA 35", mode: "4K 2:1", w: 24.9, h: 12.4 },
  { id: "a35-2k-s16", camera: "ALEXA 35", mode: "2K 16:9 S16", w: 12.4, h: 7.0 },
  { id: "mlf-45k-og", camera: "ALEXA Mini LF", mode: "4.5K LF 3:2 Open Gate", w: 36.7, h: 25.54 },
  { id: "mlf-45k-239", camera: "ALEXA Mini LF", mode: "4.5K LF 2.39:1", w: 36.7, h: 15.31 },
  { id: "mlf-43k-169", camera: "ALEXA Mini LF", mode: "4.3K LF 16:9", w: 35.64, h: 20.05 },
  { id: "mlf-38k-169", camera: "ALEXA Mini LF", mode: "3.8K LF 16:9", w: 31.68, h: 17.82 },
  { id: "mlf-34k-s35", camera: "ALEXA Mini LF", mode: "3.4K S35 3:2", w: 28.25, h: 18.17 },
  { id: "mlf-28k-s35-169", camera: "ALEXA Mini LF", mode: "2.8K S35 16:9", w: 23.76, h: 13.37 },
  { id: "mini-34k-og", camera: "ALEXA Mini", mode: "Open Gate 3.4K", w: 28.25, h: 18.17 },
  { id: "mini-32k", camera: "ALEXA Mini", mode: "3.2K / 4K UHD", w: 26.4, h: 14.85 },
  { id: "mini-28k-43", camera: "ALEXA Mini", mode: "4:3 2.8K", w: 23.76, h: 17.82 },
  { id: "mini-hd", camera: "ALEXA Mini", mode: "HD / 16:9 2.8K", w: 23.76, h: 13.37 },
  { id: "gen-s35", camera: "Generic", mode: "Super 35 (4-perf gate)", w: 24.89, h: 18.66 },
  { id: "gen-ff", camera: "Generic", mode: "Full frame 36 × 24", w: 36.0, h: 24.0 },
];

export const DEFAULT_SENSOR = "mlf-45k-og";
export const PRIMES = [14, 18, 21, 25, 29, 32, 35, 40, 50, 65, 75, 100, 135];

export const sensorById = (id) => SENSORS.find((s) => s.id === id) || SENSORS.find((s) => s.id === DEFAULT_SENSOR);
export const sensorLabel = (s) => `${s.camera} ${s.mode} (${s.w} × ${s.h} mm)`;

// The part of the sensor the frame uses: the project's aspect ratio fitted inside the sensor.
export function imagedArea(sensor, ratio) {
  return sensor.w / sensor.h > ratio ? { w: sensor.h * ratio, h: sensor.h } : { w: sensor.w, h: sensor.w / ratio };
}

const deg = (rad) => (rad * 180) / Math.PI;

export const horizontalAov = (sensor, ratio, focal) => deg(2 * Math.atan(imagedArea(sensor, ratio).w / (2 * focal)));
export const verticalAov = (sensor, ratio, focal) => deg(2 * Math.atan(imagedArea(sensor, ratio).h / (2 * focal)));
