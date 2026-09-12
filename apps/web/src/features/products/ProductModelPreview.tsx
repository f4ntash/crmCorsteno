import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Product3DConfig } from '@corsteno/types';

type Props = { url: string | null; config: Product3DConfig; label?: string };

export function ProductModelPreview({ url, config, label = 'Vista previa técnica' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'empty' | 'loading' | 'ready' | 'error'>(url ? 'loading' : 'empty');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !url) { setState('empty'); return; }
    let renderer: THREE.WebGLRenderer | undefined;
    let frame = 0;
    let controls: OrbitControls | undefined;
    let modelRoot: THREE.Group | undefined;
    let disposed = false;
    setState('loading');
    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#121820');
      const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor('#121820', 1);
      renderer.domElement.setAttribute('aria-label', label);
      mount.replaceChildren(renderer.domElement);
      scene.add(new THREE.HemisphereLight('#f8f4e9', '#253244', 2.2));
      const key = new THREE.DirectionalLight('#ffffff', 2.4);
      key.position.set(4, 6, 6);
      scene.add(key);
      const fill = new THREE.DirectionalLight('#b9d3ff', 1.1);
      fill.position.set(-4, 2, -3);
      scene.add(fill);
      modelRoot = new THREE.Group();
      const transform = config.transform;
      modelRoot.scale.setScalar(transform.scale);
      modelRoot.position.set(transform.position.x, transform.position.y, transform.position.z);
      modelRoot.rotation.set(THREE.MathUtils.degToRad(transform.rotation.x), THREE.MathUtils.degToRad(transform.rotation.y), THREE.MathUtils.degToRad(transform.rotation.z));
      scene.add(modelRoot);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.minDistance = 0.05;
      controls.maxDistance = 1000;
      const resize = () => {
        if (!renderer || !mount) return;
        const width = Math.max(1, mount.clientWidth);
        const height = Math.max(1, mount.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);
      resize();
      new GLTFLoader().load(url, (gltf) => {
        if (disposed || !modelRoot || !renderer) return;
        modelRoot.add(gltf.scene);
        const bounds = new THREE.Box3().setFromObject(modelRoot);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z, 0.1) * 0.6;
        camera.position.set(center.x + radius * 2.4, center.y + radius * 1.25, center.z + radius * 2.4);
        camera.near = Math.max(radius / 100, 0.01);
        camera.far = Math.max(radius * 100, 100);
        camera.updateProjectionMatrix();
        controls?.target.copy(center);
        controls?.update();
        setState('ready');
      }, undefined, () => { if (!disposed) setState('error'); });
      const animate = () => {
        if (disposed || !renderer) return;
        frame = requestAnimationFrame(animate);
        controls?.update();
        renderer.render(scene, camera);
      };
      animate();
      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        controls?.dispose();
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
          materials.forEach((material) => material.dispose());
        });
        renderer?.dispose();
        mount.replaceChildren();
      };
    } catch {
      setState('error');
      mount.replaceChildren();
    }
  }, [config, label, url]);

  return <div className="product-model-preview" aria-label={label}>
    <div ref={mountRef} className="product-model-preview-canvas" aria-hidden={state !== 'ready'} />
    {state === 'empty' && <p className="product-model-preview-message">Seleccioná un modelo GLB para previsualizarlo.</p>}
    {state === 'loading' && <p className="product-model-preview-message" role="status">Cargando modelo…</p>}
    {state === 'error' && <p className="product-model-preview-message product-model-preview-error" role="alert">No se pudo cargar el modelo. Revisá el archivo GLB antes de publicar.</p>}
    {state === 'ready' && <small className="product-model-preview-ready">Vista previa verificada en este navegador · arrastrá para orbitar</small>}
  </div>;
}
