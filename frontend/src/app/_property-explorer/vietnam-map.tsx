"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls, Edges, Html, useCursor } from "@react-three/drei";
import { Box3, ExtrudeGeometry, Path, Shape, Vector2, Vector3, PCFShadowMap, type Group } from "three";
import type { Geography, GeoFeature, Province } from "./explorer-data";
import { countryBounds, featureBounds, fitScene, isSceneClick, project, DRAG_THRESHOLD, type Insets } from "./scene-math";

function polygons(feature: GeoFeature) {
  return feature.geometry.coordinates.map(rings => {
    const shape = new Shape(rings[0].map(p => new Vector2(...project(p))));
    shape.holes = rings.slice(1).map(ring => new Path(ring.map(p => new Vector2(...project(p)))));
    return shape;
  });
}
function Region({ feature, stat, selected, reduced, moved, onSelect }: {
  feature: GeoFeature; stat?: Province; selected: boolean; reduced: boolean; moved: { current: boolean }; onSelect: (code: string) => void;
}) {
  const [hover, setHover] = useState<[number, number, number] | null>(null);
  const group = useRef<Group>(null);
  useCursor(!!hover);
  const geometry = useMemo(() => new ExtrudeGeometry(polygons(feature), { depth: .14, bevelEnabled: false, steps: 1, curveSegments: 1 }), [feature]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    if (!group.current) return;
    const target = selected ? .18 : hover ? .07 : 0;
    group.current.position.z = reduced ? target : group.current.position.z + (target - group.current.position.z) * Math.min(delta * 12, 1);
  });
  const count = stat?.public_rooms;
  return <group ref={group}><mesh geometry={geometry} castShadow receiveShadow
    onPointerMove={e => { e.stopPropagation(); if (!e.buttons) setHover([e.point.x, e.point.y, e.point.z + .35]); else setHover(null); }}
    onPointerOut={() => setHover(null)}
    onClick={e => { e.stopPropagation(); if (isSceneClick(e.delta, moved.current)) { setHover(null); onSelect(feature.properties.code); } }}>
    <meshStandardMaterial color={selected ? "#FFB020" : hover ? "#FFD27A" : count === undefined ? "#e5e4de" : count > 5 ? "#0E5A4F" : count ? "#7FB3A8" : "#D9E9E5"} roughness={.78} />
    <Edges threshold={24} color={selected ? "#0A3F38" : hover ? "#0E5A4F" : "#b7beaf"} />
  </mesh>{hover && <Html position={hover} center style={{ pointerEvents: "none" }}><div className="explore-tooltip"><strong>{feature.properties.name}</strong><span>{stat ? `${stat.public_properties} khu trọ có tin · ${stat.public_rooms} phòng công khai` : "Chưa tải được thông tin khu vực"}</span><small>Chọn để xem phòng</small></div></Html>}</group>;
}
function Scene({ geo, stats, selected, onSelect, command, insets, reduced, moved }: MapProps & { moved: { current: boolean } }) {
  const controls = useRef<CameraControls>(null);
  const { size, camera } = useThree();
  const ready = useRef(false), lastCommand = useRef(command.id), lastSize = useRef("");
  const bounds = useMemo(() => countryBounds(geo, true), [geo]);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    camera.up.set(0, 0, 1); c.updateCameraUp();
    c.setBoundary(new Box3(new Vector3(bounds.minX - 1, bounds.minY - 1, -.1), new Vector3(bounds.maxX + 1, bounds.maxY + 1, .8)));
  }, [camera, bounds]);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const newCommand = lastCommand.current !== command.id;
    const resized = lastSize.current !== `${size.width}:${size.height}`;
    lastSize.current = `${size.width}:${size.height}`;
    // Selection, deselection and floating-panel changes only update the region/UI.
    // Preserve the user's camera unless they explicitly request a camera action or resize.
    if (ready.current && !newCommand && !resized) return;
    lastCommand.current = command.id;
    const animate = ready.current && newCommand && !reduced;
    ready.current = true;
    c.stop();
    if (newCommand && (command.kind === "in" || command.kind === "out")) {
      void c.zoomTo(Math.max(8, Math.min(180, camera.zoom * (command.kind === "in" ? 1.25 : .8))), animate);
      return;
    }
    const f = command.kind === "focus" && newCommand ? geo.features.find(f => f.properties.code === selected) : undefined;
    const fit = fitScene(f ? featureBounds(f) : countryBounds(geo, true), size.width, size.height, insets);
    void c.setLookAt(fit.targetX, fit.targetY - 24, 32, fit.targetX, fit.targetY, 0, animate);
    void c.zoomTo(fit.zoom, animate);
  }, [geo, selected, command, size.width, size.height, insets, reduced, camera]);
  return <><ambientLight intensity={1.5} /><directionalLight position={[-8, -1, 18]} intensity={2.7} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} shadow-normalBias={.03} />
    {geo.features.map(f => <Region key={f.properties.code} feature={f} stat={stats.find(s => s.code === f.properties.code)} selected={selected === f.properties.code} reduced={reduced} moved={moved} onSelect={onSelect} />)}
    <mesh position={[0, 0, -.12]} receiveShadow raycast={() => null}><planeGeometry args={[100, 100]} /><shadowMaterial transparent opacity={.15} /></mesh>
    <CameraControls ref={controls} enabled={false} minZoom={8} maxZoom={180} minPolarAngle={.36} maxPolarAngle={.85} minAzimuthAngle={-.4} maxAzimuthAngle={.4} smoothTime={reduced ? 0 : .22} draggingSmoothTime={reduced ? 0 : .12} dollySpeed={.7} makeDefault />
  </>;
}
function ContextWatch({ onFailure }: { onFailure: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.domElement.addEventListener("webglcontextlost", onFailure);
    return () => gl.domElement.removeEventListener("webglcontextlost", onFailure);
  }, [gl, onFailure]);
  return null;
}
class MapBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Public Sales map:", error.message); this.props.onFailure(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export type CameraCommand = { id: number; kind: "home" | "extent" | "focus" | "in" | "out" };
type MapProps = { geo: Geography; stats: Province[]; selected: string; onSelect: (code: string) => void; onClear: () => void;
  command: CameraCommand; insets: Insets; reduced: boolean; onFailure: () => void };
export default function VietnamMap(props: MapProps) {
  const start = useRef<{ x: number; y: number } | null>(null), moved = useRef(false);
  const fallback = <div className="explore-map-fallback"><strong>Bản đồ 3D tạm thời không khả dụng</strong><p>Dùng tìm kiếm hoặc Danh sách tỉnh để tiếp tục lọc và xem phòng.</p></div>;
  return <div className="explore-canvas" onPointerDownCapture={e => { start.current = { x: e.clientX, y: e.clientY }; moved.current = false; }}
    onPointerMoveCapture={e => { if (start.current && e.buttons && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > DRAG_THRESHOLD) moved.current = true; }}
    onPointerCancel={() => { moved.current = true; start.current = null; }}>
    <MapBoundary fallback={fallback} onFailure={props.onFailure}><Canvas role="img" aria-label="Bản đồ Việt Nam 3D. Dùng tìm kiếm hoặc danh sách tỉnh để điều khiển bằng bàn phím."
      orthographic shadows={{ type: PCFShadowMap }} camera={{ position: [0, -24, 32], up: [0, 0, 1], zoom: 35, near: .1, far: 150 }} dpr={[1, 1.5]} fallback={fallback}
      onPointerMissed={e => { if (e.type === "click" && !moved.current) props.onClear(); }} gl={{ antialias: true }}><ContextWatch onFailure={props.onFailure} /><Scene {...props} moved={moved} /></Canvas></MapBoundary>
  </div>;
}
