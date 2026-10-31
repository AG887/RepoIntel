import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { FileCode2, X, Sparkles, Layers, Link2, Copy, Check, ExternalLink, Maximize2, Minimize2, Search, WrapText } from 'lucide-react';
import { GraphNode, GraphEdge, LayoutMode, NodeType } from '../types';
import { TYPE_COLORS } from '../data/repositories';
import { applyLayoutPositions } from '../utils/graphLayouts';
import { extractLinkedLines } from '../utils/linkedLines';

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode) => void;
  onDeselectNode: () => void;
  onShowCode?: (node: GraphNode) => void;
  selectedTypes: Set<NodeType>;
  layoutMode: LayoutMode;
  autoRotate: boolean;
  showEdges: boolean;
  searchQuery?: string;
  resetTrigger?: number;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  selectedNode,
  onSelectNode,
  onDeselectNode,
  onShowCode,
  selectedTypes,
  layoutMode,
  autoRotate,
  showEdges,
  searchQuery = '',
  resetTrigger = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  const [canvasCodeOpen, setCanvasCodeOpen] = useState(false);
  const [canvasCodeMode, setCanvasCodeMode] = useState<'complete' | 'snippet'>('complete');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isExpandedTray, setIsExpandedTray] = useState(false);
  const [codeFilterQuery, setCodeFilterQuery] = useState('');
  const [wrapLines, setWrapLines] = useState(false);

  // Compute linked lines and all lines for the currently selected node
  const linkedLines = useMemo(() => {
    return selectedNode ? extractLinkedLines(selectedNode) : [];
  }, [selectedNode]);

  const allCodeLines = useMemo(() => {
    return selectedNode?.codePreview ? selectedNode.codePreview.split('\n') : [];
  }, [selectedNode]);

  const filteredLinesWithIndices = useMemo(() => {
    if (!codeFilterQuery.trim()) {
      return allCodeLines.map((line, index) => ({ line, index }));
    }
    const q = codeFilterQuery.toLowerCase();
    return allCodeLines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.toLowerCase().includes(q));
  }, [allCodeLines, codeFilterQuery]);

  useEffect(() => {
    setCanvasCodeOpen(false);
    setCanvasCodeMode('complete');
    setCopiedCode(false);
    setIsExpandedTray(false);
    setCodeFilterQuery('');
    setWrapLines(false);
  }, [selectedNode?.id]);

  // Keep references to WebGL objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const edgeLineSegmentsRef = useRef<THREE.LineSegments | null>(null);
  const targetCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 480));
  const targetCamLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const currentLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const nodePositionsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const targetNodePositionsRef = useRef<Map<string, THREE.Vector3>>(new Map());

  // Dynamic prop synchronization refs for requestAnimationFrame loop
  const autoRotateRef = useRef(autoRotate);
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  const showEdgesRef = useRef(showEdges);
  useEffect(() => {
    showEdgesRef.current = showEdges;
  }, [showEdges]);

  const selectedNodeRef = useRef(selectedNode);
  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  const selectedTypesRef = useRef(selectedTypes);
  useEffect(() => {
    selectedTypesRef.current = selectedTypes;
  }, [selectedTypes]);

  // Mouse interaction state
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const sphericalCoordsRef = useRef({ radius: 480, theta: 0, phi: Math.PI / 2 });
  const hoveredNodeIdRef = useRef<string | null>(null);

  // Compute node positions for current layout mode
  useEffect(() => {
    applyLayoutPositions(nodes, edges, layoutMode);
    nodes.forEach((node) => {
      const nx = Number.isFinite(node.x) ? (node.x as number) : 0;
      const ny = Number.isFinite(node.y) ? (node.y as number) : 0;
      const nz = Number.isFinite(node.z) ? (node.z as number) : 0;

      targetNodePositionsRef.current.set(node.id, new THREE.Vector3(nx, ny, nz));
      if (!nodePositionsRef.current.has(node.id)) {
        nodePositionsRef.current.set(node.id, new THREE.Vector3(nx, ny, nz));
      }
    });
  }, [nodes, edges, layoutMode]);

  // Reset camera position handler
  useEffect(() => {
    if (resetTrigger > 0) {
      sphericalCoordsRef.current = { radius: 480, theta: 0, phi: Math.PI / 2.2 };
      targetCamLookAtRef.current.set(0, 0, 0);
    }
  }, [resetTrigger]);

  // Focus camera when node is selected
  useEffect(() => {
    if (selectedNode) {
      const pos = targetNodePositionsRef.current.get(selectedNode.id);
      if (pos) {
        targetCamLookAtRef.current.copy(pos);
        // Position camera slightly offset from target
        const offset = new THREE.Vector3(0, 20, 140);
        targetCamPosRef.current.copy(pos).add(offset);
      }
    }
  }, [selectedNode]);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#09090b');
    scene.fog = new THREE.FogExp2('#09090b', 0.0012);
    sceneRef.current = scene;

    // 2. Camera setup
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
    camera.position.set(0, 0, 480);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.5);
    dirLight1.position.set(200, 300, 200);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa855f7, 1.2);
    dirLight2.position.set(-200, -200, -100);
    scene.add(dirLight2);

    // 5. Starfield Background (Distant celestial particles)
    const starCount = 1200;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const idx = i * 3;
      const radius = 600 + Math.random() * 1200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.max(-1, Math.min(1, Math.random() * 2 - 1)));

      const sx = radius * Math.sin(phi) * Math.cos(theta);
      const sy = radius * Math.sin(phi) * Math.sin(theta);
      const sz = radius * Math.cos(phi);

      starPositions[idx] = Number.isFinite(sx) ? sx : 0;
      starPositions[idx + 1] = Number.isFinite(sy) ? sy : 0;
      starPositions[idx + 2] = Number.isFinite(sz) ? sz : 0;

      // Subtle cool sci-fi palette
      const colorType = Math.random();
      if (colorType > 0.8) {
        starColors[idx] = 0.4; starColors[idx + 1] = 0.8; starColors[idx + 2] = 1.0;
      } else if (colorType > 0.6) {
        starColors[idx] = 0.7; starColors[idx + 1] = 0.4; starColors[idx + 2] = 1.0;
      } else {
        starColors[idx] = 0.5; starColors[idx + 1] = 0.5; starColors[idx + 2] = 0.6;
      }
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    starGeo.computeBoundingSphere();

    const starMaterial = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    const starField = new THREE.Points(starGeo, starMaterial);
    scene.add(starField);

    // 6. Node Group & Geometries
    const nodesGroup = new THREE.Group();
    scene.add(nodesGroup);

    // Sphere geometry for nodes
    const sphereGeo = new THREE.SphereGeometry(3.5, 16, 16);
    const glowSpriteGeo = new THREE.PlaneGeometry(16, 16);

    // Texture cache for glowing halos with LinearFilter to prevent WebGL mipmap warnings
    const glowTextureCache = new Map<string, THREE.CanvasTexture>();
    const getGlowTexture = (hexColor: string) => {
      if (glowTextureCache.has(hexColor)) {
        return glowTextureCache.get(hexColor)!;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, hexColor);
        gradient.addColorStop(0.3, hexColor);
        gradient.addColorStop(0.7, 'rgba(0,0,0,0.15)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      glowTextureCache.set(hexColor, tex);
      return tex;
    };

    const nodeMeshMap = new Map<string, THREE.Mesh>();

    nodes.forEach((node) => {
      const typeInfo = TYPE_COLORS[node.type] || TYPE_COLORS.component;
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(typeInfo.hex),
        emissive: new THREE.Color(typeInfo.hex),
        emissiveIntensity: 0.7,
        roughness: 0.2,
        metalness: 0.8,
      });

      const mesh = new THREE.Mesh(sphereGeo, material);
      mesh.userData = { nodeId: node.id, nodeData: node };

      // Add a subtle glow sprite halo using cached texture
      const glowMat = new THREE.MeshBasicMaterial({
        map: getGlowTexture(typeInfo.hex),
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glowSprite = new THREE.Mesh(glowSpriteGeo, glowMat);
      glowSprite.name = 'glowHalo';
      mesh.add(glowSprite);

      nodesGroup.add(mesh);
      nodeMeshMap.set(node.id, mesh);
    });
    nodeMeshesRef.current = nodeMeshMap;

    // 7. Edge Line Segments (Laser Filaments)
    const edgeGeo = new THREE.BufferGeometry();
    const edgePositions = new Float32Array(Math.max(1, edges.length) * 2 * 3);
    const edgeColors = new Float32Array(Math.max(1, edges.length) * 2 * 3);

    edges.forEach((edge, i) => {
      const idx = i * 6;
      // Default placeholder coords
      edgePositions[idx] = 0; edgePositions[idx + 1] = 0; edgePositions[idx + 2] = 0;
      edgePositions[idx + 3] = 0; edgePositions[idx + 4] = 0; edgePositions[idx + 5] = 0;

      // Color laser line
      const sourceNode = nodes.find(n => n.id === edge.source);
      const hex = sourceNode ? TYPE_COLORS[sourceNode.type]?.hex || '#38bdf8' : '#38bdf8';
      const c = new THREE.Color(hex);

      edgeColors[idx] = c.r; edgeColors[idx + 1] = c.g; edgeColors[idx + 2] = c.b;
      edgeColors[idx + 3] = c.r * 0.4; edgeColors[idx + 4] = c.g * 0.4; edgeColors[idx + 5] = c.b * 0.4;
    });

    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    edgeGeo.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));
    if (edges.length > 0) {
      edgeGeo.computeBoundingSphere();
    }

    const edgeMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMaterial);
    scene.add(edgeLines);
    edgeLineSegmentsRef.current = edgeLines;

    // 8. Raycaster for hover/click
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 4 };
    const mouse = new THREE.Vector2(-1000, -1000);

    // 9. Resize handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // 10. Animation render loop
    let animationFrameId: number;
    let lastTime = performance.now();
    const startTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      const elapsedTime = (now - startTime) / 1000;
      lastTime = now;

      // Rotate starfield slowly
      starField.rotation.y = elapsedTime * 0.015;
      starField.rotation.x = Math.sin(elapsedTime * 0.01) * 0.05;

      // Handle auto-rotation
      if (autoRotateRef.current && !isDraggingRef.current && !selectedNodeRef.current) {
        sphericalCoordsRef.current.theta += delta * 0.15;
      }

      // Update camera position smoothly based on spherical coordinates or selected focus target
      if (!selectedNodeRef.current) {
        const { radius, theta, phi } = sphericalCoordsRef.current;
        const camX = radius * Math.sin(phi) * Math.sin(theta);
        const camY = radius * Math.cos(phi);
        const camZ = radius * Math.sin(phi) * Math.cos(theta);

        targetCamPosRef.current.set(camX, camY, camZ);
      }

      // Smooth camera lerp
      camera.position.lerp(targetCamPosRef.current, 0.06);
      currentLookAtRef.current.lerp(targetCamLookAtRef.current, 0.06);
      camera.lookAt(currentLookAtRef.current);

      // Smoothly lerp node positions toward their target layout coordinates
      nodes.forEach((node) => {
        const currentPos = nodePositionsRef.current.get(node.id);
        const targetPos = targetNodePositionsRef.current.get(node.id);
        const mesh = nodeMeshMap.get(node.id);

        if (currentPos && targetPos && mesh) {
          // Safeguard against NaN in either vector before lerping
          const tx = Number.isFinite(targetPos.x) ? targetPos.x : 0;
          const ty = Number.isFinite(targetPos.y) ? targetPos.y : 0;
          const tz = Number.isFinite(targetPos.z) ? targetPos.z : 0;
          targetPos.set(tx, ty, tz);

          if (!Number.isFinite(currentPos.x) || !Number.isFinite(currentPos.y) || !Number.isFinite(currentPos.z)) {
            currentPos.set(tx, ty, tz);
          } else {
            currentPos.lerp(targetPos, 0.08);
          }

          mesh.position.copy(currentPos);

          // Make glow sprites always billboard towards camera
          const glow = mesh.getObjectByName('glowHalo');
          if (glow) {
            glow.quaternion.copy(camera.quaternion);
          }
        }
      });

      // Update edge lines
      if (edgeLineSegmentsRef.current && showEdgesRef.current) {
        const geo = edgeLineSegmentsRef.current.geometry;
        const posAttr = geo.attributes.position as THREE.BufferAttribute;
        if (posAttr && posAttr.array) {
          const array = posAttr.array as Float32Array;

          edges.forEach((edge, i) => {
            const sourceMesh = nodeMeshMap.get(edge.source);
            const targetMesh = nodeMeshMap.get(edge.target);
            const isVisible = sourceMesh?.visible && targetMesh?.visible;

            const sourcePos = nodePositionsRef.current.get(edge.source);
            const targetPos = nodePositionsRef.current.get(edge.target);
            const idx = i * 6;

            if (idx + 5 < array.length) {
              if (!isVisible) {
                array[idx] = 0;
                array[idx + 1] = 0;
                array[idx + 2] = 0;
                array[idx + 3] = 0;
                array[idx + 4] = 0;
                array[idx + 5] = 0;
                return;
              }

              const sx = sourcePos && Number.isFinite(sourcePos.x) ? sourcePos.x : 0;
              const sy = sourcePos && Number.isFinite(sourcePos.y) ? sourcePos.y : 0;
              const sz = sourcePos && Number.isFinite(sourcePos.z) ? sourcePos.z : 0;
              const tx = targetPos && Number.isFinite(targetPos.x) ? targetPos.x : 0;
              const ty = targetPos && Number.isFinite(targetPos.y) ? targetPos.y : 0;
              const tz = targetPos && Number.isFinite(targetPos.z) ? targetPos.z : 0;

              array[idx] = sx;
              array[idx + 1] = sy;
              array[idx + 2] = sz;
              array[idx + 3] = tx;
              array[idx + 4] = ty;
              array[idx + 5] = tz;
            }
          });

          // Extra safety sweep on the array before computeBoundingSphere
          for (let k = 0; k < array.length; k++) {
            if (!Number.isFinite(array[k])) {
              array[k] = 0;
            }
          }

          posAttr.needsUpdate = true;
          if (edges.length > 0) {
            geo.computeBoundingSphere();
          }
        }
        edgeLineSegmentsRef.current.visible = true;
      } else if (edgeLineSegmentsRef.current) {
        edgeLineSegmentsRef.current.visible = false;
      }

      // Update Raycasting on Hover (only check visible meshes)
      raycaster.setFromCamera(mouse, camera);
      const visibleMeshes = Array.from(nodeMeshMap.values()).filter((m) => m.visible);
      const intersects = raycaster.intersectObjects(visibleMeshes, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const nodeId = hit.object.userData.nodeId;
        const nodeData = hit.object.userData.nodeData as GraphNode;

        if (nodeId && nodeData) {
          if (hoveredNodeIdRef.current !== nodeId) {
            hoveredNodeIdRef.current = nodeId;
            setHoveredNode(nodeData);
          }

          // Project 3D coordinate to screen 2D position for sleek floating tooltip
          const worldPos = hit.object.position.clone();
          worldPos.project(camera);

          const screenX = ((worldPos.x + 1) * width) / 2;
          const screenY = ((-worldPos.y + 1) * height) / 2;

          setTooltipPos((prev) => {
            if (prev.visible && Math.abs(prev.x - screenX) < 1.5 && Math.abs(prev.y - screenY) < 1.5) {
              return prev;
            }
            return {
              x: screenX,
              y: screenY,
              visible: true,
            };
          });
        }
      } else {
        if (hoveredNodeIdRef.current !== null) {
          hoveredNodeIdRef.current = null;
          setHoveredNode(null);
          setTooltipPos((prev) => (prev.visible ? { x: 0, y: 0, visible: false } : prev));
        }
      }

      // Pulse selected node
      if (selectedNodeRef.current) {
        const selectedMesh = nodeMeshMap.get(selectedNodeRef.current.id);
        if (selectedMesh) {
          const scale = 1.0 + Math.sin(elapsedTime * 6) * 0.25;
          selectedMesh.scale.set(scale * 1.5, scale * 1.5, scale * 1.5);
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // 11. Mouse & Touch Interactions for Camera Orbiting
    const dom = renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDraggingRef.current) {
        const deltaX = e.clientX - previousMousePositionRef.current.x;
        const deltaY = e.clientY - previousMousePositionRef.current.y;

        sphericalCoordsRef.current.theta -= deltaX * 0.005;
        sphericalCoordsRef.current.phi = Math.max(
          0.1,
          Math.min(Math.PI - 0.1, sphericalCoordsRef.current.phi - deltaY * 0.005)
        );

        previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sphericalCoordsRef.current.radius = Math.max(
        80,
        Math.min(1200, sphericalCoordsRef.current.radius + e.deltaY * 0.5)
      );
    };

    const onClick = (e: MouseEvent) => {
      const rect = dom.getBoundingClientRect();
      const clickMouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(clickMouse, camera);
      const visibleMeshes = Array.from(nodeMeshMap.values()).filter((m) => m.visible);
      const intersects = raycaster.intersectObjects(visibleMeshes, false);

      if (intersects.length > 0) {
        const hitNode = intersects[0].object.userData.nodeData as GraphNode;
        if (hitNode) {
          onSelectNode(hitNode);
        }
      } else {
        // Clicking empty space deselects node
        onDeselectNode();
      }
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('click', onClick);

      // Clean up geometries and materials
      sphereGeo.dispose();
      glowSpriteGeo.dispose();
      starGeo.dispose();
      starMaterial.dispose();
      edgeGeo.dispose();
      edgeMaterial.dispose();

      nodeMeshMap.forEach((mesh) => {
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
        const glow = mesh.getObjectByName('glowHalo') as THREE.Mesh;
        if (glow && glow.material instanceof THREE.Material) {
          glow.material.dispose();
        }
      });

      glowTextureCache.forEach((tex) => {
        tex.dispose();
      });
      glowTextureCache.clear();

      scene.clear();

      if (container.contains(dom)) {
        container.removeChild(dom);
      }
      renderer.dispose();
    };
  }, [nodes, edges]);

  // Update node visibility based on type filters & search query
  useEffect(() => {
    nodeMeshesRef.current.forEach((mesh, nodeId) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const matchesType = selectedTypes.has(node.type);
      const matchesSearch = searchQuery === '' || 
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        node.path.toLowerCase().includes(searchQuery.toLowerCase());

      const isVisible = matchesType && matchesSearch;
      mesh.visible = isVisible;

      // Adjust opacity / scale for matches
      const isSelected = selectedNode?.id === nodeId;
      const isHovered = hoveredNode?.id === nodeId;

      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        if (isSelected) {
          mat.emissiveIntensity = 1.8;
          mesh.scale.set(2.0, 2.0, 2.0);
        } else if (isHovered) {
          mat.emissiveIntensity = 1.4;
          mesh.scale.set(1.6, 1.6, 1.6);
        } else {
          mat.emissiveIntensity = 0.7;
          mesh.scale.set(1.0, 1.0, 1.0);
        }
      }
    });
  }, [selectedTypes, searchQuery, selectedNode, hoveredNode, nodes]);

  return (
    <div className="w-screen h-screen absolute inset-0 z-0 overflow-hidden bg-[#09090b]">
      {/* 3D WebGL Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Floating Sleek Tooltip on Node Hover (Glassmorphic) */}
      {tooltipPos.visible && hoveredNode && !selectedNode && (
        <div
          id="node-hover-tooltip"
          className="fixed pointer-events-none z-30 transition-all duration-75"
          style={{
            left: `${tooltipPos.x + 16}px`,
            top: `${tooltipPos.y - 32}px`,
            transform: 'translateY(-50%)',
          }}
        >
          <div className="px-3.5 py-2.5 rounded-xl bg-black/60 backdrop-blur-xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.8)] flex flex-col gap-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-100 font-mono">
            {/* Header with Type Tag */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white truncate max-w-[160px]">
                {hoveredNode.name}
              </span>
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider"
                style={{
                  backgroundColor: `${TYPE_COLORS[hoveredNode.type]?.hex || '#38bdf8'}25`,
                  color: TYPE_COLORS[hoveredNode.type]?.hex || '#38bdf8',
                  border: `1px solid ${TYPE_COLORS[hoveredNode.type]?.hex || '#38bdf8'}40`,
                }}
              >
                {hoveredNode.type}
              </span>
            </div>

            {/* Path */}
            <span className="text-[10px] text-white/40 truncate max-w-[210px]">
              {hoveredNode.path}
            </span>

            {/* Metrics pills */}
            <div className="flex items-center gap-3 pt-1 border-t border-white/10 text-[10px] text-white/60">
              <span>{hoveredNode.metrics?.loc ?? 0} LOC</span>
              <span>•</span>
              <span>Complexity {hoveredNode.metrics?.complexity ?? 0}/10</span>
              <span>•</span>
              <span>{(hoveredNode.dependencies || []).length} deps</span>
            </div>

            <div className="text-[9px] text-blue-400/80 pt-0.5">
              Click node to inspect architecture & code →
            </div>
          </div>
        </div>
      )}

      {/* Floating Quick Action Pill for Selected Node */}
      {selectedNode && (
        <div
          id="selected-node-quick-action"
          className={`fixed bottom-20 left-6 z-20 flex flex-col gap-2 p-3 rounded-2xl bg-[#090a0f]/95 backdrop-blur-2xl border border-white/20 shadow-[0_20px_60px_rgba(0,0,0,0.95)] font-mono animate-in fade-in slide-in-from-left-4 duration-150 transition-all ${
            canvasCodeOpen
              ? isExpandedTray
                ? 'w-[900px] max-w-[96vw]'
                : 'w-[740px] max-w-[94vw]'
              : 'max-w-[94vw] sm:max-w-xl'
          }`}
        >
          {/* Top Bar Row with Node Info (Child 1) and Action Buttons (Child 2) */}
          <div className="flex items-center gap-2 pl-2 pr-1 min-w-0">
            <span 
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm animate-pulse"
              style={{ backgroundColor: TYPE_COLORS[selectedNode.type]?.hex || '#60a5fa' }} 
            />
            <div className="flex flex-col min-w-0 max-w-[180px] sm:max-w-[260px]">
              <span className="text-xs font-semibold text-white truncate">
                {selectedNode.name}
              </span>
              <span className="text-[10px] text-white/50 truncate flex items-center gap-1.5">
                <span className="text-blue-300 font-semibold">{allCodeLines.length} lines</span>
                <span>•</span>
                <span className="capitalize">{selectedNode.type}</span>
                <span>•</span>
                <span className="text-emerald-400 font-medium">100% Full Code</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-white/10 flex-wrap sm:flex-nowrap">
            {onShowCode && (
              <button
                id="btn-canvas-show-code"
                onClick={(e) => {
                  e.stopPropagation();
                  setCanvasCodeOpen((prev) => (canvasCodeMode === 'complete' ? !prev : true));
                  setCanvasCodeMode('complete');
                }}
                title="View complete source code inside this node"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer font-medium shadow-sm ${
                  canvasCodeOpen && canvasCodeMode === 'complete'
                    ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.6)]'
                    : 'bg-blue-500/25 hover:bg-blue-500/40 border-blue-500/40 text-blue-200 hover:text-white'
                }`}
              >
                <FileCode2 size={13} className="text-blue-400" />
                <span>View Full Code ({allCodeLines.length} lines)</span>
                <span className="px-1.5 py-0.2 rounded-full bg-blue-400/20 text-blue-200 text-[9px] font-semibold">
                  100%
                </span>
              </button>
            )}

            <button
              id="btn-canvas-show-snippet"
              onClick={(e) => {
                e.stopPropagation();
                setCanvasCodeOpen((prev) => (canvasCodeMode === 'snippet' ? !prev : true));
                setCanvasCodeMode('snippet');
              }}
              title="Show linked lines through which this node connects to the graph"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer font-medium ${
                canvasCodeOpen && canvasCodeMode === 'snippet'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.6)]'
                  : 'bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/35 text-purple-200 hover:text-white'
              }`}
            >
              <Link2 size={12} className="text-purple-400" />
              <span>Snippet ({linkedLines.length})</span>
            </button>

            {onShowCode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowCode(selectedNode);
                }}
                title="Open in dedicated full-screen IDE modal"
                className="flex items-center gap-1 text-[11px] text-blue-300 hover:text-white px-2 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 transition-colors cursor-pointer"
              >
                <ExternalLink size={12} />
                <span className="hidden sm:inline">IDE</span>
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeselectNode();
                setCanvasCodeOpen(false);
              }}
              title="Deselect node"
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>

          {/* Inline Code Tray for Selected Node */}
          {canvasCodeOpen && (
            <div className="w-full mt-1 pt-2 border-t border-white/10 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
              {/* Tray Header */}
              <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-xl border border-white/10 text-[11px]">
                  <button
                    onClick={() => setCanvasCodeMode('complete')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      canvasCodeMode === 'complete'
                        ? 'bg-blue-500/30 text-blue-200 border border-blue-500/50 font-semibold shadow-sm'
                        : 'text-white/50 hover:text-white/90'
                    }`}
                  >
                    <FileCode2 size={12} className="text-blue-400" />
                    <span>Complete Code ({allCodeLines.length} lines)</span>
                  </button>
                  <button
                    onClick={() => setCanvasCodeMode('snippet')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      canvasCodeMode === 'snippet'
                        ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50 font-semibold shadow-sm'
                        : 'text-white/50 hover:text-white/90'
                    }`}
                  >
                    <Link2 size={12} className="text-purple-400" />
                    <span>Linked Lines ({linkedLines.length})</span>
                  </button>
                </div>

                {/* Right side controls: filter search, expand toggle, copy, full IDE */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {canvasCodeMode === 'complete' && (
                    <div className="relative flex items-center">
                      <Search size={11} className="absolute left-2 text-white/40 pointer-events-none" />
                      <input
                        type="text"
                        value={codeFilterQuery}
                        onChange={(e) => setCodeFilterQuery(e.target.value)}
                        placeholder="Filter lines..."
                        className="pl-6 pr-2 py-0.5 w-24 sm:w-32 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white placeholder-white/40 focus:outline-none focus:border-blue-500/50 font-mono"
                      />
                      {codeFilterQuery && (
                        <button
                          onClick={() => setCodeFilterQuery('')}
                          className="absolute right-1 text-white/40 hover:text-white text-[10px] px-1"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => setWrapLines((prev) => !prev)}
                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                      wrapLines
                        ? 'bg-blue-500/30 text-blue-200 border-blue-500/50'
                        : 'text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border-white/10'
                    }`}
                    title={wrapLines ? 'Disable line wrapping' : 'Enable line wrapping'}
                  >
                    <WrapText size={11} />
                    <span className="hidden sm:inline">{wrapLines ? 'Wrap: On' : 'Wrap'}</span>
                  </button>

                  <button
                    onClick={() => setIsExpandedTray((prev) => !prev)}
                    className="flex items-center gap-1 text-[10px] text-white/70 hover:text-white px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                    title={isExpandedTray ? 'Collapse height' : 'Expand full height'}
                  >
                    {isExpandedTray ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                    <span className="hidden sm:inline">{isExpandedTray ? 'Standard' : 'Expand'}</span>
                  </button>

                  <button
                    onClick={async () => {
                      if (!selectedNode?.codePreview) return;
                      try {
                        await navigator.clipboard.writeText(selectedNode.codePreview);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      } catch {
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }
                    }}
                    className="flex items-center gap-1 text-[10px] text-white/70 hover:text-white px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                    title="Copy complete source code"
                  >
                    {copiedCode ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>

                  {onShowCode && (
                    <button
                      onClick={() => onShowCode(selectedNode)}
                      className="flex items-center gap-1 text-[10px] text-blue-300 hover:text-white px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 transition-colors cursor-pointer font-medium shadow-sm hover:shadow-[0_0_12px_rgba(59,130,246,0.4)]"
                      title="Open full-screen IDE code modal"
                    >
                      <ExternalLink size={10} />
                      <span>Full IDE</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Code Content Box (Child 2 of Tray) */}
              {canvasCodeMode === 'complete' ? (
                <div 
                  className={`rounded-xl bg-[#040508]/95 border border-white/15 p-2 overflow-y-auto overflow-x-auto custom-scrollbar transition-all ${
                    isExpandedTray ? 'h-[520px] max-h-[75vh]' : 'h-[360px] max-h-[55vh]'
                  }`}
                >
                  <div className={`flex flex-col font-mono text-[11.5px] leading-5 select-text ${wrapLines ? 'w-full' : 'min-w-max'}`}>
                    {filteredLinesWithIndices.map(({ line, index }) => {
                      const trimmed = line.trim();
                      const isImport = trimmed.startsWith('import') || trimmed.startsWith('export');
                      const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
                      const isFunc = line.includes('function') || line.includes('const ') || line.includes('=>') || line.includes('interface ') || line.includes('type ') || line.includes('class ');
                      const isReturn = line.includes('return ') || line.includes('return(') || line.includes('return <');

                      let cls = 'text-blue-100/90';
                      if (isComment) cls = 'text-emerald-400/85 italic';
                      else if (isImport) cls = 'text-purple-300 font-medium';
                      else if (isFunc) cls = 'text-blue-300 font-medium';
                      else if (isReturn) cls = 'text-amber-300 font-medium';

                      return (
                        <div
                          key={index}
                          className="flex items-baseline hover:bg-white/[0.06] rounded transition-colors group"
                        >
                          <span className="w-12 select-none pr-3 text-right text-white/30 border-r border-white/10 shrink-0 font-mono text-[10.5px] group-hover:text-white/60">
                            {index + 1}
                          </span>
                          <span className={`pl-3.5 pr-4 flex-1 font-mono ${wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} ${cls}`}>
                            {line || '\u00A0'}
                          </span>
                        </div>
                      );
                    })}
                    {filteredLinesWithIndices.length === 0 && (
                      <div className="text-center py-8 text-white/40 text-xs italic">
                        No lines match &quot;{codeFilterQuery}&quot;
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div 
                  className={`rounded-xl bg-[#040508]/95 border border-white/15 p-2.5 overflow-y-auto custom-scrollbar space-y-2 transition-all ${
                    isExpandedTray ? 'h-[520px] max-h-[75vh]' : 'h-[360px] max-h-[55vh]'
                  }`}
                >
                  {linkedLines.length > 0 ? (
                    linkedLines.map((item, i) => (
                      <div key={i} className="p-2 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] font-mono space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-white/40">
                          <span className="text-blue-300 font-semibold">Line {item.lineNum}</span>
                          <span className={`px-1.5 py-0.5 rounded uppercase text-[9px] font-semibold tracking-wider ${
                            item.type === 'import' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                            item.type === 'export' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                            'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            {item.tag}
                          </span>
                        </div>
                        <div className="text-blue-200 overflow-x-auto whitespace-pre font-mono">
                          {item.text.trim()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-xs text-white/40 italic">
                      No direct linkage lines detected for this module.
                    </div>
                  )}
                </div>
              )}

              {/* Tray Footer */}
              <div className="flex items-center justify-between text-[10px] text-white/50 px-1 pt-0.5">
                <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  Showing 100% Complete Source Code ({allCodeLines.length} lines)
                </span>
                <div className="flex items-center gap-2 text-white/40 text-[9.5px]">
                  <span>Complexity: {selectedNode.metrics?.complexity ?? 0}/10</span>
                  <span>•</span>
                  <span>{(((selectedNode.sizeBytes || 0)) / 1024).toFixed(1)} KB</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
