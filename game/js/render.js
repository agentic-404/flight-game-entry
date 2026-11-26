// Ridge Runner — the renderer: one Three.js scene, a chase camera that
// trails the plane without fighting it, and a cockpit camera over the
// nose. The camera eases toward its target so a hard bank never whips it.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { forwardOf } from './flight.js';

export const CAMERA_CHASE = 'chase';
export const CAMERA_COCKPIT = 'cockpit';

/** Create the renderer, scene, lights and camera for a canvas. */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 1150);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(300, 420, 180);
  scene.add(sun);
  const sky = new THREE.HemisphereLight(0xbfd9ff, 0x5a6b46, 1.1);
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 4000);
  camera.position.set(0, 20, 30);

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  // Smoothed chase state: the camera trails, it never snaps.
  const chasePos = new THREE.Vector3(0, 20, 30);
  const chaseLook = new THREE.Vector3(0, 8, 0);

  /**
   * Move the camera for this frame. `mode` is CAMERA_CHASE or
   * CAMERA_COCKPIT; `dt` eases the chase camera toward its target.
   */
  function updateCamera(state, mode, dt) {
    const fwd = forwardOf(state.heading);
    if (mode === CAMERA_COCKPIT) {
      // Above the canopy, looking over the nose: the canopy top sits
      // at y+1.38, so a camera at y+1.35 sits inside the glass and the
      // canopy fills the frame (measured 26 Nov 2026 — the cockpit
      // shot was two thirds canopy and propeller). At y+2.0, pulled
      // back behind the canopy, the nose is a sliver at the bottom.
      camera.position.set(
        state.pos.x - fwd.x * 0.8,
        state.pos.y + 2.0,
        state.pos.z - fwd.z * 0.8,
      );
      camera.lookAt(
        state.pos.x + fwd.x * 80,
        state.pos.y + state.pitch * 40 - 2.0,
        state.pos.z + fwd.z * 80,
      );
      chasePos.copy(camera.position);
      chaseLook.set(state.pos.x + fwd.x * 80, state.pos.y, state.pos.z + fwd.z * 80);
      return;
    }
    const wantPos = new THREE.Vector3(
      state.pos.x - fwd.x * 13.5,
      state.pos.y + 4.4,
      state.pos.z - fwd.z * 13.5,
    );
    const wantLook = new THREE.Vector3(
      state.pos.x + fwd.x * 14,
      state.pos.y + 1.2,
      state.pos.z + fwd.z * 14,
    );
    const ease = 1 - Math.exp(-dt * 5.5);
    chasePos.lerp(wantPos, ease);
    chaseLook.lerp(wantLook, ease);
    camera.position.copy(chasePos);
    camera.lookAt(chaseLook);
  }

  function render(sceneRoot) {
    renderer.render(sceneRoot, camera);
  }

  return { renderer, scene, camera, resize, updateCamera, render };
}
