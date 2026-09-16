import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SurfaceMaterialConfig } from '@corsteno/types';
import { resolveSurfaceMaterial, type ResolvedSurfaceMaterial } from './materials/surfaceMaterialResolver';
import type { SurfaceAssignments } from './state/assignments';
import type { RoomSurfaceId } from './utils/surfaces';
import { ROOM_DIMENSIONS, ROOM_SURFACES } from './utils/surfaces';

type Props = {
  assignments: SurfaceAssignments;
  surfaceConfigs: ReadonlyMap<string, SurfaceMaterialConfig>;
  selectedSurfaceId: RoomSurfaceId;
  resetViewToken: number;
  onSurfaceSelect: (surfaceId: RoomSurfaceId) => void;
  onError: () => void;
  onMaterialWarning: (message: string) => void;
};

const INITIAL_CAMERA_POSITION = new THREE.Vector3(0.1, 2.45, 7.1);
const INITIAL_CAMERA_TARGET = new THREE.Vector3(0, 1.08, 0);

function neutralSurfaceColor(surfaceId: RoomSurfaceId) {
  return surfaceId === 'floor' ? '#bdb9b1' : '#d7d1c6';
}

export function SurfaceVisualizerCanvas({ assignments, surfaceConfigs, selectedSurfaceId, resetViewToken, onSurfaceSelect, onError, onMaterialWarning }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneStateRef = useRef<{
    meshes: Map<RoomSurfaceId, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>>;
    signatures: Map<RoomSurfaceId, string>;
    materials: Map<RoomSurfaceId, ResolvedSurfaceMaterial>;
    textureLoader: THREE.TextureLoader;
    anisotropy: number;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let observer: ResizeObserver | null = null;
    let resizeHandler: (() => void) | null = null;
    let usesWindowResize = false;
    let active = true;
    let frameId = 0;
    const meshes = new Map<RoomSurfaceId, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>>();
    const materials = new Map<RoomSurfaceId, ResolvedSurfaceMaterial>();
    const listenerCleanup: Array<() => void> = [];
    const cleanup = () => {
      if (!active) return;
      active = false;
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      if (usesWindowResize && resizeHandler) window.removeEventListener('resize', resizeHandler);
      for (const removeListener of listenerCleanup) removeListener();
      controls?.dispose();
      for (const mesh of meshes.values()) {
        mesh.geometry.dispose();
        if (!materials.has(mesh.userData.surfaceId as RoomSurfaceId)) mesh.material.dispose();
      }
      for (const resolved of materials.values()) resolved.dispose();
      meshes.clear();
      materials.clear();
      sceneStateRef.current = null;
      renderer?.dispose();
      renderer?.domElement.remove();
    };
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' });
      const rendererInstance = renderer;
      rendererInstance.outputColorSpace = THREE.SRGBColorSpace;
      rendererInstance.toneMapping = THREE.ACESFilmicToneMapping;
      rendererInstance.toneMappingExposure = 1;
      rendererInstance.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(rendererInstance.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#e9e4dc');
      scene.add(new THREE.HemisphereLight('#fff8ec', '#77746e', 1.55));
      const keyLight = new THREE.DirectionalLight('#fff4df', 2.05);
      keyLight.position.set(-3.5, 6, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight('#e7efff', 0.48);
      fillLight.position.set(4, 3.5, 1.5);
      scene.add(fillLight);

      const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 40);
      camera.position.copy(INITIAL_CAMERA_POSITION);
      camera.lookAt(INITIAL_CAMERA_TARGET);
      controls = new OrbitControls(camera, rendererInstance.domElement);
      const controlsInstance = controls;
      controlsInstance.target.copy(INITIAL_CAMERA_TARGET);
      controlsInstance.enableDamping = true;
      controlsInstance.dampingFactor = 0.075;
      controlsInstance.enablePan = false;
      controlsInstance.minDistance = 5.4;
      controlsInstance.maxDistance = 9.4;
      controlsInstance.minPolarAngle = 1.12;
      controlsInstance.maxPolarAngle = 1.48;
      controlsInstance.minAzimuthAngle = -0.78;
      controlsInstance.maxAzimuthAngle = 0.78;
      controlsInstance.update();

      // Each mesh owns its geometry and its current material. Any maps loaded for
      // that material are surface-local, so their repeat/rotation can never leak
      // to another surface. Replaced materials and their maps are disposed below.
      for (const surface of ROOM_SURFACES) {
        const planeHeight = surface.kind === 'floor' ? surface.depthM ?? ROOM_DIMENSIONS.depthM : surface.heightM ?? ROOM_DIMENSIONS.heightM;
        const geometry = new THREE.PlaneGeometry(surface.widthM, planeHeight, 1, 1);
        geometry.setAttribute('uv2', geometry.getAttribute('uv').clone());
        const material = new THREE.MeshStandardMaterial({ color: neutralSurfaceColor(surface.id), roughness: 0.84, metalness: 0 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...surface.position);
        mesh.rotation.set(...surface.rotation);
        mesh.userData.surfaceId = surface.id;
        mesh.receiveShadow = false;
        mesh.castShadow = false;
        scene.add(mesh);
        meshes.set(surface.id, mesh);
      }
      sceneStateRef.current = {
        meshes,
        signatures: new Map(),
        materials,
        textureLoader: new THREE.TextureLoader(),
        anisotropy: Math.min(rendererInstance.capabilities.getMaxAnisotropy(), 4),
        camera,
        controls: controlsInstance,
      };

      const resize = () => {
        if (!active) return;
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        rendererInstance.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        rendererInstance.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resizeHandler = resize;
      resize();
      observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
      observer?.observe(container);
      if (!observer) { window.addEventListener('resize', resize); usesWindowResize = true; }

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let down: { x: number; y: number; pointerId: number } | null = null;
      const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }; };
      const pointerUp = (event: PointerEvent) => {
        if (!down || down.pointerId !== event.pointerId) return;
        const distance = Math.hypot(event.clientX - down.x, event.clientY - down.y);
        down = null;
        if (distance > 6) return;
        const bounds = rendererInstance.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects([...meshes.values()], false)[0]?.object;
        const surfaceId = hit?.userData.surfaceId as RoomSurfaceId | undefined;
        if (surfaceId) onSurfaceSelect(surfaceId);
      };
      const pointerCancel = () => { down = null; };
      const contextLost = (event: Event) => { event.preventDefault(); if (active) onError(); };
      rendererInstance.domElement.addEventListener('pointerdown', pointerDown);
      rendererInstance.domElement.addEventListener('pointerup', pointerUp);
      rendererInstance.domElement.addEventListener('pointercancel', pointerCancel);
      rendererInstance.domElement.addEventListener('webglcontextlost', contextLost);
      listenerCleanup.push(
        () => rendererInstance.domElement.removeEventListener('pointerdown', pointerDown),
        () => rendererInstance.domElement.removeEventListener('pointerup', pointerUp),
        () => rendererInstance.domElement.removeEventListener('pointercancel', pointerCancel),
        () => rendererInstance.domElement.removeEventListener('webglcontextlost', contextLost),
      );

      const render = () => {
        if (!active) return;
        controlsInstance.update();
        rendererInstance.render(scene, camera);
        frameId = window.requestAnimationFrame(render);
      };
      render();

      return cleanup;
    } catch {
      cleanup();
      onError();
      return undefined;
    }
  }, [onError, onSurfaceSelect]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    for (const surface of ROOM_SURFACES) {
      const productId = assignments[surface.id] ?? null;
      const signature = productId ?? 'neutral';
      const mesh = state.meshes.get(surface.id);
      if (!mesh) continue;
      if (state.signatures.get(surface.id) !== signature) {
        const height = surface.kind === 'floor' ? surface.depthM ?? ROOM_DIMENSIONS.depthM : surface.heightM ?? ROOM_DIMENSIONS.heightM;
        const previous = state.materials.get(surface.id);
        if (previous) previous.dispose();
        else mesh.material.dispose();
        const next = resolveSurfaceMaterial(productId ? surfaceConfigs.get(productId) ?? null : null, surface.widthM, height, neutralSurfaceColor(surface.id), {
          textureLoader: state.textureLoader,
          baseUrl: window.location.origin,
          anisotropy: state.anisotropy,
        });
        mesh.material = next.material;
        state.materials.set(surface.id, next);
        state.signatures.set(surface.id, signature);
        void next.ready.then(({ failures }) => {
          if (!failures.length) return;
          const labels = failures.map((failure) => failure === 'baseColor' ? 'color base' : failure === 'normal' ? 'normal' : 'roughness');
          onMaterialWarning(`Material degradado: no se pudo cargar ${labels.join(', ')}. ${failures.includes('baseColor') ? 'Se mantiene el fallback sólido.' : 'El color base continúa activo.'}`);
        });
      }
      mesh.material.emissive.set(surface.id === selectedSurfaceId ? '#574d39' : '#000000');
      mesh.material.emissiveIntensity = surface.id === selectedSurfaceId ? 0.12 : 0;
    }
  }, [assignments, surfaceConfigs, selectedSurfaceId, onMaterialWarning]);

  useEffect(() => {
    if (resetViewToken === 0) return;
    const state = sceneStateRef.current;
    if (!state) return;
    state.camera.position.copy(INITIAL_CAMERA_POSITION);
    state.controls.target.copy(INITIAL_CAMERA_TARGET);
    state.controls.update();
  }, [resetViewToken]);

  return <div className="surface-visualizer-canvas" ref={containerRef} role="img" aria-label="Ambiente 3D interactivo. Seleccioná las superficies también con los controles accesibles." />;
}
