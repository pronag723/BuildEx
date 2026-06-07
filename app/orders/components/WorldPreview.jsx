"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — 3D world preview viewer (Stage 7)
//
// Renders the colored-voxel artifact the builder generated at delivery time, so
// the buyer can rotate/zoom the build BEFORE confirming & releasing escrow —
// without ever downloading the raw world (that stays locked in the deliverables
// bucket until completion). Both three.js and the artifact are loaded lazily so
// the main bundle and the static export build stay lean.
//
// The signed URL comes from getPreviewUrl (storage RLS allows both parties at
// any status); we fetch the gzipped artifact, decode it (lib/preview/encode),
// and build a single InstancedMesh of unit cubes — one instance per surface
// voxel, coloured from the artifact palette.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { getPreviewUrl } from "../../../lib/orders/api";

export default function WorldPreview({ orderId, onClose }) {
  const mountRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error | empty
  const [message, setMessage] = useState(null);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        // 1. Resolve + fetch the artifact.
        const { url, meta: m, error } = await getPreviewUrl(orderId);
        if (disposed) return;
        if (error) throw error;
        if (!url) {
          setStatus("empty");
          return;
        }
        setMeta(m);

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch preview (${res.status})`);
        const gz = new Uint8Array(await res.arrayBuffer());
        if (disposed) return;

        // 2. Decode (lazy — pulls fflate + the artifact codec only when viewed).
        const [{ gunzipSync }, { decodePreview }] = await Promise.all([
          import("fflate"),
          import("../../../lib/preview/encode"),
        ]);
        const model = decodePreview(gz, gunzipSync);
        if (disposed) return;
        if (!model.voxelCount) {
          setStatus("empty");
          return;
        }

        // 3. Lazy-load three.js + OrbitControls and build the scene.
        const THREE = await import("three");
        const { OrbitControls } = await import(
          "three/examples/jsm/controls/OrbitControls.js"
        );
        if (disposed || !mountRef.current) return;

        cleanup = renderModel(THREE, OrbitControls, mountRef.current, model);
        setStatus("ready");
      } catch (e) {
        if (disposed) return;
        setMessage(e?.message || "Could not load the preview.");
        setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [orderId]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="glass rounded-3xl p-4 sm:p-5 max-w-3xl w-full">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-bold text-base">3D preview</h2>
            <p className="text-[11px] text-gray-500">
              Automatic render — drag to rotate, scroll to zoom. Not a substitute
              for the delivered file.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-semibold border border-white/10 text-gray-300 hover:bg-white/5 transition-all"
          >
            Close
          </button>
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/40">
          <div ref={mountRef} className="w-full h-[60vh] min-h-[320px]" />
          {status !== "ready" && (
            <div className="absolute inset-0 flex items-center justify-center text-center px-6">
              {status === "loading" && (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
                  <p className="text-xs text-gray-400">Building the 3D scene…</p>
                </div>
              )}
              {status === "empty" && (
                <p className="text-sm text-gray-400">
                  No 3D preview is available for this delivery.
                </p>
              )}
              {status === "error" && (
                <p className="text-sm text-red-400">{message}</p>
              )}
            </div>
          )}
        </div>

        {status === "ready" && meta?.voxelCount && (
          <p className="text-[11px] text-gray-500 mt-2">
            {meta.voxelCount.toLocaleString()} surface blocks ·{" "}
            {meta.bounds?.size?.join(" × ")} region
          </p>
        )}
      </div>
    </div>
  );
}

// Build the three.js scene into `mount` and start the render loop. Returns a
// disposer that tears everything down (raf, GPU resources, listeners, canvas).
function renderModel(THREE, OrbitControls, mount, model) {
  const { positions, colorIdx, palette, bounds } = model;
  const [sx, sy, sz] = bounds.size;

  const width = mount.clientWidth || 640;
  const height = mount.clientHeight || 360;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);

  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 5000);
  const maxDim = Math.max(sx, sy, sz, 1);
  const dist = maxDim * 1.8 + 8;
  camera.position.set(dist, dist * 0.8, dist);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  mount.appendChild(renderer.domElement);

  // Lighting balance: heavy ambient + light directional. Voxel renders don't
  // need dramatic shading — they need the palette colour to come through
  // recognisably. The previous balance (0.65 / 0.85 / 0.3) crushed light stone
  // and quartz builds into a uniform grey because the lit-face contribution was
  // ~1.5× the ambient, so colours far from white got desaturated by shadows on
  // every face that wasn't facing the key light.
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const dir = new THREE.DirectionalLight(0xffffff, 0.45);
  dir.position.set(1, 1.4, 0.8);
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.25);
  dir2.position.set(-0.6, 0.4, -1);
  scene.add(dir2);

  // One instanced unit cube per surface voxel. Centre the model on the origin so
  // OrbitControls revolves around the middle of the build.
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial();
  const count = model.voxelCount;
  const mesh = new THREE.InstancedMesh(geo, mat, count);

  // Palette is authored in sRGB (blockColors.js). three.js (r152+) renders in a
  // linear working space and converts linear→sRGB on output, so raw sRGB values
  // passed to THREE.Color get treated as linear and come out washed-out/wrong.
  // setRGB with SRGBColorSpace converts each colour into the working space first.
  const colors = palette.map((c) =>
    new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace)
  );
  const dummy = new THREE.Object3D();
  const cx = sx / 2;
  const cy = sy / 2;
  const cz = sz / 2;
  for (let i = 0; i < count; i++) {
    dummy.position.set(
      positions[i * 3] - cx,
      positions[i * 3 + 1] - cy,
      positions[i * 3 + 2] - cz
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, colors[colorIdx[i]] || colors[0]);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.update();

  let raf = 0;
  let running = true;
  const animate = () => {
    if (!running) return;
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  const onResize = () => {
    const w = mount.clientWidth || width;
    const h = mount.clientHeight || height;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(mount);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    geo.dispose();
    mat.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) {
      mount.removeChild(renderer.domElement);
    }
  };
}
