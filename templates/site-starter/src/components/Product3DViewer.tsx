import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PublicProduct3D } from '@corsteno/client';

type AvailableModel = Extract<PublicProduct3D, { available: true }>;

export function Product3DViewer({ model, onError }: { model: AvailableModel; onError: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let frame = 0;
    let disposed = false;
    setState('loading');
    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#ece8df');
      const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor('#ece8df', 1);
      renderer.domElement.setAttribute('aria-label', 'Vista 3D del producto');
      mount.replaceChildren(renderer.domElement);
      scene.add(new THREE.HemisphereLight('#fffaf1', '#58605b', 2));
      const key = new THREE.DirectionalLight('#ffffff', 2.4);
      key.position.set(4, 6, 6);
      scene.add(key);
      const root = new THREE.Group();
      const transform = model.transform;
      root.scale.setScalar(transform.scale);
      root.position.set(transform.position.x, transform.position.y, transform.position.z);
      root.rotation.set(THREE.MathUtils.degToRad(transform.rotationDegrees.x), THREE.MathUtils.degToRad(transform.rotationDegrees.y), THREE.MathUtils.degToRad(transform.rotationDegrees.z));
      scene.add(root);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.minDistance = 0.05;
      controls.maxDistance = 1000;
      const resize = () => {
        if (!renderer) return;
        const width = Math.max(1, mount.clientWidth);
        const height = Math.max(1, mount.clientHeight);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(mount);
      resize();
      new GLTFLoader().load(model.modelUrl, (gltf) => {
        if (disposed) return;
        root.add(gltf.scene);
        const bounds = new THREE.Box3().setFromObject(root);
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
      }, undefined, () => {
        if (!disposed) { setState('error'); onError(); }
      });
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
        observer.disconnect();
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
      onError();
      mount.replaceChildren();
    }
  }, [model, onError]);
  return <div className="product-3d"><div ref={mountRef} className="product-3d-canvas" aria-hidden={state !== 'ready'} />{state === 'loading' && <p className="media-status" role="status">Cargando vista 3D…</p>}{state === 'error' && <p className="media-status">Mostrando imágenes del producto.</p>}<span className="media-caption">Vista 3D · arrastrá para orbitar</span></div>;
}
