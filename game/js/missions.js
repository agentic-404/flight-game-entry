// Ridge Runner — the missions. Two jobs with different goals: first fly
// the ring course in order, then bring the plane home onto runway 27.
// Rings are seeded, so every seed flies a slightly different course.
import * as THREE from 'three';
import { PALETTE, RING, SCORE } from './config.js';
import { range } from './random.js';
import { angleDiff } from './flight.js';

export const STAGE_RINGS = 'rings';
export const STAGE_LANDING = 'landing';
export const STAGE_DONE = 'done';

/** Six rings on a weaving course through the valley, altitudes 28–55 m. */
export function createRingCourse(random) {
  const spots = [
    [200, -60, 35],
    [20, -115, 46],
    [-180, -40, 30],
    [-300, 100, 52],
    [-80, 122, 40],
    [120, 92, 34],
  ];
  // The fourth ring sits 184 m past the third on a 29-degree bend,
  // not 127 m: the shorter leg gave the plane no room to turn and
  // climb inside it, and the autopilot circled the ring until the
  // tanks ran dry (measured 26 Nov 2026).
  return spots.map(([x, z, y], i) => ({
    index: i,
    x: x + range(random, -12, 12),
    y: y + range(random, -4, 4),
    z: z + range(random, -12, 12),
    passed: false,
    mesh: null,
  }));
}

/** Build the glowing torus for each ring; the next one pulses. */
export function buildRingMeshes(rings) {
  const group = new THREE.Group();
  group.name = 'rings';
  const geo = new THREE.TorusGeometry(RING.radius, 0.7, 10, 40);
  rings.forEach((ring) => {
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.ringIdle,
      emissive: PALETTE.ringIdle,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ring.x, ring.y, ring.z);
    mesh.name = `ring-${ring.index + 1}`;
    mesh.userData.ring = ring;
    ring.mesh = mesh;
    group.add(mesh);
  });
  return group;
}

/** Face every ring along the course: toward the next ring, last toward home. */
export function aimRingMeshes(rings) {
  rings.forEach((ring, i) => {
    const next = rings[i + 1] ?? { x: 120, y: 8, z: 0 };
    const dx = next.x - ring.x;
    const dy = next.y - ring.y;
    const dz = next.z - ring.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    // Torus geometry faces +Z; point its normal along the course.
    ring.mesh.lookAt(ring.x + dx / len, ring.y + dy / len, ring.z + dz / len);
  });
}

export function createMissionState(rings) {
  return {
    stage: STAGE_RINGS,
    rings,
    ringsPassed: 0,
    score: 0,
    message: '',
    messageUntil: 0,
    lastRingAt: -1,
  };
}

/**
 * Check the next ring: crossing its plane near the centre scores, clipping
 * the rim scrapes the airframe. Call once per step with the previous and
 * current positions. Returns 'ring' | 'scrape' | null.
 */
export function checkRingPass(mission, prev, pos, bank) {
  if (mission.stage !== STAGE_RINGS) return null;
  const ring = mission.rings[mission.ringsPassed];
  if (!ring) return null;
  const next = mission.rings[mission.ringsPassed + 1] ?? { x: 120, y: 8, z: 0 };
  const nx = next.x - ring.x;
  const ny = next.y - ring.y;
  const nz = next.z - ring.z;
  const len = Math.hypot(nx, ny, nz) || 1;
  const ux = nx / len;
  const uy = ny / len;
  const uz = nz / len;
  const dPrev = (prev.x - ring.x) * ux + (prev.y - ring.y) * uy + (prev.z - ring.z) * uz;
  const dNow = (pos.x - ring.x) * ux + (pos.y - ring.y) * uy + (pos.z - ring.z) * uz;
  if ((dPrev <= 0 && dNow > 0) || (dPrev >= 0 && dNow < 0)) {
    // The course weaves, so a plane can approach a ring from either
    // side of the ring-to-next axis: a sign change in either direction
    // is a crossing of the ring plane.
    const dist = Math.hypot(pos.x - ring.x, pos.y - ring.y, pos.z - ring.z);
    if (dist <= RING.passRadius) {
      ring.passed = true;
      mission.ringsPassed += 1;
      let gained = SCORE.ring;
      if (Math.abs(bank) < 0.3) gained += SCORE.smoothRingBonus;
      mission.score += gained;
      mission.message = `RING ${ring.index + 1} OF ${mission.rings.length}! +${gained}`;
      if (mission.ringsPassed >= mission.rings.length) {
        mission.stage = STAGE_LANDING;
        mission.message = `COURSE CLEAR! NOW LAND ON RUNWAY 27`;
      }
      if (ring.mesh) {
        ring.mesh.material.color.setHex(PALETTE.ringDone);
        ring.mesh.material.emissive.setHex(PALETTE.ringDone);
      }
      return 'ring';
    }
    if (dist <= RING.rimRadius) {
      mission.message = 'RING RIM! AIRFRAME SCRAPED';
      return 'scrape';
    }
  }
  return null;
}

/** Colour the next ring amber and pulse it; passed rings stay green. */
export function updateRingVisuals(mission, time) {
  mission.rings.forEach((ring, i) => {
    if (!ring.mesh || ring.passed) return;
    const next = i === mission.ringsPassed && mission.stage === STAGE_RINGS;
    const target = next ? PALETTE.ringNext : PALETTE.ringIdle;
    ring.mesh.material.color.setHex(target);
    ring.mesh.material.emissive.setHex(target);
    ring.mesh.material.emissiveIntensity = next ? 0.9 + 0.5 * Math.sin(time * 5) : 0.55;
  });
}

/** Where the autopilot (and the HUD arrow) should aim right now. */
export function currentTarget(mission) {
  if (mission.stage === STAGE_RINGS) {
    const ring = mission.rings[mission.ringsPassed];
    if (ring) return { x: ring.x, y: ring.y, z: ring.z, kind: 'ring' };
  }
  if (mission.stage === STAGE_LANDING) {
    return { x: 420, y: 46, z: 0, kind: 'approach' };
  }
  return { x: 60, y: 8, z: 0, kind: 'runway' };
}

/** Bearing from the plane to the current target, for the HUD. */
export function targetBearing(state, mission) {
  const t = currentTarget(mission);
  const dx = t.x - state.pos.x;
  const dz = t.z - state.pos.z;
  const want = Math.atan2(dx, -dz);
  return angleDiff(state.heading, want);
}
