// Ridge Runner — the world: one seeded heightmap drives the terrain mesh
// and the flight model alike, so the ground the pilot sees is the ground
// the plane can hit. A valley runway, a lake, a small town, a mountain
// ridge to the north and drifting clouds, all in one low-poly style.
import * as THREE from 'three';
import { PALETTE, RUNWAY, WORLD_SIZE } from './config.js';
import { range } from './random.js';

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Deterministic 32-bit hash of a lattice point: the same seed, same noise. */
function latticeHash(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = latticeHash(ix, iz, seed);
  const b = latticeHash(ix + 1, iz, seed);
  const c = latticeHash(ix, iz + 1, seed);
  const d = latticeHash(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/**
 * Ground height at (x, z). Pure and seeded: the mesh, the flight model and
 * the autopilot all call this same function, so they never disagree.
 */
export function makeHeightAt(seed) {
  const s1 = seed + 11;
  const s2 = seed + 47;
  const s3 = seed + 101;
  return function heightAt(x, z) {
    // Rolling hills, three octaves.
    let h =
      (valueNoise(x / 220, z / 220, s1) - 0.5) * 12 +
      (valueNoise(x / 90, z / 90, s2) - 0.5) * 6 +
      (valueNoise(x / 35, z / 35, s3) - 0.5) * 2.4;
    // Mountain ridge toward the north edge, with two named peaks.
    const ridge = smoothstep(-320, -560, z);
    h += ridge * (26 + 30 * valueNoise(x / 150, z / 150, s2));
    const dPeak1 = ((x + 350) / 130) ** 2 + ((z + 430) / 130) ** 2;
    const dPeak2 = ((x - 300) / 120) ** 2 + ((z + 480) / 120) ** 2;
    h += 68 * Math.exp(-dPeak1) + 58 * Math.exp(-dPeak2);
    // The lake basin, east of the runway.
    const dLake = ((x - 330) / 150) ** 2 + ((z - 140) / 95) ** 2;
    if (dLake < 1) h = h * smoothstep(0.55, 1, dLake) + -3 * (1 - smoothstep(0.55, 1, dLake));
    // The runway apron is flat ground.
    const dx = Math.max(0, Math.abs(x - RUNWAY.x) - 170);
    const dz = Math.max(0, Math.abs(z - RUNWAY.z) - 45);
    const dRun = Math.sqrt(dx * dx + dz * dz);
    h *= smoothstep(0, 70, dRun);
    return Math.max(-3, h);
  };
}

const LAKE = { x: 330, z: 140, rx: 150, rz: 95 };

function colourFor(height, slope, out) {
  if (height < 0.5) out.setHex(PALETTE.sand);
  else if (height > 52) out.setHex(PALETTE.snow);
  else if (height > 26 || slope > 0.55) out.setHex(PALETTE.rock);
  else if (height > 12) out.setHex(PALETTE.grassDry);
  else out.setHex(PALETTE.grass);
  // A little variation so the facets read as separate faces.
  const v = 0.92 + ((height * 13.7 + slope * 91.3) % 1) * 0.16;
  out.multiplyScalar(v);
  return out;
}

/** Build the static world and return it with its height query. */
export function buildTerrain(random, seed) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const heightAt = makeHeightAt(seed);

  // Ground: a low-poly heightmap with one colour per facet.
  const segments = 110;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const slope = Math.max(
      Math.abs(heightAt(x + 4, z) - h),
      Math.abs(heightAt(x, z + 4) - h),
    ) / 4;
    colourFor(h, slope, colour);
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
  );
  ground.name = 'ground';
  group.add(ground);

  // The lake: a flat blue sheet just above the basin floor.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(LAKE.rx * 2, LAKE.rz * 2, 1, 1),
    new THREE.MeshStandardMaterial({ color: PALETTE.water, transparent: true, opacity: 0.88, roughness: 0.25, metalness: 0.1 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(LAKE.x, -1.1, LAKE.z);
  water.name = 'lake';
  group.add(water);

  // Runway 27: asphalt, centreline dashes, threshold bars, edge lights.
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.length, 0.4, RUNWAY.width),
    new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.95 }),
  );
  strip.position.set(RUNWAY.x, 0.2, RUNWAY.z);
  strip.name = 'runway-strip';
  group.add(strip);
  const paint = new THREE.MeshStandardMaterial({ color: PALETTE.paintWhite, roughness: 0.8 });
  for (let x = -100; x <= 100; x += 20) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 0.9), paint);
    dash.position.set(x, 0.45, RUNWAY.z);
    group.add(dash);
  }
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 2.2), paint);
      bar.position.set(end * 112, 0.45, RUNWAY.z + k * 3.4);
      group.add(bar);
    }
  }
  const lampGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: PALETTE.paintAmber, emissive: PALETTE.paintAmber, emissiveIntensity: 0.9 });
  for (let x = -115; x <= 115; x += 23) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x, 0.7, RUNWAY.z + side * (RUNWAY.width / 2 + 1.5));
      group.add(lamp);
    }
  }
  // Windsock by the eastern threshold.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 9, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.6 }),
  );
  pole.position.set(138, 4.5, 26);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.5, 8),
    new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.7 }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(136, 8.6, 26);
  group.add(sock);

  // A small town south of the runway: walls, pitched roofs, a church tower.
  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.townWall, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: PALETTE.townRoof, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 14; i += 1) {
    const hx = range(random, 60, 200);
    const hz = range(random, 80, 165);
    const w = range(random, 7, 12);
    const d = range(random, 6, 10);
    const hgt = range(random, 5, 9);
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), wallMat);
    walls.position.y = hgt / 2;
    house.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 3.2, 4), roofMat);
    roof.position.y = hgt + 1.6;
    roof.rotation.y = Math.PI / 4;
    house.add(roof);
    house.position.set(hx, heightAt(hx, hz), hz);
    house.rotation.y = range(random, 0, Math.PI);
    house.name = `house-${i}`;
    group.add(house);
  }
  const church = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 6), wallMat);
  tower.position.y = 11;
  church.add(tower);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4.4, 9, 4), roofMat);
  spire.position.y = 26.5;
  spire.rotation.y = Math.PI / 4;
  church.add(spire);
  church.position.set(150, heightAt(150, 122), 122);
  church.name = 'church';
  group.add(church);

  // Pines on the gentle slopes, clear of the runway, town and lake.
  const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 1 });
  const pineMat = new THREE.MeshStandardMaterial({ color: PALETTE.tree, roughness: 1, flatShading: true });
  let planted = 0;
  let guard = 0;
  while (planted < 130 && guard < 900) {
    guard += 1;
    const x = range(random, -560, 560);
    const z = range(random, -560, 560);
    if (Math.abs(x) < 200 && Math.abs(z) < 60) continue;
    if (x > 40 && x < 220 && z > 60 && z < 180) continue;
    const dLake = ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2;
    if (dLake < 1.15) continue;
    const h = heightAt(x, z);
    if (h < 1.5 || h > 18) continue;
    const s = range(random, 0.8, 1.5);
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 2.4 * s, 5), trunkMat);
    trunk.position.y = 1.2 * s;
    tree.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6 * s, 7 * s, 6), pineMat);
    crown.position.y = (2.4 + 3.2) * s;
    tree.add(crown);
    const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.9 * s, 5 * s, 6), pineMat);
    crown2.position.y = (2.4 + 6) * s;
    tree.add(crown2);
    tree.position.set(x, h, z);
    tree.name = `pine-${planted}`;
    group.add(tree);
    planted += 1;
  }

  // Clouds: flat white puffs drifting high over the valley.
  const cloudMat = new THREE.MeshStandardMaterial({ color: PALETTE.cloud, roughness: 1, transparent: true, opacity: 0.92, flatShading: true });
  for (let i = 0; i < 12; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(random() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const r = range(random, 7, 14);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), cloudMat);
      puff.position.set(range(random, -14, 14), range(random, -2, 2), range(random, -6, 6));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(range(random, -520, 520), range(random, 95, 135), range(random, -520, 520));
    cloud.name = `cloud-${i}`;
    group.add(cloud);
  }

  return { group, heightAt, lake: LAKE };
}
