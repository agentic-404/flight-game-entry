// Ridge Runner — the aircraft: a low-poly bush plane built from primitives,
// so it reads as a machine that was assembled, not a picture of one. The
// nose points down local -Z; the rig turns it with rotation order YXZ.
import * as THREE from 'three';
import { PALETTE } from './config.js';

/** Build the plane and return its group plus the parts the loop animates. */
export function buildAircraft() {
  const group = new THREE.Group();
  group.name = 'aircraft';
  group.rotation.order = 'YXZ';

  const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.aircraftBody, roughness: 0.55, metalness: 0.15, flatShading: true });
  const wingMat = new THREE.MeshStandardMaterial({ color: PALETTE.aircraftWing, roughness: 0.6, metalness: 0.1, flatShading: true });
  const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.aircraftTrim, roughness: 0.5, metalness: 0.2, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 0.4, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ef, roughness: 0.15, metalness: 0.4 });

  // Fuselage: a tapered body, nose at -Z.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 5.6, 8), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.2;
  fuselage.name = 'fuselage';
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 8), trimMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.3;
  nose.name = 'nose-cone';
  group.add(nose);
  // Tail cone.
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 8), bodyMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 4.0;
  tail.name = 'tail-cone';
  group.add(tail);

  // Main wings: one wide slab with trim tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.22, 1.7), wingMat);
  wing.position.set(0, 0.25, -0.4);
  wing.name = 'main-wing';
  group.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 1.7), trimMat);
    tip.position.set(side * 5.4, 0.25, -0.4);
    group.add(tip);
    // Navigation lights: red left, green right.
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshStandardMaterial({
        color: side < 0 ? 0xff2a2a : 0x2aff66,
        emissive: side < 0 ? 0xff2a2a : 0x2aff66,
        emissiveIntensity: 1.2,
      }),
    );
    lamp.position.set(side * 5.85, 0.25, -0.4);
    group.add(lamp);
  }

  // Tailplane and fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.1), wingMat);
  tailplane.position.set(0, 0.35, 4.6);
  tailplane.name = 'tailplane';
  group.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.9, 1.4), trimMat);
  fin.position.set(0, 1.1, 4.7);
  fin.name = 'fin';
  group.add(fin);

  // Canopy: a glasshouse over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), glassMat);
  canopy.scale.set(0.9, 0.62, 1.7);
  canopy.position.set(0, 0.85, -1.1);
  canopy.name = 'canopy';
  group.add(canopy);

  // Fixed landing gear: two struts, two wheels, one tail wheel.
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), darkMat);
    strut.position.set(side * 0.85, -0.75, -0.9);
    strut.rotation.z = side * 0.35;
    group.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.05, -1.35, -0.9);
    wheel.name = `wheel-${side < 0 ? 'left' : 'right'}`;
    group.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), darkMat);
  tailWheel.position.set(0, -0.75, 4.4);
  group.add(tailWheel);

  // Propeller: two blades on a spinner, spinning around the nose axis.
  const propeller = new THREE.Group();
  propeller.name = 'propeller';
  propeller.position.z = -4.05;
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 8), trimMat);
  spinner.rotation.x = -Math.PI / 2;
  propeller.add(spinner);
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.08), darkMat);
    blade.rotation.z = a;
    blade.position.z = 0.15;
    propeller.add(blade);
  }
  group.add(propeller);

  // Cockpit dashboard: a dark panel with three lit gauges, seen in cockpit view.
  const dashboard = new THREE.Group();
  dashboard.name = 'dashboard';
  dashboard.position.set(0, 0.55, -2.2);
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.5 }),
  );
  dashboard.add(panel);
  const gauges = [];
  const faceMat = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, roughness: 0.3, emissive: 0x9fd8ef, emissiveIntensity: 0.35 });
  const needleMat = new THREE.MeshStandardMaterial({ color: 0xd21f1f, roughness: 0.4 });
  for (let i = 0; i < 3; i += 1) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20), faceMat);
    face.position.set(-0.5 + i * 0.5, 0, 0.07);
    dashboard.add(face);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.01), needleMat);
    needle.position.set(-0.5 + i * 0.5, 0, 0.08);
    needle.geometry.translate(0, 0.07, 0);
    dashboard.add(needle);
    gauges.push(needle);
  }
  group.add(dashboard);

  return { group, propeller, gauges };
}

/**
 * Pose the aircraft from the flight state: position, heading, pitch and
 * bank, plus propeller spin and gauge needles. `bank` is positive turning
 * right, `pitch` positive climbing.
 */
export function updateAircraftVisual(parts, state, dt) {
  const { group, propeller, gauges } = parts;
  group.position.set(state.pos.x, state.pos.y, state.pos.z);
  group.rotation.y = -state.heading;
  group.rotation.x = state.pitch;
  group.rotation.z = -state.bank;
  propeller.rotation.z -= dt * (4 + state.throttle * 42);
  // Gauges: airspeed, altitude, fuel — needles sweep with the real values.
  const speedT = Math.max(0, Math.min(1, state.speed / 90));
  const altT = Math.max(0, Math.min(1, (state.pos.y - 20) / 120));
  const fuelT = Math.max(0, state.fuel / 100);
  const needles = [speedT, altT, fuelT];
  for (let i = 0; i < 3; i += 1) {
    gauges[i].rotation.z = (0.5 - needles[i]) * Math.PI * 1.2;
  }
}
