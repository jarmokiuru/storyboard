// Figure poses (SPEC §8.3). Authored here — nothing is taken from Storyboarder's own poses.
// A pose says where the hips go and which way each limb points. Directions are in the figure's own frame:
// +x = the figure's left, +y = up, +z = the way it faces. The app turns each bone so it points that way,
// which works for every body in the library (they share one skeleton) at any height.

import * as THREE from "three";

const v = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
// Right side = left side mirrored across the body.
const mirror = (d) => [-d[0], d[1], d[2]];

// hips: height as a share of standing hip height (1 = standing), or { lie: height in m }.
// body: rotation of the whole body at the hips, degrees [x, y, z]. spine: extra bend [x, y, z] spread over the spine.
// head: [x, y, z]. limbs: left-side directions; right side mirrored unless given (keys ending in R).
export const POSES = {
  stand: {
    label: "Stand",
    limbs: { arm: [0.12, -1, 0.02], fore: [0.06, -1, 0.1], upleg: [0.05, -1, 0], leg: [0, -1, 0], foot: [0, -0.35, 1] },
  },
  shift: {
    label: "Stand, weight on one leg",
    hips: 0.99, body: [0, 0, 4], spine: [0, 0, -6], head: [0, 0, 3],
    limbs: {
      arm: [0.12, -1, 0], fore: [0.05, -1, 0.12], upleg: [0.02, -1, 0], leg: [0, -1, 0], foot: [0, -0.35, 1],
      uplegR: [-0.16, -1, 0.06], legR: [-0.02, -1, -0.12], footR: [-0.1, -0.35, 1],
    },
  },
  walk: {
    label: "Walk",
    hips: 0.97, spine: [4, 0, 0],
    limbs: {
      arm: [0.1, -1, -0.32], fore: [0.05, -1, -0.05], upleg: [0.04, -1, 0.42], leg: [0, -1, 0.08], foot: [0, -0.2, 1],
      armR: [-0.1, -1, 0.32], foreR: [-0.05, -1, 0.5], uplegR: [-0.04, -1, -0.3], legR: [0, -1, -0.55], footR: [0, -0.7, 1],
    },
  },
  sitChair: {
    label: "Sit on a chair",
    hips: 0.5, spine: [-4, 0, 0],
    limbs: { arm: [0.16, -1, 0.42], fore: [0.04, -0.35, 1], upleg: [0.1, -0.05, 1], leg: [0.02, -1, 0.06], foot: [0, -0.35, 1] },
  },
  sitFloor: {
    label: "Sit on the floor",
    hips: { lie: 0.13 }, spine: [-12, 0, 0],
    limbs: { arm: [0.3, -1, -0.45], fore: [0.12, -1, -0.1], upleg: [0.18, 0.05, 1], leg: [0.04, -0.05, 1], foot: [0, 1, 0.25] },
  },
  lieBack: {
    label: "Lie on the back",
    hips: { lie: 0.11 }, body: [-90, 0, 0],
    limbs: { arm: [0.2, -1, 0], fore: [0.12, -1, 0.02], upleg: [0.06, -1, 0], leg: [0, -1, 0], foot: [0, -0.35, 1] },
  },
  lieSide: {
    label: "Lie on the side",
    hips: { lie: 0.18 }, body: [0, 0, -90], spine: [12, 0, 0],
    limbs: {
      arm: [0.15, -0.4, 1], fore: [0.05, 0.3, 1], upleg: [0.05, -1, 0.5], leg: [0, -1, -0.35], foot: [0, -0.35, 1],
      armR: [-0.1, -1, 0.3], foreR: [-0.05, -0.6, 1], uplegR: [-0.05, -1, 0.3], legR: [0, -1, -0.2], footR: [0, -0.35, 1],
    },
  },
  kneel: {
    label: "Kneel on one knee",
    hips: 0.52,
    limbs: {
      arm: [0.12, -1, 0.15], fore: [0.05, -1, 0.3], upleg: [0.08, -1, -0.05], leg: [0, -0.02, -1], foot: [0, -1, -0.2],
      uplegR: [-0.1, -0.05, 1], legR: [0, -1, 0], footR: [0, -0.35, 1],
    },
  },
  leanTable: {
    label: "Lean on a table",
    hips: 0.98, spine: [28, 0, 0], head: [-14, 0, 0],
    limbs: { arm: [0.18, -0.7, 0.75], fore: [0.04, -0.85, 0.5], upleg: [0.06, -1, -0.05], leg: [0, -1, 0], foot: [0, -0.35, 1] },
  },
  armsCrossed: {
    label: "Arms crossed",
    limbs: {
      arm: [0.16, -1, 0.3], fore: [-1, 0.12, 0.3], upleg: [0.05, -1, 0], leg: [0, -1, 0], foot: [0, -0.35, 1],
      foreR: [1, 0.2, 0.36],
    },
  },
  point: {
    label: "Point",
    limbs: {
      arm: [0.12, -1, 0.02], fore: [0.06, -1, 0.1], upleg: [0.05, -1, 0], leg: [0, -1, 0], foot: [0, -0.35, 1],
      armR: [-0.05, 0.08, 1], foreR: [-0.02, 0.06, 1],
    },
  },
  phone: {
    label: "Phone to ear",
    head: [0, 0, -8],
    limbs: {
      arm: [0.12, -1, 0.02], fore: [0.06, -1, 0.1], upleg: [0.05, -1, 0], leg: [0, -1, 0], foot: [0, -0.35, 1],
      armR: [-0.35, -0.75, 0.35], foreR: [0.3, 1, 0.12],
    },
  },
  overShoulder: {
    label: "Look over the shoulder",
    spine: [0, 28, 0], head: [0, 55, 0],
    limbs: { arm: [0.12, -1, 0.02], fore: [0.06, -1, 0.1], upleg: [0.05, -1, 0], leg: [0, -1, 0], foot: [0, -0.35, 1] },
  },
};

export const POSE_ORDER = Object.keys(POSES);

// The joints offered for hand posing (SPEC §8.3: select a joint and turn it).
export const JOINTS = [
  ["Spine1", "Back"], ["Neck", "Neck"], ["Head", "Head"],
  ["LeftArm", "Left upper arm"], ["LeftForeArm", "Left forearm"], ["LeftHand", "Left hand"],
  ["RightArm", "Right upper arm"], ["RightForeArm", "Right forearm"], ["RightHand", "Right hand"],
  ["LeftUpLeg", "Left thigh"], ["LeftLeg", "Left shin"], ["LeftFoot", "Left foot"],
  ["RightUpLeg", "Right thigh"], ["RightLeg", "Right shin"], ["RightFoot", "Right foot"],
];

// Bone → [the bone it points towards, the limb key it takes its direction from].
const CHAIN = [
  ["LeftArm", "LeftForeArm", "arm"], ["LeftForeArm", "LeftHand", "fore"],
  ["RightArm", "RightForeArm", "armR"], ["RightForeArm", "RightHand", "foreR"],
  ["LeftUpLeg", "LeftLeg", "upleg"], ["LeftLeg", "LeftFoot", "leg"], ["LeftFoot", "LeftToeBase", "foot"],
  ["RightUpLeg", "RightLeg", "uplegR"], ["RightLeg", "RightFoot", "legR"], ["RightFoot", "RightToeBase", "footR"],
];

const rad = (d) => (d * Math.PI) / 180;
const euler = ([x, y, z] = [0, 0, 0]) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(x), rad(y), rad(z), "YXZ"));

// Remember the rest pose once, so every pose starts from the same place.
export function remember(fig) {
  if (fig.rest) return;
  fig.bones = {};
  fig.node.traverse((o) => { if (o.isBone) fig.bones[o.name] = o; });
  fig.rest = new Map(Object.values(fig.bones).map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));
  fig.node.updateMatrixWorld(true);
  fig.hipsRest = fig.bones.Hips.getWorldPosition(new THREE.Vector3()).y / fig.node.getWorldScale(new THREE.Vector3()).y;
}

// Turn bone so its line towards `toward` points along `dir` (world space).
function aim(bone, toward, dir) {
  bone.updateMatrixWorld(true);
  const a = bone.getWorldPosition(new THREE.Vector3());
  const b = toward.getWorldPosition(new THREE.Vector3());
  const now = b.sub(a).normalize();
  if (now.lengthSq() < 1e-8) return;
  const turn = new THREE.Quaternion().setFromUnitVectors(now, dir.clone().normalize());
  rotateWorld(bone, turn);
}

// Apply a world-space rotation to a bone, keeping its parent where it is.
function rotateWorld(bone, q) {
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(q.multiply(world)));
  bone.updateMatrixWorld(true);
}

// Rotate a bone about axes of a given frame (a world quaternion), e.g. bend the spine forward in the body's frame.
function rotateIn(bone, frame, eulerQ) {
  const q = frame.clone().multiply(eulerQ).multiply(frame.clone().invert());
  rotateWorld(bone, q);
}

// item: the figure's data ({ pose, joints, ... }). look: world point the head should turn to, or null.
// The figure's holder (position, turn, height) must already be set and its matrices updated.
export function applyPose(fig, item, look) {
  remember(fig);
  for (const [bone, r] of fig.rest) {
    bone.quaternion.copy(r.q);
    bone.position.copy(r.p);
  }
  fig.node.updateMatrixWorld(true);
  const pose = POSES[item.pose] || POSES.stand;
  const B = fig.bones;
  const root = fig.node.getWorldQuaternion(new THREE.Quaternion());   // the figure's facing in the set

  // Hips: height and body rotation.
  const hips = B.Hips;
  const scale = fig.node.getWorldScale(new THREE.Vector3()).y;
  const footY = fig.node.getWorldPosition(new THREE.Vector3()).y;
  const h = pose.hips?.lie != null ? pose.hips.lie * scale : fig.hipsRest * scale * (pose.hips ?? 1);
  const at = hips.getWorldPosition(new THREE.Vector3());
  at.y = footY + h;
  hips.position.copy(hips.parent.worldToLocal(at));
  hips.updateMatrixWorld(true);
  if (pose.body) rotateIn(hips, root, euler(pose.body));
  const body = root.clone().multiply(euler(pose.body));

  // Spine bend shared over three bones; head turn split between neck and head.
  if (pose.spine) for (const name of ["Spine", "Spine1", "Spine2"]) rotateIn(B[name], body, euler(pose.spine.map((d) => d / 3)));

  // Limbs point where the pose says, measured in the body's frame.
  const L = pose.limbs || POSES.stand.limbs;
  for (const [bone, toward, key] of CHAIN) {
    const left = key.endsWith("R") ? null : L[key];
    const d = L[key] || (key.endsWith("R") ? mirror(L[key.slice(0, -1)]) : left);
    if (!d || !B[bone] || !B[toward]) continue;
    aim(B[bone], B[toward], v(...d).applyQuaternion(body));
  }
  if (pose.head) {
    rotateIn(B.Neck, body, euler(pose.head.map((d) => d * 0.4)));
    rotateIn(B.Head, body, euler(pose.head.map((d) => d * 0.6)));
  }

  // Hand posing: extra turns per joint, in the body's frame (degrees: forward/back, turn, side).
  for (const [name, angles] of Object.entries(item.joints || {})) {
    if (B[name] && angles.some(Boolean)) rotateIn(B[name], body, euler(angles));
  }

  // Eye-line: turn neck and head towards a point, within what a neck can do.
  if (look) {
    const head = B.Head.getWorldPosition(new THREE.Vector3());
    const local = look.clone().sub(head).applyQuaternion(body.clone().invert());
    const yaw = Math.max(-80, Math.min(80, (Math.atan2(local.x, local.z) * 180) / Math.PI));
    const pitch = Math.max(-40, Math.min(40, (Math.atan2(-local.y, Math.hypot(local.x, local.z)) * 180) / Math.PI));
    rotateIn(B.Neck, body, euler([pitch * 0.4, yaw * 0.4, 0]));
    rotateIn(B.Head, body, euler([pitch * 0.6, yaw * 0.6, 0]));
  }
  fig.node.updateMatrixWorld(true);
}
