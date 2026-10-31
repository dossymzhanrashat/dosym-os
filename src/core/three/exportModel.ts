import * as THREE from 'three';

/*
 * "View in AR" (WEB EDITION): the current static 3D state is exported in the browser as GLB
 * (GLTFExporter, for model-viewer / Android Scene Viewer) and USDZ (USDZExporter, for AR Quick
 * Look on the iPhone). Animation is not part of AR v1. Lines, points, instanced meshes and the
 * ground are left out (the exporters and Quick Look handle plain meshes best); the scene is scaled to life
 * size in metres.
 */

function arCopy(root: THREE.Object3D, metres: number): THREE.Group {
  const out = new THREE.Group();
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = metres / Math.max(size.x, size.y, size.z, 1e-6);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || !o.visible || o.name === 'ground') return;
    let visible = true;
    o.traverseAncestors((a) => (visible &&= a.visible));
    if (!visible) return;
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    const m = src.clone() as THREE.MeshStandardMaterial;
    m.clippingPlanes = [];
    const copy = new THREE.Mesh(o.geometry, m);
    copy.applyMatrix4(o.matrixWorld);
    copy.name = o.userData.tag ? `part-${o.userData.tag}` : o.name;
    out.add(copy);
  });
  out.position.set(-(box.min.x + size.x / 2) * scale, -box.min.y * scale, -(box.min.z + size.z / 2) * scale);
  out.scale.setScalar(scale);
  const wrap = new THREE.Group();
  wrap.add(out);
  return wrap;
}

export interface ArFiles {
  glb: string; // object URLs
  usdz: string;
  revoke(): void;
}

/** Exports `root` (made `metres` tall/wide) as GLB + USDZ blob URLs. */
export async function exportForAr(root: THREE.Object3D, metres: number): Promise<ArFiles> {
  const [{ GLTFExporter }, { USDZExporter }] = await Promise.all([import('three/examples/jsm/exporters/GLTFExporter.js'), import('three/examples/jsm/exporters/USDZExporter.js')]);
  const scene = new THREE.Scene();
  scene.add(arCopy(root, metres));
  scene.updateMatrixWorld(true);
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
  const usdz = await new USDZExporter().parseAsync(scene);
  const glbUrl = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
  const usdzUrl = URL.createObjectURL(new Blob([usdz as BlobPart], { type: 'model/vnd.usdz+zip' }));
  return {
    glb: glbUrl,
    usdz: usdzUrl,
    revoke() {
      URL.revokeObjectURL(glbUrl);
      URL.revokeObjectURL(usdzUrl);
    },
  };
}
