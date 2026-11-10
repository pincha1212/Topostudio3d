import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GridPoint, MarkerPin, MeasurementPath, ProfilePoint, TopoState } from '../types/topo';
import { SCENE_SCALE, fetchMapTextureCanvas } from '../services/demService';

interface TopoCanvas3DProps {
  state: TopoState;
  elevations: Float32Array | null;
  gridPoints: GridPoint[];
  pins: MarkerPin[];
  measurementPath: MeasurementPath | null;
  onUpdateElevations: (newElevations: Float32Array) => void;
  onAddPin: (pin: MarkerPin) => void;
  onUpdateMeasurement: (path: MeasurementPath | null) => void;
  onHoverPoint?: (info: { lat: number; lon: number; elev: number; slope: number } | null) => void;
}

export const TopoCanvas3D: React.FC<TopoCanvas3DProps> = ({
  state,
  elevations,
  gridPoints,
  pins,
  measurementPath,
  onUpdateElevations,
  onAddPin,
  onUpdateMeasurement,
  onHoverPoint,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const wireframeMeshRef = useRef<THREE.Mesh | null>(null);
  const baseSkirtRef = useRef<THREE.Mesh | null>(null);
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const baseRingRef = useRef<THREE.Mesh | null>(null);
  const pinsGroupRef = useRef<THREE.Group | null>(null);
  const measureGroupRef = useRef<THREE.Group | null>(null);
  const brushCursorRef = useRef<THREE.Mesh | null>(null);

  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  const isSculptingRef = useRef<boolean>(false);
  const measurePointsRef = useRef<ProfilePoint[]>([]);

  // 1. Initial Setup Three.js Scene
  useEffect(() => {
    if (!mountRef.current) return;

    // GPU / Software WebGL probe
    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.fog = new THREE.FogExp2(0x0b1120, 0.0012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 3000);
    camera.position.set(0, 150, 200);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;

    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.minDistance = 20;
    controls.maxDistance = 800;
    controlsRef.current = controls;

    // PMREM Environment map
    try {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    } catch (e) {
      console.warn('PMREM environment init note:', e);
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 0.85);
    dirLight.position.set(120, 220, 100);
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const fillLight = new THREE.DirectionalLight(0xf59e0b, 0.25);
    fillLight.position.set(-120, 80, -100);
    scene.add(fillLight);

    // Base Grid
    const gridHelper = new THREE.GridHelper(360, 36, 0x334155, 0x0f172a);
    gridHelper.position.y = -3;
    scene.add(gridHelper);

    // Base Ring (Cartographic Gold)
    const ringGeo = new THREE.RingGeometry(SCENE_SCALE - 0.7, SCENE_SCALE + 0.7, 128);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const baseRing = new THREE.Mesh(ringGeo, ringMat);
    baseRing.position.y = -0.5;
    scene.add(baseRing);
    baseRingRef.current = baseRing;

    // Pins group
    const pinsGroup = new THREE.Group();
    scene.add(pinsGroup);
    pinsGroupRef.current = pinsGroup;

    // Measurement group
    const measureGroup = new THREE.Group();
    scene.add(measureGroup);
    measureGroupRef.current = measureGroup;

    // Brush cursor mesh
    const brushGeo = new THREE.RingGeometry(1, 1.3, 32);
    brushGeo.rotateX(-Math.PI / 2);
    const brushMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const brushCursor = new THREE.Mesh(brushGeo, brushMat);
    brushCursor.visible = false;
    scene.add(brushCursor);
    brushCursorRef.current = brushCursor;

    // Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !renderer || !camera) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement && mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update Sun Directional Light
  useEffect(() => {
    if (!dirLightRef.current) return;
    const radElev = (state.sunElevation * Math.PI) / 180;
    const radAz = (state.sunAzimuth * Math.PI) / 180;
    const dist = 350;
    const y = dist * Math.sin(radElev);
    const rProj = dist * Math.cos(radElev);
    const x = rProj * Math.sin(radAz);
    const z = rProj * Math.cos(radAz);
    dirLightRef.current.position.set(x, Math.max(10, y), z);
  }, [state.sunElevation, state.sunAzimuth]);

  // Load Map Texture when Palette Changes
  useEffect(() => {
    if (state.palette === 'opentopomap' || state.palette === 'satellite' || state.palette === 'osm') {
      const key = `${state.lat}_${state.lon}_${state.radiusKm}_${state.palette}`;
      if (textureCacheRef.current.has(key)) {
        rebuildTerrainMesh(textureCacheRef.current.get(key) || null);
      } else {
        fetchMapTextureCanvas(state.lat, state.lon, state.radiusKm, state.palette).then(canvas => {
          if (canvas) {
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            textureCacheRef.current.set(key, texture);
            rebuildTerrainMesh(texture);
          } else {
            rebuildTerrainMesh(null);
          }
        });
      }
    } else {
      rebuildTerrainMesh(null);
    }
  }, [
    state.lat,
    state.lon,
    state.radiusKm,
    state.gridSize,
    state.exaggeration,
    state.palette,
    state.circularClip,
    state.showWireframe,
    state.showContours,
    state.contourInterval,
    elevations,
  ]);

  // Update Water Mesh
  useEffect(() => {
    if (!sceneRef.current || !elevations) return;
    const scene = sceneRef.current;

    if (waterMeshRef.current) {
      scene.remove(waterMeshRef.current);
      waterMeshRef.current.geometry.dispose();
      (waterMeshRef.current.material as THREE.Material).dispose();
      waterMeshRef.current = null;
    }

    if (!state.showWater) return;

    const radiusMeters = state.radiusKm * 1000;
    const metersPerUnit = radiusMeters / SCENE_SCALE;
    const waterY = Math.max(0, state.waterLevel / metersPerUnit) * state.exaggeration;

    const waterGeo = state.circularClip
      ? new THREE.CircleGeometry(SCENE_SCALE, 128)
      : new THREE.PlaneGeometry(SCENE_SCALE * 2, SCENE_SCALE * 2, 64, 64);

    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });

    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = waterY;
    scene.add(waterMesh);
    waterMeshRef.current = waterMesh;
  }, [state.showWater, state.waterLevel, state.radiusKm, state.exaggeration, state.circularClip, elevations]);

  // Update Pins in 3D
  useEffect(() => {
    if (!pinsGroupRef.current || !elevations || !gridPoints.length) return;
    const group = pinsGroupRef.current;

    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
    }

    const radiusMeters = state.radiusKm * 1000;
    const metersPerUnit = radiusMeters / SCENE_SCALE;

    pins.forEach(pin => {
      const pinGroup = new THREE.Group();

      const poleGeo = new THREE.CylinderGeometry(0.4, 0.4, 18, 12);
      const poleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 9;

      const headGeo = new THREE.SphereGeometry(2.4, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({
        color: pin.color || 0xef4444,
        roughness: 0.3,
        emissive: 0x991b1b,
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 18;

      pinGroup.add(pole, head);

      const py = Math.max(0, (pin.elev - state.minElev) / metersPerUnit) * state.exaggeration;
      pinGroup.position.set(pin.x, py, pin.z);
      group.add(pinGroup);
    });
  }, [pins, elevations, gridPoints, state.minElev, state.radiusKm, state.exaggeration]);

  // Update Measurement Path 3D Visualizer
  useEffect(() => {
    if (!measureGroupRef.current) return;
    const group = measureGroupRef.current;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    if (!measurementPath || measurementPath.points.length < 2) return;

    const points = measurementPath.points;
    const radiusMeters = state.radiusKm * 1000;
    const metersPerUnit = radiusMeters / SCENE_SCALE;

    const vecPoints: THREE.Vector3[] = [];
    points.forEach(pt => {
      const y = Math.max(0, (pt.elev - state.minElev) / metersPerUnit) * state.exaggeration + 1.2;
      const v = new THREE.Vector3(pt.x, y, pt.z);
      vecPoints.push(v);

      // Sphere node marker
      const nodeGeo = new THREE.SphereGeometry(1.4, 12, 12);
      const nodeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
      nodeMesh.position.copy(v);
      group.add(nodeMesh);
    });

    const curve = new THREE.CatmullRomCurve3(vecPoints);
    const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.6, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    group.add(tubeMesh);
  }, [measurementPath, state.minElev, state.radiusKm, state.exaggeration]);

  // Color mapper helper
  const getHypsometricColor = (t: number, palette: string, slope: number): THREE.Color => {
    const c = new THREE.Color();
    if (palette === 'slope_heatmap') {
      // Slope angle palette (0deg green -> 45deg+ red)
      const slopeNorm = Math.min(1, slope / 45);
      c.setHSL(0.33 - slopeNorm * 0.33, 0.9, 0.45);
    } else if (palette === 'cyber') {
      c.setHSL(0.55 - t * 0.45, 0.85, 0.25 + t * 0.45);
    } else if (palette === 'monochrome') {
      const l = 0.25 + t * 0.65;
      c.setRGB(l, l, l * 1.03);
    } else {
      // Hypsometric natural
      if (t < 0.2) c.setRGB(0.15 + t * 0.8, 0.48 + t * 0.5, 0.22);
      else if (t < 0.48) c.setRGB(0.42 + (t - 0.2) * 1.1, 0.62 - (t - 0.2) * 0.4, 0.22);
      else if (t < 0.78) c.setRGB(0.58 - (t - 0.48) * 0.4, 0.42 - (t - 0.48) * 0.3, 0.28);
      else c.setRGB(0.85 + (t - 0.78) * 0.7, 0.85 + (t - 0.78) * 0.7, 0.88 + (t - 0.78) * 0.5);
    }
    return c;
  };

  // Build Terrain Mesh
  const rebuildTerrainMesh = (topoTexture: THREE.Texture | null) => {
    if (!sceneRef.current || !elevations || elevations.length === 0 || !gridPoints.length) return;
    const scene = sceneRef.current;

    if (terrainMeshRef.current) {
      scene.remove(terrainMeshRef.current);
      terrainMeshRef.current.geometry.dispose();
      (terrainMeshRef.current.material as THREE.Material).dispose();
      terrainMeshRef.current = null;
    }
    if (wireframeMeshRef.current) {
      scene.remove(wireframeMeshRef.current);
      wireframeMeshRef.current.geometry.dispose();
      (wireframeMeshRef.current.material as THREE.Material).dispose();
      wireframeMeshRef.current = null;
    }
    if (baseSkirtRef.current) {
      scene.remove(baseSkirtRef.current);
      baseSkirtRef.current.geometry.dispose();
      (baseSkirtRef.current.material as THREE.Material).dispose();
      baseSkirtRef.current = null;
    }

    const size = state.gridSize;
    const total = size * size;
    const positions = new Float32Array(total * 3);
    const uvs = new Float32Array(total * 2);
    const colors = new Float32Array(total * 3);

    const radiusMeters = state.radiusKm * 1000;
    const metersPerUnit = radiusMeters / SCENE_SCALE;
    const elevSpan = Math.max(1, state.maxElev - state.minElev);

    // Compute slopes for vertex colors
    const slopes = new Float32Array(total);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        const eCurrent = elevations[i];
        const eEast = c < size - 1 ? elevations[i + 1] : eCurrent;
        const eSouth = r < size - 1 ? elevations[i + size] : eCurrent;
        const distPerCell = (radiusMeters * 2 / (size - 1));
        const dzdx = (eEast - eCurrent) / distPerCell;
        const dzdy = (eSouth - eCurrent) / distPerCell;
        const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
        slopes[i] = (slopeRad * 180) / Math.PI;
      }
    }

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const idx = row * size + col;
        const pt = gridPoints[idx];
        const elev = elevations[idx];

        const x = pt.normX * SCENE_SCALE;
        const z = pt.normZ * SCENE_SCALE;
        const y = Math.max(0, (elev - state.minElev) / metersPerUnit) * state.exaggeration;

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;

        uvs[idx * 2] = col / (size - 1);
        uvs[idx * 2 + 1] = 1 - row / (size - 1);

        const t = Math.min(1, Math.max(0, (elev - state.minElev) / elevSpan));
        const c = getHypsometricColor(t, state.palette, slopes[idx]);
        colors[idx * 3] = c.r;
        colors[idx * 3 + 1] = c.g;
        colors[idx * 3 + 2] = c.b;
      }
    }

    const indices: number[] = [];
    for (let row = 0; row < size - 1; row++) {
      for (let col = 0; col < size - 1; col++) {
        const a = row * size + col;
        const b = a + 1;
        const c = (row + 1) * size + col;
        const d = c + 1;

        if (state.circularClip) {
          const insideCount =
            (gridPoints[a].insideRadius ? 1 : 0) +
            (gridPoints[b].insideRadius ? 1 : 0) +
            (gridPoints[c].insideRadius ? 1 : 0) +
            (gridPoints[d].insideRadius ? 1 : 0);
          if (insideCount < 3) continue;
        }

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    let material: THREE.Material;
    if ((state.palette === 'opentopomap' || state.palette === 'satellite' || state.palette === 'osm') && topoTexture) {
      material = new THREE.MeshStandardMaterial({
        map: topoTexture,
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.78,
        metalness: 0.08,
        side: THREE.DoubleSide,
      });
    }

    const terrainMesh = new THREE.Mesh(geometry, material);
    scene.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    // Wireframe Mesh overlay
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    const wireframeMesh = new THREE.Mesh(geometry, wireMat);
    wireframeMesh.position.y = 0.08;
    wireframeMesh.visible = state.showWireframe;
    scene.add(wireframeMesh);
    wireframeMeshRef.current = wireframeMesh;

    // Solid Skirt Base for 3D Printing look
    const skirtGeo = new THREE.CylinderGeometry(SCENE_SCALE, SCENE_SCALE, 4, 128, 1, true);
    skirtGeo.translate(0, -2, 0);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.visible = state.circularClip;
    scene.add(skirtMesh);
    baseSkirtRef.current = skirtMesh;
  };

  // Sculpting Raycast & Mouse Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!mountRef.current || !cameraRef.current || !terrainMeshRef.current || !elevations) return;
    const rect = mountRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    const intersects = raycaster.intersectObject(terrainMeshRef.current);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const point = hit.point;

      if (state.mode === 'sculpt') {
        isSculptingRef.current = true;
        applySculpt(point);
      } else if (state.mode === 'pin') {
        // Find nearest grid point elev
        const radiusMeters = state.radiusKm * 1000;
        const metersPerUnit = radiusMeters / SCENE_SCALE;
        const hitElev = Math.round(state.minElev + (point.y / state.exaggeration) * metersPerUnit);

        const latDegPerKm = 1 / 110.574;
        const lonDegPerKm = 1 / (111.320 * Math.cos(state.lat * Math.PI / 180));

        const normX = point.x / SCENE_SCALE;
        const normZ = point.z / SCENE_SCALE;
        const distNorthKm = -normZ * state.radiusKm;
        const distEastKm = normX * state.radiusKm;

        const pinLat = parseFloat((state.lat + distNorthKm * latDegPerKm).toFixed(5));
        const pinLon = parseFloat((state.lon + distEastKm * lonDegPerKm).toFixed(5));

        const newPin: MarkerPin = {
          id: 'pin_' + Date.now(),
          title: `Punto (${pinLat}, ${pinLon})`,
          lat: pinLat,
          lon: pinLon,
          elev: hitElev,
          color: '#38bdf8',
          x: point.x,
          z: point.z,
          notes: `Elevación observada: ${hitElev} m.`,
        };
        onAddPin(newPin);
      } else if (state.mode === 'measure') {
        const radiusMeters = state.radiusKm * 1000;
        const metersPerUnit = radiusMeters / SCENE_SCALE;
        const hitElev = Math.round(state.minElev + (point.y / state.exaggeration) * metersPerUnit);

        const latDegPerKm = 1 / 110.574;
        const lonDegPerKm = 1 / (111.320 * Math.cos(state.lat * Math.PI / 180));

        const normX = point.x / SCENE_SCALE;
        const normZ = point.z / SCENE_SCALE;
        const distNorthKm = -normZ * state.radiusKm;
        const distEastKm = normX * state.radiusKm;

        const pinLat = parseFloat((state.lat + distNorthKm * latDegPerKm).toFixed(5));
        const pinLon = parseFloat((state.lon + distEastKm * lonDegPerKm).toFixed(5));

        const newPts = [...measurePointsRef.current];

        let prevDist = 0;
        if (newPts.length > 0) {
          const last = newPts[newPts.length - 1];
          const dx = point.x - last.x;
          const dz = point.z - last.z;
          const dy = (hitElev - last.elev) / metersPerUnit;
          const segDistMeters = Math.sqrt(dx * dx + dz * dz + dy * dy) * metersPerUnit;
          prevDist = last.distMeters + segDistMeters;
        }

        const newPt: ProfilePoint = {
          x: point.x,
          z: point.z,
          lat: pinLat,
          lon: pinLon,
          elev: hitElev,
          distMeters: prevDist,
        };
        newPts.push(newPt);
        measurePointsRef.current = newPts;

        // Calculate path metrics
        let gain = 0, loss = 0;
        let minE = Infinity, maxE = -Infinity;

        for (let i = 0; i < newPts.length; i++) {
          const e = newPts[i].elev;
          if (e < minE) minE = e;
          if (e > maxE) maxE = e;
          if (i > 0) {
            const diff = e - newPts[i - 1].elev;
            if (diff > 0) gain += diff;
            else loss += Math.abs(diff);
          }
        }

        onUpdateMeasurement({
          points: newPts,
          totalDistanceMeters: prevDist,
          elevationGainMeters: gain,
          elevationLossMeters: loss,
          minElevMeters: minE === Infinity ? 0 : minE,
          maxElevMeters: maxE === -Infinity ? 0 : maxE,
        });
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!mountRef.current || !cameraRef.current || !terrainMeshRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    const intersects = raycaster.intersectObject(terrainMeshRef.current);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const point = hit.point;

      // Update brush cursor visual
      if (brushCursorRef.current) {
        brushCursorRef.current.position.set(point.x, point.y + 0.4, point.z);
        brushCursorRef.current.scale.set(state.sculptRadius, state.sculptRadius, 1);
        brushCursorRef.current.visible = state.mode === 'sculpt';
      }

      // Hover Inspector callback
      if (onHoverPoint && elevations) {
        const radiusMeters = state.radiusKm * 1000;
        const metersPerUnit = radiusMeters / SCENE_SCALE;
        const hitElev = Math.round(state.minElev + (point.y / state.exaggeration) * metersPerUnit);

        const latDegPerKm = 1 / 110.574;
        const lonDegPerKm = 1 / (111.320 * Math.cos(state.lat * Math.PI / 180));

        const normX = point.x / SCENE_SCALE;
        const normZ = point.z / SCENE_SCALE;
        const distNorthKm = -normZ * state.radiusKm;
        const distEastKm = normX * state.radiusKm;

        const pinLat = parseFloat((state.lat + distNorthKm * latDegPerKm).toFixed(5));
        const pinLon = parseFloat((state.lon + distEastKm * lonDegPerKm).toFixed(5));

        onHoverPoint({
          lat: pinLat,
          lon: pinLon,
          elev: hitElev,
          slope: Math.round(Math.min(60, (point.y / SCENE_SCALE) * 45)),
        });
      }

      if (isSculptingRef.current && state.mode === 'sculpt') {
        applySculpt(point);
      }
    } else if (onHoverPoint) {
      onHoverPoint(null);
      if (brushCursorRef.current) brushCursorRef.current.visible = false;
    }
  };

  const handlePointerUp = () => {
    isSculptingRef.current = false;
  };

  const applySculpt = (hitPoint: THREE.Vector3) => {
    if (!elevations || !gridPoints.length) return;

    const size = state.gridSize;
    const newElevs = new Float32Array(elevations);

    const radiusMeters = state.radiusKm * 1000;
    const metersPerUnit = radiusMeters / SCENE_SCALE;
    const sculptRadiusWorld = state.sculptRadius;

    let modified = false;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const pt = gridPoints[idx];

        const vx = pt.normX * SCENE_SCALE;
        const vz = pt.normZ * SCENE_SCALE;

        const dist = Math.sqrt((vx - hitPoint.x) * (vx - hitPoint.x) + (vz - hitPoint.z) * (vz - hitPoint.z));

        if (dist <= sculptRadiusWorld) {
          const falloff = 0.5 * (1 + Math.cos((Math.PI * dist) / sculptRadiusWorld));
          const elevDeltaMeters = state.sculptStrength * 25 * falloff;

          if (state.sculptTool === 'raise') {
            newElevs[idx] += elevDeltaMeters;
          } else if (state.sculptTool === 'lower') {
            newElevs[idx] -= elevDeltaMeters;
          } else if (state.sculptTool === 'smooth') {
            // Average with surrounding 4 neighbors
            let sum = newElevs[idx];
            let count = 1;
            if (c > 0) { sum += newElevs[idx - 1]; count++; }
            if (c < size - 1) { sum += newElevs[idx + 1]; count++; }
            if (r > 0) { sum += newElevs[idx - size]; count++; }
            if (r < size - 1) { sum += newElevs[idx + size]; count++; }
            const avg = sum / count;
            newElevs[idx] += (avg - newElevs[idx]) * 0.2 * falloff;
          } else if (state.sculptTool === 'flatten') {
            const target = state.targetFlattenElev || state.centerElev;
            newElevs[idx] += (target - newElevs[idx]) * 0.25 * falloff;
          } else if (state.sculptTool === 'noise') {
            newElevs[idx] += (Math.random() - 0.5) * elevDeltaMeters * 1.5;
          }
          modified = true;
        }
      }
    }

    if (modified) {
      onUpdateElevations(newElevs);
    }
  };

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
};
