"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — rendering a decoded BXV1 preview with three.js
//
// mountViewer() puts an interactive scene into a DOM node (drag to rotate,
// wheel or pinch to zoom) and returns controls for the viewer's toolbar.
// renderThumbnail() draws the same scene once, off-screen, into a small webp:
// that picture is what the chat card shows, so nobody downloads three.js or
// the voxels until they choose "Open in 3D".
//
// three is imported dynamically by the callers; these functions receive the
// modules so this file stays free of a static three import.
// ─────────────────────────────────────────────────────────────────────────────

function buildMesh(THREE, model) {
  const { positions, colorIdx, palette, bounds } = model;
  const [sx, sy, sz] = bounds.size;
  const cx = (sx - 1) / 2;
  const cz = (sz - 1) / 2;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, model.voxelCount);
  const colors = palette.map((c) => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace));
  const dummy = new THREE.Object3D();
  for (let i = 0; i < model.voxelCount; i++) {
    dummy.position.set(positions[i * 3] - cx, positions[i * 3 + 1], positions[i * 3 + 2] - cz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, colors[colorIdx[i]] || colors[0]);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh, size: [sx, sy, sz] };
}

function addLights(THREE, scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(1, 1.4, 0.8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(-0.6, 0.4, -1);
  scene.add(fill);
}

// Camera distance that fits the whole build in view.
function fitDistance(THREE, size, aspect, fov) {
  const radius = Math.max(Math.hypot(size[0], size[1], size[2]) / 2, 1);
  const vfov = THREE.MathUtils.degToRad(fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  return (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.1;
}

function isoPosition(dist, size) {
  return [dist * 0.72, size[1] / 2 + dist * 0.58, dist * 0.72];
}

/**
 * An interactive viewer in `mount`. Returns
 * { setSlice(level), setView("iso" | "top"), reset(), setGrid(on), zoom(factor), dispose() }.
 * `background` is a CSS colour; `onFrame` is unused but reserved for tests.
 */
export function mountViewer(THREE, OrbitControls, mount, model, { background = "#151515" } = {}) {
  const width = mount.clientWidth || 640;
  const height = mount.clientHeight || 400;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  addLights(THREE, scene);

  const { mesh, size } = buildMesh(THREE, model);
  scene.add(mesh);

  const fov = 50;
  const dist = fitDistance(THREE, size, width / height, fov);
  const camera = new THREE.PerspectiveCamera(fov, width / height, Math.max(0.1, dist / 1000), dist * 20);
  const target = new THREE.Vector3(0, size[1] / 2, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  mount.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Grid at the build's base, one cell per block (coarser for big builds).
  const gridSize = Math.max(size[0], size[2]) + 8;
  const step = gridSize > 256 ? 16 : gridSize > 64 ? 4 : 1;
  const grid = new THREE.GridHelper(Math.ceil(gridSize / step) * step, Math.ceil(gridSize / step), 0x666666, 0x333333);
  grid.position.y = -0.5;
  grid.visible = false;
  scene.add(grid);

  // Height slice: blocks above the cut are hidden by a clipping plane, so
  // you can look inside a floor at a time.
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), size[1]);
  renderer.localClippingEnabled = true;
  mesh.material.clippingPlanes = [plane];

  function reset() {
    const [x, y, z] = isoPosition(dist, size);
    camera.position.set(x, y, z);
    controls.target.copy(target);
    controls.update();
  }
  reset();

  let raf = 0;
  let running = true;
  const tick = () => {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  const ro = new ResizeObserver(() => {
    const w = mount.clientWidth || width;
    const h = mount.clientHeight || height;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(mount);

  return {
    height: size[1],
    setSlice(level) {
      // `level` is how many layers from the bottom stay visible.
      plane.constant = Math.max(0, Math.min(size[1], level)) - 0.5 + 0.001;
    },
    setView(view) {
      if (view === "top") {
        camera.position.set(0.0001, target.y + dist * 1.05, 0);
        controls.target.copy(target);
        controls.update();
      } else {
        reset();
      }
    },
    reset,
    setGrid(on) {
      grid.visible = Boolean(on);
    },
    zoom(factor) {
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
      grid.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** One frame of the build, iso view, as a webp Blob (falls back to png). */
export async function renderThumbnail(THREE, model, { width = 640, height = 400, background = "#1c1c1c" } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  addLights(THREE, scene);
  const { mesh, size } = buildMesh(THREE, model);
  scene.add(mesh);
  const fov = 45;
  // The bounding sphere leaves a lot of air around a squat build; a picture
  // can sit closer than the interactive view does.
  const dist = fitDistance(THREE, size, width / height, fov) * 0.8;
  const camera = new THREE.PerspectiveCamera(fov, width / height, Math.max(0.1, dist / 1000), dist * 20);
  const [x, y, z] = isoPosition(dist, size);
  camera.position.set(x, y, z);
  camera.lookAt(0, size[1] / 2, 0);

  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.render(scene, camera);
  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/webp", 0.85);
  });
  const out = blob && blob.type === "image/webp" ? blob : await new Promise((r) => canvas.toBlob(r, "image/png"));
  mesh.geometry.dispose();
  mesh.material.dispose();
  renderer.dispose();
  renderer.forceContextLoss?.();
  return out;
}
