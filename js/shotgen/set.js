// The 3D set for a location: a room built to size with a door and a window, or an open exterior. SPEC §8.1.
// Plan coordinates: x runs west → east, z runs north → south (north is up on the plan), y is height. Metres.

import * as THREE from "three";

export const LAYER_CAMERA_ONLY = 1;   // seen only through the shot camera (the ceiling)
export const LAYER_PLAN = 2;          // seen only in top and orbit views (wall outlines, camera body)

// Kitchen from SPEC §10: long walls run east–west so the window, centred in the long wall, faces south.
export function defaultRoom(exterior = false) {
  return {
    exterior,
    w: 5.0, d: 4.0, h: 2.6,
    door: { wall: "e", offset: 0, width: 0.9, height: 2.1 },
    window: { wall: "s", offset: 0, width: 1.4, height: 1.2, sill: 0.9 },
    north: 0,
  };
}

// Clay colours (sRGB hex). Floor darker than walls so the horizon and room shape read at a glance.
const CLAY = { floor: "#86898e", ground: "#8f9296", wall: "#d2d3d5", ceiling: "#e4e4e5", edge: "#55585d", grid: "#6c7075" };
const clay = (hex) => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });

// Dark lines along a mesh's edges and around its openings: corners and door frames are what make a clay room readable.
function edges(mesh) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: CLAY.edge }));
  lines.layers.mask = mesh.layers.mask;
  return lines;
}

// A wall: a flat panel facing into the room, with holes for openings. Seen from outside it's invisible,
// so the top and orbit views look straight in.
function wallPanel(length, height, openings) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.lineTo(length / 2, 0);
  shape.lineTo(length / 2, height);
  shape.lineTo(-length / 2, height);
  shape.closePath();
  for (const o of openings) {
    const hole = new THREE.Path();
    const x0 = Math.max(-length / 2 + 0.01, o.offset - o.width / 2);
    const x1 = Math.min(length / 2 - 0.01, o.offset + o.width / 2);
    const y0 = Math.max(0.001, o.bottom);
    const y1 = Math.min(height - 0.01, o.top);
    if (x1 <= x0 || y1 <= y0) continue;
    hole.moveTo(x0, y0);
    hole.lineTo(x0, y1);
    hole.lineTo(x1, y1);
    hole.lineTo(x1, y0);
    hole.closePath();
    shape.holes.push(hole);
  }
  const panel = new THREE.Mesh(new THREE.ShapeGeometry(shape), clay(CLAY.wall));
  panel.add(edges(panel));
  return panel;
}

// Each wall: where its centre is, which way it faces (into the room), its length, and which plan axis offsets run along.
function walls(room) {
  const { w, d } = room;
  return {
    n: { pos: [0, -d / 2], rotY: 0, length: w, axis: "x" },
    s: { pos: [0, d / 2], rotY: Math.PI, length: w, axis: "x" },
    w: { pos: [-w / 2, 0], rotY: Math.PI / 2, length: d, axis: "z" },
    e: { pos: [w / 2, 0], rotY: -Math.PI / 2, length: d, axis: "z" },
  };
}

function openingsOn(room, side) {
  const out = [];
  const { door, window: win } = room;
  if (door && door.wall === side) out.push({ kind: "door", offset: door.offset, width: door.width, bottom: 0, top: door.height });
  if (win && win.wall === side) out.push({ kind: "window", offset: win.offset, width: win.width, bottom: win.sill, top: win.sill + win.height });
  return out;
}

export function buildSet(room) {
  const g = new THREE.Group();
  g.name = "set";

  if (room.exterior) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), clay(CLAY.ground));
    ground.rotation.x = -Math.PI / 2;
    g.add(ground);
    const grid = new THREE.GridHelper(40, 40, CLAY.grid, CLAY.grid);
    grid.position.y = 0.002;
    g.add(grid);
    return g;
  }

  const { w, d, h } = room;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), clay(CLAY.floor));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  g.add(floorGrid(w, d));

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), clay(CLAY.ceiling));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  ceiling.layers.set(LAYER_CAMERA_ONLY);
  g.add(ceiling);

  for (const [side, wall] of Object.entries(walls(room))) {
    // Offsets are measured along the plan axis (+ = east or south); a panel's local x runs the other way on S and W walls.
    const flip = side === "s" || side === "w" ? -1 : 1;
    const openings = openingsOn(room, side).map((o) => ({ ...o, offset: o.offset * flip }));
    const panel = wallPanel(wall.length, h, openings);
    panel.position.set(wall.pos[0], 0, wall.pos[1]);
    panel.rotation.y = wall.rotY;
    g.add(panel);
  }

  g.add(planOutline(room));
  return g;
}

// 1 m squares counted from the north-west corner, so they measure from the walls.
function floorGrid(w, d) {
  const pts = [];
  for (let x = 1; x < w - 0.01; x++) pts.push(new THREE.Vector3(-w / 2 + x, 0.002, -d / 2), new THREE.Vector3(-w / 2 + x, 0.002, d / 2));
  for (let z = 1; z < d - 0.01; z++) pts.push(new THREE.Vector3(-w / 2, 0.002, -d / 2 + z), new THREE.Vector3(w / 2, 0.002, -d / 2 + z));
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: CLAY.grid }));
}

// Wall strips for the top view: dark where solid, a gap at the door, blue across the window.
const PLAN_WALL = 0.1;   // metres: drawn thickness of a wall seen from above
function planOutline(room) {
  const group = new THREE.Group();
  const strip = (side, wall, a, b, color, thickness) => {
    const len = b - a;
    if (len <= 0.001) return;
    const mid = (a + b) / 2;
    const out = side === "n" || side === "w" ? -1 : 1;   // push the strip outside the room
    const geo = wall.axis === "x" ? new THREE.BoxGeometry(len, 0.02, thickness) : new THREE.BoxGeometry(thickness, 0.02, len);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    if (wall.axis === "x") m.position.set(mid, room.h + 0.01, wall.pos[1] + out * thickness / 2);
    else m.position.set(wall.pos[0] + out * thickness / 2, room.h + 0.01, mid);
    m.layers.set(LAYER_PLAN);
    group.add(m);
  };
  for (const [side, wall] of Object.entries(walls(room))) {
    const cuts = openingsOn(room, side).map((o) => ({ ...o, a: o.offset - o.width / 2, b: o.offset + o.width / 2 })).sort((p, q) => p.a - q.a);
    let t = -wall.length / 2 - PLAN_WALL;
    for (const c of cuts) {
      strip(side, wall, t, c.a, 0x2a2c30, PLAN_WALL);
      if (c.kind === "window") strip(side, wall, c.a, c.b, 0x2f7fd1, PLAN_WALL * 0.5);
      t = Math.max(t, c.b);
    }
    strip(side, wall, t, wall.length / 2 + PLAN_WALL, 0x2a2c30, PLAN_WALL);
  }
  return group;
}
