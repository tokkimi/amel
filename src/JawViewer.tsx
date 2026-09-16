import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Maximize2, Minus, Plus, RotateCcw, Play, Pause } from "lucide-react";
import "./jaw-viewer.css";

type Chart = Record<string, { status: string; note: string }>;
type Props = { selected: string; chart: Chart; onSelect: (id: string) => void };

// A closed, volumetric crown, with distinct incisor, canine and cusped posterior surfaces.
function crownGeometry(index: number) {
  const posterior = index >= 3;
  const canine = index === 2;
  const width =
    index < 2
      ? index === 0
        ? 0.55
        : 0.45
      : canine
        ? 0.49
        : index < 5
          ? 0.55
          : 0.7;
  const depth = posterior ? (index < 5 ? 0.63 : 0.74) : 0.37;
  const height = canine ? 0.98 : index < 2 ? 0.85 : 0.67;
  const sides = 48,
    rings = 26;
  const vertices: number[] = [],
    indices: number[] = [];
  // Profile goes from the closed cervical base, around the crown, to the occlusal centre.
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    let radius: number, y: number;
    if (t < 0.18) {
      radius = Math.sin(((t / 0.18) * Math.PI) / 2) * 0.77;
      y = (t / 0.18) * 0.12;
    } else if (t < 0.66) {
      const u = (t - 0.18) / 0.48;
      radius = 0.77 + 0.23 * Math.sin(u * Math.PI * 0.78);
      y = 0.12 + u * (height - 0.18);
    } else {
      const u = (t - 0.66) / 0.34;
      radius = Math.cos((u * Math.PI) / 2) * 0.917;
      y = height - 0.06 + Math.sin(u * Math.PI) * 0.035;
    }
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const power = posterior ? 0.67 : 0.8;
      const x =
        (Math.sign(Math.cos(a)) *
          Math.pow(Math.abs(Math.cos(a)), power) *
          radius *
          width) /
        2;
      const z =
        (Math.sign(Math.sin(a)) *
          Math.pow(Math.abs(Math.sin(a)), power) *
          radius *
          depth) /
        2;
      let yy = y;
      if (t >= 0.66) {
        if (posterior) {
          const bump = (cx: number, cz: number) =>
            Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / 0.014);
          yy +=
            0.13 *
            (bump(width * 0.25, depth * 0.24) +
              bump(-width * 0.25, depth * 0.24) +
              bump(width * 0.25, -depth * 0.24) +
              bump(-width * 0.25, -depth * 0.24));
          yy -= 0.05 * Math.exp((-x * x) / 0.003) * Math.exp((-z * z) / 0.075);
        } else if (canine) yy += 0.16 * Math.exp(-(x * x + z * z) / 0.022);
        else yy += 0.05 * (1 - Math.min(1, Math.abs(x) / (width / 2)));
      }
      vertices.push(x, yy, z);
      if (j < rings && k < sides) {
        const n = j * (sides + 1) + k;
        indices.push(
          n,
          n + sides + 1,
          n + 1,
          n + 1,
          n + sides + 1,
          n + sides + 2,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function archGeometry() {
  const points = Array.from({ length: 65 }, (_, i) => {
    const a = -1.67 + (i / 64) * 3.34;
    return new THREE.Vector3(
      2.42 * Math.sin(a),
      -0.25,
      3.15 * Math.cos(a) - 0.65,
    );
  });
  const geometry = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    100,
    0.45,
    18,
    false,
  );
  // Vertically deepen the gingiva to provide a solid jaw ridge.
  geometry.scale(1, 1.45, 1);
  return geometry;
}

export default function JawViewer({ selected, chart, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLElement>(null);
  const current = useRef({ selected, chart, onSelect });
  current.current = { selected, chart, onSelect };
  const settings = useRef({
    opening: 32,
    playing: false,
    roots: false,
    arch: "both",
  });
  const [opening, setOpening] = useState(32),
    [playing, setPlaying] = useState(false),
    [roots, setRoots] = useState(false),
    [arch, setArch] = useState("both"),
    [error, setError] = useState("");
  const actions = useRef<
    | {
        reset: () => void;
        zoom: (v: number) => void;
        view: (v: string) => void;
      }
    | undefined
  >(undefined);
  settings.current = { opening, playing, roots, arch };
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setError(
        "La vue 3D nécessite WebGL. Le schéma dentaire reste disponible ci-dessous.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.domElement.setAttribute(
      "aria-label",
      "Mâchoire dentaire en trois dimensions. Glissez pour tourner, pincez pour zoomer et touchez une dent pour la sélectionner.",
    );
    renderer.domElement.setAttribute("role", "img");
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe6efff, 0x392d36, 2.3));
    const light = new THREE.DirectionalLight(0xffeee0, 4);
    light.position.set(3, 6, 7);
    scene.add(light);
    const rim = new THREE.DirectionalLight(0xb2d4ff, 3);
    rim.position.set(-5, 2, -3);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 1.4);
    fill.position.set(0, -5, 6);
    scene.add(fill);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(7, 5, 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0.5);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.minDistance = 5;
    controls.maxDistance = 24;
    controls.enablePan = false;
    const upper = new THREE.Group(),
      hinge = new THREE.Group(),
      lower = new THREE.Group();
    upper.position.y = 1.25;
    upper.scale.y = -1;
    hinge.position.set(0, -0.55, -2);
    lower.position.z = 2;
    hinge.add(lower);
    scene.add(upper, hinge);
    const enamel = new THREE.MeshPhysicalMaterial({
      color: 0xfff2d9,
      roughness: 0.27,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.22,
      side: THREE.DoubleSide,
    });
    const gum = new THREE.MeshPhysicalMaterial({
      color: 0xb8646c,
      roughness: 0.46,
      clearcoat: 0.25,
      side: THREE.DoubleSide,
    });
    const rootMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8cdaa,
      roughness: 0.6,
    });
    const crowns: THREE.Mesh[] = [];
    const rootGroups: THREE.Group[] = [];
    const gums: THREE.Mesh[] = [];
    [upper, lower].forEach((jaw, row) => {
      const gingiva = new THREE.Mesh(archGeometry(), gum.clone());
      jaw.add(gingiva);
      gums.push(gingiva);
      for (const side of [-1, 1])
        for (let index = 0; index < 8; index++) {
          const a = side * (0.095 + index * 0.213);
          const tooth = new THREE.Group();
          tooth.position.set(2.42 * Math.sin(a), 0, 3.15 * Math.cos(a) - 0.65);
          tooth.rotation.y = a;
          const id = String(
            (row === 0 ? (side === -1 ? 10 : 20) : side === -1 ? 40 : 30) +
              index +
              1,
          );
          const crown = new THREE.Mesh(crownGeometry(index), enamel.clone());
          crown.userData.toothId = id;
          tooth.add(crown);
          crowns.push(crown);
          const rootGroup = new THREE.Group();
          const number = index >= 5 ? (row === 0 ? 3 : 2) : index >= 3 ? 2 : 1;
          for (let r = 0; r < number; r++) {
            const root = new THREE.Mesh(
              new THREE.ConeGeometry(
                index >= 5 ? 0.12 : 0.16,
                index < 3 ? 1.25 : 0.96,
                14,
              ),
              rootMaterial,
            );
            root.rotation.z = Math.PI + (r - (number - 1) / 2) * 0.22;
            root.position.set(
              (r - (number - 1) / 2) * 0.24,
              -0.49,
              number === 3 && r === 2 ? -0.14 : 0.03,
            );
            root.userData.toothId = id;
            rootGroup.add(root);
          }
          tooth.add(rootGroup);
          rootGroups.push(rootGroup);
          jaw.add(tooth);
        }
    });
    const raycaster = new THREE.Raycaster();
    let start = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hits = raycaster.intersectObjects(
        crowns.filter((m) => m.parent?.parent?.visible && m.visible),
      );
      if (hits[0]) current.current.onSelect(hits[0].object.userData.toothId);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    actions.current = {
      reset: () => {
        camera.position.set(7, 5, 12);
        controls.target.set(0, 0, 0.5);
        controls.update();
      },
      zoom: (factor) => {
        camera.position
          .sub(controls.target)
          .multiplyScalar(factor)
          .add(controls.target);
        controls.update();
      },
      view: (v) => {
        camera.position.set(
          ...((v === "front"
            ? [0, 1, 15]
            : v === "top"
              ? [0, 15, 0.5]
              : [15, 2, 0]) as [number, number, number]),
        );
        controls.update();
      },
    };
    let raf = 0,
      disposed = false;
    const draw = (time: number) => {
      if (disposed) return;
      const s = settings.current;
      const amount = s.playing
        ? (Math.sin(time * 0.0014) + 1) * 0.5
        : s.opening / 100;
      hinge.rotation.x = amount * 0.62;
      upper.visible = s.arch !== "lower";
      hinge.visible = s.arch !== "upper";
      rootGroups.forEach((g) => (g.visible = s.roots));
      gums.forEach((g) => {
        const m = g.material as THREE.MeshPhysicalMaterial;
        m.transparent = s.roots;
        m.opacity = s.roots ? 0.19 : 1;
        m.depthWrite = !s.roots;
      });
      crowns.forEach((m) => {
        const id = m.userData.toothId,
          status = current.current.chart[id]?.status;
        const material = m.material as THREE.MeshPhysicalMaterial;
        material.color.set(
          status === "Couronne"
            ? 0xd9b865
            : status === "Implant"
              ? 0xc2cbd1
              : 0xfff2d9,
        );
        material.emissive.set(
          id === current.current.selected ? 0x426e7b : 0x000000,
        );
        material.emissiveIntensity = 0.38;
        material.transparent = status === "Manquante";
        material.opacity = status === "Manquante" ? 0.12 : 1;
      });
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      actions.current = undefined;
    };
  }, []);
  return (
    <section className="jaw-viewer" ref={frame}>
      <header>
        <div>
          <span className="jaw-eyebrow">EXPLORATION DENTAIRE</span>
          <h3>Mâchoire 3D</h3>
        </div>
        <span className="jaw-selected">Dent {selected}</span>
      </header>
      <div className="jaw-canvas" ref={host}>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="jaw-views">
        {[
          ["front", "Face"],
          ["side", "Profil"],
          ["top", "Dessus"],
        ].map(([v, l]) => (
          <button
            type="button"
            key={v}
            onClick={() => actions.current?.view(v)}
          >
            {l}
          </button>
        ))}
        <button
          type="button"
          aria-label="Réinitialiser la vue"
          onClick={() => actions.current?.reset()}
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          aria-label="Agrandir la mâchoire"
          onClick={() => actions.current?.zoom(0.8)}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          aria-label="Réduire la mâchoire"
          onClick={() => actions.current?.zoom(1.2)}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          aria-label="Plein écran"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else
              frame.current
                ?.requestFullscreen?.()
                .catch(() =>
                  setError(
                    "Le plein écran n’est pas disponible sur cet appareil.",
                  ),
                );
          }}
        >
          <Maximize2 size={15} />
        </button>
      </div>
      <div className="jaw-controls">
        <label>
          Ouverture de la mâchoire <span>{opening}%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={opening}
            onChange={(e) => {
              setPlaying(false);
              setOpening(Number(e.target.value));
            }}
          />
        </label>
        <button
          type="button"
          className="jaw-motion"
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}{" "}
          {playing ? "Pause" : "Animer"}
        </button>
      </div>
      <div className="jaw-options">
        <select
          aria-label="Arcade visible"
          value={arch}
          onChange={(e) => setArch(e.target.value)}
        >
          <option value="both">Les deux arcades</option>
          <option value="upper">Arcade supérieure</option>
          <option value="lower">Arcade inférieure</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={roots}
            onChange={(e) => setRoots(e.target.checked)}
          />{" "}
          Voir les racines
        </label>
      </div>
      <p className="jaw-hint">
        Glissez pour tourner · Pincez pour zoomer · Touchez une dent
      </p>
      <small className="jaw-model-note">
        Modèle illustratif standard · Sans reconstruction du patient
      </small>
    </section>
  );
}
