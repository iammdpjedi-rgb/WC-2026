// components/Background3D.js  (v2 — "two rivals" stadium scene)
// Generic, non-identifiable players inspired by a classic red/navy-vs-white rivalry.
// Striped pitch, glowing goal, comet ball-trail, twinkling crowd, duotone rim light.
// Sits behind all content, never captures taps, edge-masked, reduced-motion safe.
//
// SETUP (one-time):
//   1. package.json "dependencies": add  "three": "^0.160.0"
//   2. Save this as components/Background3D.js
//   3. In components/Layout.js:
//        import Background3D from "./Background3D";
//        return (
//          <div className="relative min-h-screen">
//            <Background3D />
//            <main className="relative z-10">{children}</main>
//            {/* footer */}
//          </div>
//        );
//   4. Commit to main -> Vercel rebuilds -> hard-refresh.
//
// Tune OPACITY (subtlety) and the two KIT colours below.

import { useEffect, useRef } from "react";

const OPACITY = 0.8;

export default function Background3D() {
  const canvasRef = useRef(null);

  useEffect(() => {
    let raf, renderer, onResize, mounted = true;

    (async () => {
      const THREE = await import("three");
      if (!mounted || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x0b0d16, 16, 46);
      const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 120);
      camera.position.set(0, 3.4, 14);
      camera.lookAt(0, 2.3, -3);

      scene.add(new THREE.HemisphereLight(0x8aa0ff, 0x0b0d16, 0.55));
      const flood = new THREE.DirectionalLight(0xffc36b, 1.2); flood.position.set(7, 11, 6); scene.add(flood);
      const teal = new THREE.PointLight(0x4fd1c5, 0.9, 40); teal.position.set(-8, 5, 3); scene.add(teal);
      const warm = new THREE.PointLight(0xff7a3c, 0.7, 40); warm.position.set(9, 4, 2); scene.add(warm);

      // mown pitch
      const field = new THREE.Group(); scene.add(field);
      for (let i = 0; i < 14; i++) {
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(70, 3.2),
          new THREE.MeshStandardMaterial({ color: i % 2 ? 0x4f6e31 : 0x5c7e39, roughness: 1 }));
        strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0, 8 - i * 3.2); field.add(strip);
      }
      {
        const g = new THREE.BufferGeometry(), p = [];
        for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; p.push(Math.cos(a) * 3, 0.02, Math.sin(a) * 3 - 3); }
        g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
        field.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xbfe0b0, transparent: true, opacity: 0.35 })));
      }

      // glowing goal
      const goal = new THREE.Group(); goal.position.set(0, 0, -13); scene.add(goal);
      const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x99ccff, emissiveIntensity: 0.5, roughness: 0.4 });
      [-3.2, 3.2].forEach((x) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 12), postMat); m.position.set(x, 1.7, 0); goal.add(m); });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6.4, 12), postMat); bar.rotation.z = Math.PI / 2; bar.position.set(0, 3.4, 0); goal.add(bar);
      {
        const g = new THREE.BufferGeometry(), p = [];
        for (let x = -3.2; x <= 3.2; x += 0.5) p.push(x, 0, 0, x, 3.4, 0);
        for (let y = 0; y <= 3.4; y += 0.5) p.push(-3.2, y, 0, 3.2, y, 0);
        g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
        goal.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fb0d8, transparent: true, opacity: 0.22 })));
      }
      const goalGlow = new THREE.PointLight(0x9ec9ff, 0.0, 18); goalGlow.position.set(0, 1.7, -12.5); scene.add(goalGlow);

      // crowd band
      {
        const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
        const cols = [[0.62, 0.27, 0.16], [0.85, 0.5, 0.2], [0.5, 0.18, 0.2], [0.7, 0.6, 0.4]];
        for (let i = 0; i < N; i++) {
          const a = (Math.random() - 0.5) * Math.PI * 1.3, r = 26 + Math.random() * 8;
          pos[i * 3] = Math.sin(a) * r; pos[i * 3 + 1] = 5 + Math.random() * 9; pos[i * 3 + 2] = -14 - Math.cos(a) * r * 0.4;
          const c = cols[(Math.random() * cols.length) | 0];
          col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
        scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 0.7 })));
      }

      // builders
      const stripeTexture = (a, b) => {
        const c = document.createElement("canvas"); c.width = 256; c.height = 64; const x = c.getContext("2d");
        const n = 7, w = c.width / n;
        for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? a : b; x.fillRect(i * w, 0, w, c.height); }
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
      };
      const skin = () => new THREE.MeshStandardMaterial({ color: 0x3a4a6b, roughness: 0.6, emissive: 0x10182e, emissiveIntensity: 0.5 });
      const cyl = (rt, rb, h, m) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 18), m);
      const sph = (r, m) => new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), m);

      const makePlayer = (opts) => {
        const kitMat = opts.stripe
          ? new THREE.MeshStandardMaterial({ map: stripeTexture(opts.colA, opts.colB), roughness: 0.5, emissive: 0x0a0a14, emissiveIntensity: 0.35 })
          : new THREE.MeshStandardMaterial({ color: opts.colA, roughness: 0.45, emissive: 0x141821, emissiveIntensity: 0.3 });
        const shortMat = new THREE.MeshStandardMaterial({ color: opts.shorts, roughness: 0.55 });
        const bootMat = new THREE.MeshStandardMaterial({ color: opts.boot, roughness: 0.35, metalness: 0.4, emissive: opts.boot, emissiveIntensity: 0.15 });
        const sk = skin();
        const P = new THREE.Group();
        const torso = cyl(0.42, 0.55, 1.5, kitMat); torso.position.y = 3.1; P.add(torso);
        const head = sph(0.42, sk); head.position.y = 4.15; P.add(head);
        const neck = cyl(0.18, 0.18, 0.25, sk); neck.position.y = 3.85; P.add(neck);
        const arm = (side) => {
          const g = new THREE.Group(); g.position.set(0.5 * side, 3.65, 0);
          const u = cyl(0.14, 0.13, 0.9, sk); u.position.y = -0.45; g.add(u);
          const fore = new THREE.Group(); fore.position.y = -0.9; g.add(fore);
          const f = cyl(0.12, 0.1, 0.85, sk); f.position.y = -0.42; fore.add(f);
          g.userData.fore = fore; P.add(g); return g;
        };
        const leg = (side) => {
          const g = new THREE.Group(); g.position.set(0.22 * side, 2.35, 0);
          const th = cyl(0.18, 0.16, 1.05, shortMat); th.position.y = -0.52; g.add(th);
          const knee = new THREE.Group(); knee.position.y = -1.05; g.add(knee);
          const sh = cyl(0.15, 0.12, 1.0, sk); sh.position.y = -0.5; knee.add(sh);
          const ft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.22), bootMat); ft.position.set(0, -1.0, 0.12); knee.add(ft);
          g.userData.knee = knee; P.add(g); return g;
        };
        P.userData = { armL: arm(1), armR: arm(-1), legPlant: leg(-1), legKick: leg(1), torso, head };
        return P;
      };

      const striped = makePlayer({ stripe: true, colA: "#7a1320", colB: "#22337a", shorts: 0x16204a, boot: 0xd8b24a });
      striped.position.set(-3.1, 0, 1.5); striped.rotation.y = 0.5; scene.add(striped);
      const whitey = makePlayer({ stripe: false, colA: 0xeef1f6, shorts: 0xeef1f6, boot: 0xf2f4f6 });
      whitey.position.set(3.4, 0, 1.0); whitey.rotation.y = -0.7; scene.add(whitey);

      // ball + trail
      const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
      x.fillStyle = "#f3f5fb"; x.fillRect(0, 0, 128, 128); x.fillStyle = "#1b2440";
      const pent = [[64, 18], [34, 46], [46, 86], [82, 86], [94, 46]];
      x.beginPath(); pent.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill();
      const ballTex = new THREE.CanvasTexture(c); ballTex.wrapS = ballTex.wrapT = THREE.RepeatWrapping; ballTex.repeat.set(3, 2);
      const ball = sph(0.30, new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.4 })); scene.add(ball);

      const TRAIL = 22, trailPts = new Float32Array(TRAIL * 3);
      const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute("position", new THREE.Float32BufferAttribute(trailPts, 3));
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.5 })); scene.add(trail);
      const hist = [];

      const CYCLE = 3.6, contactStart = 0.42;
      const startPos = new THREE.Vector3(-1.7, 0.45, 1.7), goalPos = new THREE.Vector3(0.2, 1.5, -12);
      let launched = false, fT = 0;
      const clock = new THREE.Clock(), lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);

      const kickPose = (P, phase) => {
        const u = P.userData; let hip, knee;
        if (phase < 0.3) { const t = ease(phase / 0.3); hip = lerp(0.1, -1.0, t); knee = lerp(0.2, 1.4, t); }
        else if (phase < 0.45) { const t = ease((phase - 0.3) / 0.15); hip = lerp(-1.0, 1.1, t); knee = lerp(1.4, 0.05, t); }
        else if (phase < 0.7) { const t = ease((phase - 0.45) / 0.25); hip = lerp(1.1, 0.15, t); knee = lerp(0.05, 0.5, t); }
        else { const t = ease((phase - 0.7) / 0.3); hip = lerp(0.15, 0.1, t); knee = lerp(0.5, 0.2, t); }
        u.legKick.rotation.x = hip; u.legKick.userData.knee.rotation.x = knee;
        u.legPlant.userData.knee.rotation.x = 0.25 + Math.sin(phase * 6.28) * 0.05;
        u.torso.rotation.x = -0.06 + Math.sin(phase * 6.28) * 0.04;
        u.armR.rotation.x = lerp(0.2, -0.6, Math.min(1, phase / 0.45));
        u.armL.rotation.x = lerp(-0.2, 0.7, Math.min(1, phase / 0.45));
        u.armL.userData.fore.rotation.x = -0.4; u.armR.userData.fore.rotation.x = -0.4;
      };
      const idlePose = (P, t) => {
        const u = P.userData, sway = Math.sin(t * 1.1) * 0.04;
        u.torso.rotation.z = sway; u.head.rotation.z = -sway * 0.5;
        u.armL.rotation.z = 0.95; u.armR.rotation.z = -0.95;
        u.armL.userData.fore.rotation.x = -1.5; u.armR.userData.fore.rotation.x = -1.5;
        u.legPlant.userData.knee.rotation.x = 0.12 + sway * 0.3;
        u.legKick.userData.knee.rotation.x = 0.12 - sway * 0.3;
      };

      const tick = () => {
        const dt = clock.getDelta(), t = clock.elapsedTime, phase = (t % CYCLE) / CYCLE;
        if (!reduce) { kickPose(striped, phase); idlePose(whitey, t); }
        else { kickPose(striped, 0.0); idlePose(whitey, 0); }

        if (!reduce) {
          if (phase < contactStart) { launched = false; fT = 0; ball.position.copy(startPos); }
          else {
            if (!launched) { launched = true; fT = 0; goalGlow.intensity = 2.2; }
            fT += dt;
            const f = Math.min(fT / (CYCLE * (1 - contactStart)), 1);
            ball.position.x = lerp(startPos.x, goalPos.x, f);
            ball.position.z = lerp(startPos.z, goalPos.z, f);
            ball.position.y = startPos.y + Math.sin(f * Math.PI) * 3.0 + f * 1.0;
            goalGlow.intensity = lerp(2.2, 0.0, f);
          }
          ball.rotation.x += dt * 7; ball.rotation.y += dt * 4;
        } else ball.position.copy(startPos);

        hist.unshift(ball.position.clone()); if (hist.length > TRAIL) hist.pop();
        for (let i = 0; i < TRAIL; i++) { const p = hist[i] || ball.position; trailPts[i * 3] = p.x; trailPts[i * 3 + 1] = p.y; trailPts[i * 3 + 2] = p.z; }
        trailGeo.attributes.position.needsUpdate = true;
        trail.material.opacity = launched ? 0.5 : 0.0;

        camera.position.x = Math.sin(t * 0.16) * 0.5; camera.position.y = 3.4 + Math.sin(t * 0.22) * 0.12;
        camera.lookAt(0, 2.3, -3);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };

      onResize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
      window.addEventListener("resize", onResize);
      onResize(); tick();
    })();

    return () => {
      mounted = false;
      if (raf) cancelAnimationFrame(raf);
      if (onResize) window.removeEventListener("resize", onResize);
      if (renderer) renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: OPACITY,
        WebkitMaskImage: "radial-gradient(95% 80% at 50% 42%, #000 0%, rgba(0,0,0,.7) 68%, rgba(0,0,0,.35) 100%)",
        maskImage: "radial-gradient(95% 80% at 50% 42%, #000 0%, rgba(0,0,0,.7) 68%, rgba(0,0,0,.35) 100%)",
      }}
    />
  );
}
