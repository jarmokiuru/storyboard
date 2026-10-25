// Location files (INTEGRATION.md item 5): one set — room, openings, furniture, north, tag, optional GPS and the
// floor-plan picture with its two corner points — as `<Location>.location.json`, so a set can travel between
// projects and be written by the chat-side floor-plan step. Format in docs/project-format.md.

import * as db from "./db.js";
import { defaultRoom, uid } from "./model.js";

export const LOCATION_FORMAT = 1;

export async function locationFile(project, loc) {
  const location = { name: loc.name, tag: loc.tag, room: loc.room, objects: loc.objects || [] };
  if (loc.gps) location.gps = loc.gps;
  const out = { app: "storyboard-location", format: LOCATION_FORMAT, location };
  if (loc.plan) {
    const blob = await db.getPlan(project.id, loc.id);
    if (blob) {
      location.plan = loc.plan;
      out.planImage = await dataUrl(blob);
    }
  }
  return new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
}

// Resolves { location, planBlob } or throws with a message fit to show.
export async function readLocationFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That isn't a location file.");
  }
  if (data.app !== "storyboard-location" || !data.location) throw new Error("That isn't a location file.");
  if (Number(data.format) > LOCATION_FORMAT) throw new Error("This location file is from a newer version of Storyboard — reload the app to update it.");
  const l = data.location;
  const location = {
    name: String(l.name || "Set"),
    tag: ["measured", "traced", "assumed"].includes(l.tag) ? l.tag : "assumed",
    room: { ...defaultRoom(!!l.room?.exterior), ...(l.room || {}) },
    objects: (l.objects || []).map((o) => ({ ...o, id: o.id || uid(), kind: "object" })),
  };
  if (l.gps) location.gps = l.gps;
  let planBlob = null;
  if (l.plan && typeof data.planImage === "string" && data.planImage.startsWith("data:image/")) {
    planBlob = fromDataUrl(data.planImage);
    location.plan = l.plan;
  }
  return { location, planBlob };
}

function fromDataUrl(url) {
  const [head, body] = url.split(",");
  const type = head.slice(5).split(";")[0];
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
