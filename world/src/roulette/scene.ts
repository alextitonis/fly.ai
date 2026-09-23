/**
 * Fly Roulette's cartoon stage: toon-shaded flies around a felt table under a lamp, and a toy cap gun that
 * pops a BANG! flag. Only looks: every choice comes from the page (main.ts), which gets it from the brains.
 */
import * as THREE from "three";
import { t } from "./i18n.ts";

export interface Seat { name: string; color: string }

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const back = (p: number) => { const c = 1.9; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; };

/** Three-band toon ramp shared by every material. */
function toonRamp(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
const RAMP = toonRamp();
export const toon = (color: THREE.ColorRepresentation, extra: Partial<THREE.MeshToonMaterialParameters> = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: RAMP, ...extra });
const INK = new THREE.MeshBasicMaterial({ color: 0x0b0b10, side: THREE.BackSide });

/** A mesh with a black inverted-hull outline, the cartoon look. */
export function inked(geo: THREE.BufferGeometry, mat: THREE.Material, outline = 0.06): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  const o = new THREE.Mesh(geo, INK);
  o.scale.setScalar(1 + outline);
  m.add(o);
  return m;
}

function textTexture(text: string, fg: string, bg: string, w = 256, h = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#111"; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = fg; g.font = `900 ${Math.round(h * 0.55)}px 'Outfit', Impact, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Fly {
  readonly root = new THREE.Group();       // sits at the seat, faces the table
  readonly body = new THREE.Group();       // bobs, tilts, falls, flies
  readonly head = new THREE.Group();       // turns to watch the gun
  readonly wings: THREE.Mesh[] = [];
  readonly eyes: THREE.Mesh[] = [];
  readonly antennae: THREE.Group[] = [];
  readonly xEyes = new THREE.Group();
  readonly halo: THREE.Mesh;
  readonly sweat: THREE.Mesh;
  readonly crown: THREE.Group;
  readonly frontLegs: THREE.Group[] = [];
  readonly legs: THREE.Group[] = [];
  flap = 0;                                // 0 folded, 1 buzzing
  bobPhase = Math.random() * 10;
  state: "idle" | "dead" | "gone" = "idle";
  holding = false;                         // front legs on the gun
  busy = false;                            // a tween owns the body right now
  eyeScale = 1;                            // wide eyes when startled
  /** clock time its arrival hop starts (worked out each frame, so it always finishes), or -1 once it's here */
  appearAt = -1;
  private nextBlink = 1 + Math.random() * 3;
  private blinkT = -1;
  private nextRub = 2 + Math.random() * 5;
  private rubT = -1;
  private nextFlutter = 3 + Math.random() * 6;
  private flutterT = -1;
  private readonly lookQ = new THREE.Quaternion();

  /** where the head sits on the body (its pivot), and its centre relative to that */
  static readonly NECK = new THREE.Vector3(0, 1.0, 0.18);
  static readonly HEAD = new THREE.Vector3(0, 0.12, 0.12);

  constructor(color: string) {
    this.root.add(this.body);
    const shell = toon(0x2b2f3a);
    const thorax = inked(new THREE.SphereGeometry(0.42, 24, 16), shell);
    thorax.scale.set(1, 0.9, 1);
    thorax.position.y = 0.75;
    this.body.add(thorax);
    const abdomen = inked(new THREE.SphereGeometry(0.4, 24, 16), toon(0x3a3f4d));
    abdomen.scale.set(0.9, 0.8, 1.35);
    abdomen.position.set(0, 0.62, -0.62);
    this.body.add(abdomen);
    for (const z of [-0.45, -0.7]) {             // stripes
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 8, 24), toon(0x16181e));
      ring.position.set(0, 0.62, z);
      ring.scale.set(1.05, 0.95, 1);
      this.body.add(ring);
    }
    // the head: everything in it is placed relative to the neck
    this.head.position.copy(Fly.NECK);
    this.body.add(this.head);
    const H = Fly.HEAD;
    const skull = inked(new THREE.SphereGeometry(0.34, 24, 16), shell);
    skull.position.copy(H);
    this.head.add(skull);
    for (const s of [-1, 1]) {
      const eye = inked(new THREE.SphereGeometry(0.24, 24, 16), toon(0xd8262b), 0.05);
      eye.scale.set(0.9, 1.1, 0.9);
      eye.position.set(0.22 * s, H.y + 0.08, H.z + 0.12);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(0.07, 0.12, 0.19);           // on the eye, in its own frame, so it blinks with it
      eye.add(shine);
      this.eyes.push(eye);
      this.head.add(eye);
      const x = new THREE.Group();                // X_X for the dead
      for (const r of [-1, 1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        bar.rotation.z = (Math.PI / 4) * r;
        x.add(bar);
      }
      x.position.set(0.22 * s, H.y + 0.1, H.z + 0.36);
      this.xEyes.add(x);
      // antennae: a stalk and a knob that wiggle
      const ant = new THREE.Group();
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.28), toon(0x1a1c22));
      stalk.position.y = 0.14;
      ant.add(stalk);
      const knob = inked(new THREE.SphereGeometry(0.05, 10, 8), toon(color), 0.1);
      knob.position.y = 0.3;
      ant.add(knob);
      ant.position.set(0.08 * s, H.y + 0.3, H.z + 0.12);
      ant.rotation.set(0.35, 0, -0.35 * s);
      ant.userData.side = s;
      this.antennae.push(ant);
      this.head.add(ant);
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24),
        new THREE.MeshToonMaterial({ color: 0xcfe8ff, gradientMap: RAMP, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      wing.scale.set(0.55, 1, 1);
      wing.geometry.translate(0, 0.5, 0);
      wing.position.set(0.15 * s, 1.0, -0.15);
      wing.userData.side = s;
      this.wings.push(wing);
      this.body.add(wing);
    }
    this.xEyes.visible = false;
    this.head.add(this.xEyes);
    // legs: the front pair reaches for the trigger, and rubs together when bored, as flies do
    const legMat = toon(0x1a1c22);
    for (let pair = 0; pair < 3; pair++) {
      for (const s of [-1, 1]) {
        const leg = new THREE.Group();
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5), legMat);
        upper.position.y = -0.25;
        leg.add(upper);
        leg.position.set(0.3 * s, 0.6, 0.25 - pair * 0.3);
        leg.rotation.z = 0.7 * s;
        leg.rotation.x = pair === 0 ? -0.9 : (pair - 1) * 0.4;
        leg.userData.side = s;
        this.body.add(leg);
        this.legs.push(leg);
        if (pair === 0) this.frontLegs.push(leg);
      }
    }
    // their colour: a little bow tie
    const tie = new THREE.Group();
    for (const s of [-1, 1]) {
      const cone = inked(new THREE.ConeGeometry(0.1, 0.18, 12), toon(color), 0.08);
      cone.rotation.z = (Math.PI / 2) * s;
      cone.position.x = -0.09 * s;
      tie.add(cone);
    }
    tie.position.set(0, 0.9, 0.52);
    this.body.add(tie);
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 10, 32), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    this.halo.rotation.x = Math.PI / 2;
    this.halo.visible = false;
    this.root.add(this.halo);
    this.sweat = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), toon(0x8fd3ff));
    this.sweat.scale.set(1, 1.5, 1);
    this.sweat.visible = false;
    this.head.add(this.sweat);
    this.crown = new THREE.Group();
    const gold = toon(0xffc83d);
    const band = inked(new THREE.CylinderGeometry(0.22, 0.24, 0.14, 16, 1, true), gold, 0.08);
    this.crown.add(band);
    for (let k = 0; k < 5; k++) {
      const spike = inked(new THREE.ConeGeometry(0.06, 0.16, 8), gold, 0.08);
      const a = (k / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.21, 0.14, Math.sin(a) * 0.21);
      this.crown.add(spike);
    }
    this.crown.position.set(0, H.y + 0.4, H.z);
    this.crown.visible = false;
    this.head.add(this.crown);
  }

  /** The head's centre in world space: where a gun should point. */
  headWorld(): THREE.Vector3 {
    return this.head.localToWorld(Fly.HEAD.clone());
  }

  tick(t: number, dt: number, watch: THREE.Vector3 | null): void {
    const alive = this.state === "idle";
    if (this.appearAt >= 0) {
      const p = (t - this.appearAt) / 0.42;
      if (p >= 1) { this.appearAt = -1; this.body.scale.setScalar(1); this.body.position.y = 0; }
      else {
        this.body.scale.setScalar(p <= 0 ? 0.001 : Math.max(0.001, back(p)));
        this.body.position.y = p <= 0 ? 0 : Math.sin(p * Math.PI) * 0.5;
      }
    } else if (alive && !this.busy) {
      this.body.position.y = Math.sin(t * 2.2 + this.bobPhase) * 0.04;
      if (this.body.scale.x !== 1) this.body.scale.setScalar(1);   // nothing may leave a waiting fly shrunk
    }

    // the head follows the gun around the table (as far as a neck allows)
    if (alive && watch) {
      const local = this.body.worldToLocal(watch.clone()).sub(this.head.position);
      const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.9, 0.9);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.5, 0.4);
      this.lookQ.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
      this.head.quaternion.slerp(this.lookQ, Math.min(1, dt * 5));
    }

    // blinking
    this.nextBlink -= dt;
    if (alive && this.nextBlink <= 0 && this.blinkT < 0) { this.blinkT = 0; this.nextBlink = 1.5 + Math.random() * 4; }
    let lid = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      lid = Math.abs(Math.cos(Math.min(1, this.blinkT / 0.16) * Math.PI));
      if (this.blinkT > 0.16) this.blinkT = -1;
    }
    for (const e of this.eyes) e.scale.set(0.9 * this.eyeScale, 1.1 * this.eyeScale * Math.max(0.08, lid), 0.9 * this.eyeScale);
    this.eyeScale += (1 - this.eyeScale) * Math.min(1, dt * 3);

    // antennae wiggle, faster when nervous
    for (const a of this.antennae) {
      const s = a.userData.side as number;
      a.rotation.z = -0.35 * s + Math.sin(t * (3 + this.flap * 20) + s) * (0.12 + this.flap * 0.2);
    }

    // rubbing its front legs together
    this.nextRub -= dt;
    if (alive && !this.holding && !this.busy && this.nextRub <= 0 && this.rubT < 0) { this.rubT = 0; this.nextRub = 4 + Math.random() * 6; }
    if (this.rubT >= 0) {
      this.rubT += dt;
      const on = this.rubT < 1.6 && alive && !this.holding;
      for (const leg of this.frontLegs) {
        const s = leg.userData.side as number;
        leg.rotation.x = on ? -1.35 : -0.9;
        leg.rotation.z = on ? 0.25 * s + Math.sin(this.rubT * 22) * 0.18 : 0.7 * s;
      }
      if (!on) this.rubT = -1;
    }

    // now and then a little wing flutter
    this.nextFlutter -= dt;
    if (alive && !this.busy && this.nextFlutter <= 0 && this.flutterT < 0) { this.flutterT = 0; this.nextFlutter = 5 + Math.random() * 8; }
    let flutter = 0;
    if (this.flutterT >= 0) { this.flutterT += dt; flutter = 0.35; if (this.flutterT > 0.35) this.flutterT = -1; }

    const flap = Math.max(this.flap, flutter);
    const speed = 8 + flap * 60;
    for (const w of this.wings) {
      const s = w.userData.side as number;
      const beat = flap > 0 ? Math.sin(t * speed) * 0.8 * flap : 0;
      w.rotation.set(-1.25 + beat * 0.3, 0, s * (0.5 + beat));
    }
    if (this.sweat.visible) {
      this.sweat.position.y -= dt * 0.6;
      if (this.sweat.position.y < -0.1) this.sweat.position.set(0.32, 0.4, 0.2);
    }
    if (this.halo.visible) this.halo.rotation.z += dt;
    if (this.crown.visible) this.crown.rotation.y += dt * 1.5;
  }
}

class Gun {
  readonly root = new THREE.Group();
  readonly drum: THREE.Group;
  readonly flag: THREE.Group;
  readonly sign: THREE.Mesh;
  readonly trigger: THREE.Mesh;

  constructor() {
    const orange = toon(0xff8a1f), yellow = toon(0xffd23a), grip = toon(0x8a4b2a), dark = toon(0x303440);
    const barrel = inked(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 20), orange);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.25, 0.65);
    this.root.add(barrel);
    const tip = inked(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20), yellow);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0.25, 1.2);
    this.root.add(tip);
    const frame = inked(new THREE.BoxGeometry(0.34, 0.4, 0.6), orange);
    frame.position.set(0, 0.2, 0);
    this.root.add(frame);
    this.drum = new THREE.Group();
    const drumBody = inked(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 24), yellow);
    drumBody.rotation.x = Math.PI / 2;
    this.drum.add(drumBody);
    for (let k = 0; k < 6; k++) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 12), dark);
      const a = (k / 6) * Math.PI * 2;
      hole.rotation.x = Math.PI / 2;
      hole.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0);
      this.drum.add(hole);
    }
    this.drum.position.set(0, 0.22, 0.12);
    this.root.add(this.drum);
    const handle = inked(new THREE.BoxGeometry(0.28, 0.75, 0.3), grip);
    handle.position.set(0, -0.3, -0.35);
    handle.rotation.x = -0.45;
    this.root.add(handle);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20, Math.PI), orange);
    guard.rotation.set(0, Math.PI / 2, Math.PI);
    guard.position.set(0, -0.02, 0.05);
    this.root.add(guard);
    this.trigger = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), dark);
    this.trigger.position.set(0, -0.06, 0.08);
    this.root.add(this.trigger);
    // BANG! on a stick: springs up out of the barrel tip (never forward, into the fly's face)
    this.flag = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7), toon(0xdddddd));
    stick.position.y = 0.35;
    this.flag.add(stick);
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6),
      new THREE.MeshBasicMaterial({ map: textTexture(t("roulette.scene.bang"), "#e0342c", "#fff6d5"), side: THREE.DoubleSide }));
    this.sign.position.y = 0.95;
    this.flag.add(this.sign);
    this.flag.position.set(0, 0.25, 1.2);
    this.flag.scale.setScalar(0.001);
    this.flag.visible = false;
    this.root.add(this.flag);
    this.root.scale.setScalar(0.85);
  }
}

export class Stage {
  /** the felt's surface: the table top is a 0.3 slab centred at 0.85 */
  static readonly TABLE_TOP = 1.0;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  readonly gun = new Gun();
  flies: Fly[] = [];
  graves: THREE.Object3D[] = [];
  speed = 1;
  private tweens = new Set<(now: number) => boolean>();
  private clock = new THREE.Clock();
  private readonly radius = 3.4;
  private gunHome = new THREE.Vector3(0, 1.35, 0);
  private gunIdle = true;
  private readonly idlePose = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  /** while a fly holds the gun: where it rests, and how much the fly's nerves make it tremble */
  private aim: THREE.Vector3 | null = null;
  private tremble = 0;
  // camera: a base pose that fits the table, eased toward the fly whose turn it is, plus shake
  private camBase = new THREE.Vector3();
  private readonly camLookBase = new THREE.Vector3(0, 1.1, 0);
  private camFocus = new THREE.Vector3();
  private camFocusTarget = new THREE.Vector3();
  private shakeAmp = 0;
  private readonly gunWorld = new THREE.Vector3();

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x140d12);
    this.scene.fog = new THREE.Fog(0x140d12, 14, 30);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), toon(0x3a2418));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.3, 0.3, 64), toon(0x1f7a4a));
    top.position.y = 0.85;
    top.receiveShadow = true;
    table.add(top);
    const rim = inked(new THREE.TorusGeometry(4.3, 0.18, 12, 64), toon(0x7a3f1d), 0.04);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.0;
    table.add(rim);
    const leg = inked(new THREE.CylinderGeometry(0.5, 0.9, 0.85, 20), toon(0x5a2e16));
    leg.position.y = 0.42;
    table.add(leg);
    this.scene.add(table);
    // the lamp
    const shade = inked(new THREE.ConeGeometry(1.1, 0.8, 24, 1, true), toon(0x2f6b3a, { side: THREE.DoubleSide }), 0.03);
    shade.position.y = 7;
    this.scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
    bulb.position.y = 6.7;
    this.scene.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    cord.position.y = 10.4;
    this.scene.add(cord);
    const spot = new THREE.SpotLight(0xfff0c8, 90, 22, 0.75, 0.5, 1.4);
    spot.position.set(0, 6.6, 0);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    this.scene.add(spot, spot.target);
    this.scene.add(new THREE.HemisphereLight(0x8a7cff, 0x2a1408, 0.9));

    this.gun.root.position.copy(this.gunHome);
    this.gun.root.quaternion.copy(this.idlePose);
    this.scene.add(this.gun.root);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // step back until the whole table fits across (phones are narrow)
    const d = Math.max(12, 12 / (w / h));
    this.camBase.set(0, 0.62 * d, 0.78 * d);
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const now = performance.now();
    for (const tw of [...this.tweens]) {
      // one broken step must not stall the rest (it would every frame, and everything queued behind it)
      let more = false;
      try { more = tw(now); } catch (err) { console.error("roulette animation:", err); }
      if (!more) this.tweens.delete(tw);
    }

    // the gun: turning slowly at rest, or trembling in the fly's grip
    if (this.gunIdle) this.gun.root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.6));
    if (this.aim) {
      const j = 0.015 + this.tremble * 0.05;
      this.gun.root.position.set(this.aim.x + (Math.random() - 0.5) * j, this.aim.y + Math.sin(t * 3) * 0.03 + (Math.random() - 0.5) * j, this.aim.z + (Math.random() - 0.5) * j);
    }
    if (this.gun.flag.visible) this.gun.sign.lookAt(this.camera.position);
    this.gun.root.getWorldPosition(this.gunWorld);
    for (const f of this.flies) f.tick(t, dt, this.gunWorld);

    // camera
    this.camFocus.lerp(this.camFocusTarget, Math.min(1, dt * 2.5));
    // lean in less on narrow screens, where the far side of the table would slide out of view
    this.shakeAmp *= Math.exp(-dt * 6);
    const shake = (k: number) => (Math.random() - 0.5) * this.shakeAmp * k;
    const lean = Math.min(1, this.camera.aspect) ** 2;
    this.camera.position.set(
      this.camBase.x + this.camFocus.x * 0.35 * lean + shake(1),
      this.camBase.y - this.camFocus.lengthSq() * 0.02 * lean + Math.sin(t * 0.4) * 0.08 + shake(1),
      this.camBase.z + this.camFocus.z * 0.35 * lean + shake(1),
    );
    this.camera.lookAt(this.camLookBase.x + this.camFocus.x * 0.3 * lean, this.camLookBase.y + shake(0.3), this.camLookBase.z + this.camFocus.z * 0.3 * lean);
    this.renderer.render(this.scene, this.camera);
  }

  /** Runs fn(p) for p 0..1 over ms (scaled by speed); resolves when done. */
  tween(ms: number, fn: (p: number) => void): Promise<void> {
    const dur = ms / this.speed;
    const start = performance.now();
    return new Promise((resolve) => {
      this.tweens.add((now) => {
        const p = Math.min(1, (now - start) / dur);
        try { fn(p); } catch (err) {
          console.error("roulette animation:", err);
          resolve();                               // the game carries on without it
          return false;
        }
        if (p >= 1) resolve();
        return p < 1;
      });
    });
  }
  wait(ms: number): Promise<void> { return this.tween(ms, () => {}); }

  /** Seats round the table, with the spot nearest the camera left free so nobody blocks the view. */
  private seatAngle(i: number): number { const n = this.flies.length; return ((i + 0.5) / n) * Math.PI * 2 + Math.PI / 2; }

  seat(seats: Seat[]): void {
    for (const f of this.flies) this.scene.remove(f.root);
    for (const g of this.graves) this.scene.remove(g);
    this.graves = [];
    this.flies = seats.map((s) => new Fly(s.color));
    this.flies.forEach((f, i) => {
      const a = this.seatAngle(i);
      f.root.position.set(Math.cos(a) * this.radius, 1.0, Math.sin(a) * this.radius);
      f.root.lookAt(0, 1.0, 0);
      this.scene.add(f.root);
      // they arrive with a hop, one after another
      f.body.scale.setScalar(0.001);
      f.appearAt = this.clock.elapsedTime + 0.12 * i;
    });
    this.aim = null;
    this.gun.root.position.copy(this.gunHome);
    this.gun.root.quaternion.copy(this.idlePose);
    this.gunIdle = true;
    this.focus(null);
  }

  /** The camera leans toward a seat, or back to the whole table. */
  focus(i: number | null): void {
    if (i === null || !this.flies[i]) { this.camFocusTarget.set(0, 0, 0); return; }
    const p = this.flies[i].root.position;
    this.camFocusTarget.set(p.x, 0, p.z);
  }

  /** Where a fly's head is on screen, for the name tags. */
  screenPos(i: number): { x: number; y: number } | null {
    const f = this.flies[i];
    if (!f) return null;
    const v = new THREE.Vector3(0, 1.75, 0);
    f.root.localToWorld(v);
    v.project(this.camera);
    return { x: (v.x + 1) / 2 * this.host.clientWidth, y: (1 - v.y) / 2 * this.host.clientHeight };
  }

  /** Clicks on a fly, for picking your champion. */
  pick(clientX: number, clientY: number): number {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    let best = -1, bestD = Infinity;
    this.flies.forEach((f, i) => {
      const hit = ray.intersectObject(f.root, true)[0];
      if (hit && hit.distance < bestD) { bestD = hit.distance; best = i; }
    });
    return best;
  }

  /** A picked fly waves: a hop and a flutter. */
  cheer(i: number): void {
    const f = this.flies[i];
    if (!f || f.state !== "idle" || f.busy) return;
    f.busy = true;
    f.eyeScale = 1.3;
    void this.tween(450, (p) => { f.body.position.y = Math.sin(p * Math.PI) * 0.45; f.flap = Math.sin(p * Math.PI) * 0.6; })
      .then(() => { f.busy = false; f.flap = 0; });
  }

  /**
   * The gun floats over and stops with the barrel tip just in front of the fly's face (the tip is 1.07 from the
   * gun's origin, the face 0.46 from the head's centre, plus a gap), then the fly grabs it.
   */
  async gunTo(i: number): Promise<void> {
    this.gunIdle = false;
    this.aim = null;
    const f = this.flies[i];
    this.focus(i);
    // the head at rest, in world space, and the way from it toward the middle of the table
    const head = f.root.localToWorld(Fly.NECK.clone().add(Fly.HEAD));
    const toward = new THREE.Vector3(-head.x, 0, -head.z).normalize();
    const barrelY = 0.25 * 0.85;
    const to = head.clone().addScaledVector(toward, 1.07 + 0.75).add(new THREE.Vector3(0, -barrelY, 0));
    const look = new THREE.Object3D();
    look.position.copy(to);
    look.lookAt(head.x, head.y - barrelY, head.z);
    const from = this.gun.root.position.clone();
    const q0 = this.gun.root.quaternion.clone();
    const q1 = look.quaternion.clone();
    await this.tween(700, (p) => {
      const e = ease(p);
      this.gun.root.position.lerpVectors(from, to, e);
      this.gun.root.position.y += Math.sin(p * Math.PI) * 0.8;
      this.gun.root.quaternion.slerpQuaternions(q0, q1, e);
    });
    this.aim = to;
    this.tremble = 0;
    f.holding = true;
    for (const leg of f.frontLegs) { leg.rotation.x = -1.45; leg.rotation.z = 0.35 * (leg.userData.side as number); }
    f.eyeScale = 1.25;
  }

  async spinDrum(turns = 1.5): Promise<void> {
    const r0 = this.gun.drum.rotation.z;
    await this.tween(650, (p) => { this.gun.drum.rotation.z = r0 + ease(p) * turns * Math.PI * 2; });
  }

  /** While the brain decides: sweat, wings twitching with its flight motor, and the gun trembling. */
  nerves(i: number, wing: number): void {
    const f = this.flies[i];
    if (!f) return;
    f.sweat.visible = true;
    f.flap = Math.min(1, wing) * 0.8;
    f.body.rotation.z = Math.sin(performance.now() / 40) * 0.03 * (1 + wing * 2);
    this.tremble = Math.min(1.5, wing);
  }

  private calm(f: Fly): void {
    f.sweat.visible = false;
    f.flap = 0;
    f.body.rotation.z = 0;
    f.holding = false;
    for (const leg of f.frontLegs) { leg.rotation.x = -0.9; leg.rotation.z = 0.7 * (leg.userData.side as number); }
    this.tremble = 0;
  }

  async squeeze(): Promise<void> {
    await this.tween(180, (p) => { this.gun.trigger.position.z = 0.08 - Math.sin(p * Math.PI) * 0.06; });
  }

  /** Click: a flinch, then a big sigh of relief (squash and stretch). */
  async click(i: number): Promise<void> {
    await this.squeeze();
    const f = this.flies[i];
    f.busy = true;
    f.eyeScale = 1.4;
    this.shakeAmp = 0.05;
    await this.tween(160, (p) => { f.body.scale.set(1 + p * 0.12, 1 - p * 0.15, 1 + p * 0.12); });
    await this.tween(420, (p) => {
      const b = back(p);
      f.body.scale.set(1.12 - 0.12 * b, 0.85 + 0.15 * b, 1.12 - 0.12 * b);
      f.body.position.y = Math.sin(p * Math.PI) * 0.3;
    });
    f.body.scale.setScalar(1);
    this.calm(f);
    f.busy = false;
  }

  /** Everyone still at the table jumps at the bang. */
  private startle(except: number): void {
    this.flies.forEach((f, j) => {
      if (j === except || f.state !== "idle") return;
      f.busy = true;
      f.eyeScale = 1.45;
      void this.wait(Math.random() * 80).then(() => this.tween(380, (p) => {
        f.body.position.y = Math.sin(p * Math.PI) * 0.55;
        f.flap = Math.sin(p * Math.PI);
      })).then(() => { f.busy = false; f.flap = 0; });
    });
  }

  async bang(i: number): Promise<void> {
    await this.squeeze();
    const f = this.flies[i];
    this.gun.flag.visible = true;
    this.shakeAmp = 0.45;
    this.startle(i);
    this.aim = null;
    const recoil = this.gun.root.position.clone();
    const back0 = new THREE.Vector3(0, 0, -0.35).applyQuaternion(this.gun.root.quaternion);
    void this.tween(300, (p) => { this.gun.root.position.copy(recoil).addScaledVector(back0, Math.sin(p * Math.PI)); });
    await this.tween(260, (p) => { this.gun.flag.scale.setScalar(Math.max(0.001, back(p))); });
    this.calm(f);
    f.state = "dead";
    f.busy = true;
    f.xEyes.visible = true;
    for (const e of f.eyes) e.visible = false;
    // pops up, spins once, and lands on its back, legs in the air: resting exactly on the felt, a little in
    // from the rim, however it's shaped
    const inward = 0.5;
    const lift = this.restingLift(f, new THREE.Euler(0, 0, Math.PI), inward);
    await this.tween(850, (p) => {
      f.body.rotation.y = ease(p) * Math.PI * 2;
      f.body.rotation.z = ease(Math.max(0, (p - 0.3) / 0.7)) * Math.PI;
      f.body.position.y = Math.sin(p * Math.PI) * 1.2 + ease(p) * lift;
      f.body.position.z = ease(p) * inward;
    });
    f.body.rotation.set(0, 0, Math.PI);
    this.shakeAmp = Math.max(this.shakeAmp, 0.12);
    // one last twitch of the legs
    const rest = f.legs.map((l) => l.rotation.x);
    void this.tween(1300, (p) => {
      f.legs.forEach((l, k) => { l.rotation.x = rest[k] + Math.sin(p * 40 + k) * 0.35 * (1 - p); });
    });
    // the halo rises from wherever its head ended up
    const head = f.root.worldToLocal(f.headWorld());
    f.halo.visible = true;
    f.halo.position.copy(head);
    void this.tween(300, (p) => { this.gun.flag.scale.setScalar(Math.max(0.001, 1 - p)); }).then(() => { this.gun.flag.visible = false; });
    await this.tween(900, (p) => { f.halo.position.y = head.y + 0.3 + ease(p) * 0.6; });
  }

  /**
   * How high the body must sit, in that pose and nudged that far toward the table's middle, for its lowest
   * visible point to touch the table top. Measured on the real meshes, then the pose is put back.
   */
  private restingLift(f: Fly, pose: THREE.Euler, inward: number): number {
    const rot = f.body.rotation.clone(), pos = f.body.position.clone();
    f.body.rotation.copy(pose);
    f.body.position.set(0, 0, inward);
    f.root.updateMatrixWorld(true);
    const box = new THREE.Box3(), part = new THREE.Box3();
    f.body.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld));
    });
    f.body.rotation.copy(rot);
    f.body.position.copy(pos);
    f.root.updateMatrixWorld(true);
    return Stage.TABLE_TOP - box.min.y;
  }

  /** It chickens out: drops the gun and buzzes up and away, zig-zagging. */
  async flyAway(i: number): Promise<void> {
    const f = this.flies[i];
    this.calm(f);
    this.aim = null;
    f.state = "gone";
    f.busy = true;
    f.flap = 1;
    f.eyeScale = 1.5;
    await this.tween(250, (p) => { f.body.scale.set(1 + p * 0.1, 1 - p * 0.2, 1 + p * 0.1); });   // crouch
    f.body.scale.setScalar(1);
    await this.tween(1400, (p) => {
      const e = p * p;
      f.body.position.y = e * 9;
      f.body.position.z = -e * 7;
      f.body.position.x = Math.sin(p * 18) * 0.35 * (1 - p);
      f.body.rotation.x = -0.5 * Math.min(1, p * 3);
      f.body.rotation.y = Math.sin(p * 12) * 0.5;
    });
    f.root.visible = false;
  }

  /** A little headstone where a fly fell. */
  grave(i: number, name: string): void {
    const a = this.seatAngle(i);
    const g = new THREE.Group();
    const stone = inked(new THREE.BoxGeometry(0.8, 0.9, 0.2), toon(0x9aa1ad));
    stone.position.y = 0.45;
    g.add(stone);
    const cap = inked(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 20, 1, false, 0, Math.PI), toon(0x9aa1ad));
    cap.rotation.x = Math.PI / 2;
    cap.rotation.z = -Math.PI / 2;
    cap.position.y = 0.9;
    g.add(cap);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.5),
      new THREE.MeshBasicMaterial({ map: textTexture(t("roulette.scene.rip"), "#222", "#c9ced6", 256, 192), transparent: true }));
    label.position.set(0, 0.55, 0.11);
    g.add(label);
    g.position.set(Math.cos(a) * (this.radius + 1.6), 0, Math.sin(a) * (this.radius + 1.6));
    g.lookAt(0, 0, 0);
    g.userData.name = name;
    this.scene.add(g);
    this.graves.push(g);
    void this.tween(400, (p) => g.scale.setScalar(Math.max(0.001, back(p))));
  }

  async gunHomeAgain(): Promise<void> {
    this.aim = null;
    this.focus(null);
    const from = this.gun.root.position.clone();
    const q0 = this.gun.root.quaternion.clone();
    await this.tween(500, (p) => {
      this.gun.root.position.lerpVectors(from, this.gunHome, ease(p));
      this.gun.root.quaternion.slerpQuaternions(q0, this.idlePose, ease(p));
    });
    this.gunIdle = true;
  }

  /** The winner: the crown drops on, then a victory dance (hops, spins, buzzing wings). */
  async crown(i: number): Promise<void> {
    const f = this.flies[i];
    this.focus(i);
    f.busy = true;
    f.crown.visible = true;
    await this.tween(600, (p) => { f.crown.position.y = Fly.HEAD.y + 1.2 - ease(p) * 0.8; });
    f.flap = 0.7;
    f.eyeScale = 1.3;
    await this.tween(1800, (p) => {
      f.body.position.y = Math.abs(Math.sin(p * Math.PI * 4)) * 0.45;
      f.body.rotation.y = ease(p) * Math.PI * 4;
      f.body.rotation.z = Math.sin(p * Math.PI * 8) * 0.15;
    });
    f.body.rotation.set(0, 0, 0);
    f.flap = 0;
    f.busy = false;
    this.focus(null);
  }
}
