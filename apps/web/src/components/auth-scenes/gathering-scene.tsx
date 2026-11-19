import { useEffect, useRef } from 'react';

/*
 * Gathering: people drift across the panel, gather into small groups (a cell,
 * a team, a class), hold, then move on and regather elsewhere. Decorative.
 *
 * Dormant: not rendered anywhere yet. Kept on purpose for the future cells
 * (home groups) feature, where it fits better than on the sign-in page; it
 * still needs a polish pass before it ships. Mount it inside a positioned
 * parent (it fills it and reads colours from --primary and
 * --sidebar-foreground).
 */

const CYCLE_S = 15;
const GATHER_AT_S = 4.5;
const DISPERSE_AT_S = 11.5;
// Start mid-drift so the first gathering lands soon after the page opens.
const START_OFFSET_S = 3.2;
const MAX_DPR = 2;
const POINTER_RADIUS = 150;
const POINTER_CAPACITY = 7;
const TAU = Math.PI * 2;

type Rgb = readonly [number, number, number];

interface Person {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  r: number;
  seed: number;
  host: boolean;
  delay: number;
  group: number;
  slot: number;
  /** Per-gathering seat offsets, so a group is a circle of people, not a dial. */
  seatRadius: number;
  seatAngle: number;
  attracted: boolean;
  /** 0 = drifting, 1 = settled in a group; drives colour. */
  together: number;
}

interface Group {
  x: number;
  y: number;
  size: number;
  rotation: number;
  halo: number;
}

interface Scene {
  w: number;
  h: number;
  people: Person[];
  groups: Group[];
  gathered: boolean;
  /** Scene time of the last gather/disperse, for staggered departures. */
  changedAt: number;
  pointer: { x: number; y: number } | null;
  primary: Rgb;
  ink: Rgb;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Resolves any CSS colour (oklch included) to RGB through a 1px canvas. */
function resolveColor(probe: CanvasRenderingContext2D, color: string): Rgb {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

function readColors(canvas: HTMLCanvasElement, scene: Scene) {
  const probe = document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true });
  if (!probe) return;
  const style = getComputedStyle(canvas);
  scene.primary = resolveColor(probe, style.getPropertyValue('--primary'));
  scene.ink = resolveColor(
    probe,
    style.getPropertyValue('--sidebar-foreground'),
  );
}

const isCompact = (scene: Scene) => scene.h < 320;

/** Keeps the brand mark and tagline zones quiet. */
function quietness(scene: Scene, x: number, y: number): number {
  if (isCompact(scene)) {
    const nearMark = smoothstep(0, 1, 1 - Math.hypot(x / 270, y / 95));
    return 1 - nearMark * 0.8;
  }
  return smoothstep(40, 130, y) * smoothstep(60, 170, scene.h - y);
}

function bounds(scene: Scene) {
  return isCompact(scene)
    ? // Phone band: stay right of the brand mark, which sits top-left.
      {
        x0: Math.min(220, scene.w * 0.55),
        x1: scene.w - 16,
        y0: 18,
        y1: scene.h - 14,
      }
    : { x0: 28, x1: scene.w - 28, y0: 110, y1: scene.h - 140 };
}

function randomHome(scene: Scene) {
  const b = bounds(scene);
  return { x: random(b.x0, b.x1), y: random(b.y0, b.y1) };
}

function createPeople(scene: Scene): Person[] {
  const count = Math.round(clamp((scene.w * scene.h) / 7500, 24, 88));
  return Array.from({ length: count }, () => {
    const home = randomHome(scene);
    return {
      x: home.x,
      y: home.y,
      vx: 0,
      vy: 0,
      homeX: home.x,
      homeY: home.y,
      r: random(2.5, 4.2),
      seed: random(0, 1000),
      host: false,
      delay: random(0, 1.4),
      group: -1,
      slot: 0,
      seatRadius: 1,
      seatAngle: 0,
      attracted: false,
      together: 0,
    };
  });
}

function placeGroups(scene: Scene): Group[] {
  const compact = isCompact(scene);
  const count = compact ? 3 : Math.round(random(4, 6));
  const b = compact
    ? { x0: scene.w * 0.42, x1: scene.w - 40, y0: 50, y1: scene.h - 40 }
    : { x0: 70, x1: scene.w - 70, y0: 170, y1: scene.h - 200 };
  const minGap = compact ? 70 : Math.min(scene.w, scene.h) * 0.24;
  const groups: Group[] = [];
  for (let tries = 0; groups.length < count && tries < 400; tries++) {
    const x = random(b.x0, b.x1);
    const y = random(b.y0, b.y1);
    if (groups.every((g) => Math.hypot(g.x - x, g.y - y) > minGap)) {
      groups.push({ x, y, size: 0, rotation: random(0, TAU), halo: 0 });
    }
  }
  return groups;
}

function gather(scene: Scene, time: number) {
  const groups = placeGroups(scene);
  const compact = isCompact(scene);
  const capacities = groups.map(() =>
    Math.round(compact ? random(4, 7) : random(6, 13)),
  );
  const people = [...scene.people].sort(() => Math.random() - 0.5);
  for (const person of people) {
    person.group = -1;
    person.host = false;
    person.delay = random(0, 1.4);
    person.seatRadius = random(0.72, 1.18);
    person.seatAngle = random(-0.22, 0.22);
    if (person.attracted) continue;
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    groups.forEach((group, index) => {
      const distance = Math.hypot(group.x - person.x, group.y - person.y);
      if ((capacities[index] ?? 0) > 0 && distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    const group = groups[best];
    if (!group) continue;
    person.group = best;
    capacities[best] = (capacities[best] ?? 0) - 1;
    group.size += 1;
  }
  // Seats follow each person's bearing from the centre, so paths don't cross.
  groups.forEach((group, index) => {
    const members = scene.people
      .filter((p) => p.group === index)
      .sort(
        (a, b) =>
          Math.atan2(a.y - group.y, a.x - group.x) -
          Math.atan2(b.y - group.y, b.x - group.x),
      );
    members.forEach((member, slot) => {
      member.slot = slot;
      member.host = slot === 0;
    });
    group.rotation = Math.atan2(
      (members[0]?.y ?? group.y) - group.y,
      (members[0]?.x ?? group.x) - group.x,
    );
  });
  scene.groups = groups;
  scene.gathered = true;
  scene.changedAt = time;
}

function disperse(scene: Scene, time: number) {
  const b = bounds(scene);
  for (const person of scene.people) {
    const group = scene.groups[person.group];
    person.delay = random(0, 1.6);
    if (!group) continue;
    const angle =
      Math.atan2(person.y - group.y, person.x - group.x) + random(-0.5, 0.5);
    const distance = random(50, 150);
    person.homeX = clamp(person.x + Math.cos(angle) * distance, b.x0, b.x1);
    person.homeY = clamp(person.y + Math.sin(angle) * distance, b.y0, b.y1);
  }
  scene.gathered = false;
  scene.changedAt = time;
}

const ringRadius = (size: number) => 9 + size * 2.3;

function seat(group: Group, person: Person, time: number) {
  const radius =
    ringRadius(group.size) *
    person.seatRadius *
    (1 + 0.05 * Math.sin(time * 0.7 + person.seed));
  const angle =
    group.rotation +
    ((person.slot + person.seatAngle) / Math.max(1, group.size)) * TAU +
    time * 0.04;
  return {
    x: group.x + Math.cos(angle) * radius,
    y: group.y + Math.sin(angle) * radius,
  };
}

function updatePointerCircle(scene: Scene) {
  const pointer = scene.pointer;
  if (!pointer) {
    for (const person of scene.people) person.attracted = false;
    return;
  }
  let attracted = scene.people.filter((p) => p.attracted).length;
  if (attracted >= POINTER_CAPACITY) return;
  for (const person of scene.people) {
    if (attracted >= POINTER_CAPACITY) break;
    if (person.attracted || (scene.gathered && person.group >= 0)) continue;
    if (
      Math.hypot(person.x - pointer.x, person.y - pointer.y) < POINTER_RADIUS
    ) {
      person.attracted = true;
      attracted += 1;
    }
  }
}

function targetOf(scene: Scene, person: Person, time: number) {
  const pointer = scene.pointer;
  if (person.attracted && pointer) {
    const members = scene.people.filter((p) => p.attracted);
    const index = members.indexOf(person);
    const angle = (index / members.length) * TAU + time * 0.15;
    const radius = 16 + members.length * 2.4;
    return {
      x: pointer.x + Math.cos(angle) * radius,
      y: pointer.y + Math.sin(angle) * radius,
      grouped: true,
    };
  }
  const group = scene.groups[person.group];
  const settled = time >= scene.changedAt + person.delay;
  if (group && scene.gathered === settled) {
    return { ...seat(group, person, time), grouped: true };
  }
  return {
    x: person.homeX + Math.sin(time * 0.13 + person.seed) * 22,
    y: person.homeY + Math.cos(time * 0.11 + person.seed * 1.7) * 16,
    grouped: false,
  };
}

function step(scene: Scene, dt: number, time: number) {
  const phase = (time + START_OFFSET_S) % CYCLE_S;
  const inGathering = phase >= GATHER_AT_S && phase < DISPERSE_AT_S;
  if (inGathering !== scene.gathered) {
    if (inGathering) gather(scene, time);
    else disperse(scene, time);
  }
  updatePointerCircle(scene);
  const ease = 1 - Math.exp(-dt * 1.6);
  for (const person of scene.people) {
    const target = targetOf(scene, person, time);
    const stiffness = target.grouped ? 3.4 : 1.6;
    const damping = target.grouped ? 2.9 : 2.2;
    person.vx += (stiffness * (target.x - person.x) - damping * person.vx) * dt;
    person.vy += (stiffness * (target.y - person.y) - damping * person.vy) * dt;
    person.x += person.vx * dt;
    person.y += person.vy * dt;
    person.together += ((target.grouped ? 1 : 0) - person.together) * ease;
  }
  for (const group of scene.groups) {
    const wanted = scene.gathered && time >= scene.changedAt + 1.2 ? 1 : 0;
    group.halo += (wanted - group.halo) * (1 - Math.exp(-dt * 1.1));
  }
}

/** The settled, gathered composition used for reduced motion. */
function settle(scene: Scene) {
  gather(scene, Number.NEGATIVE_INFINITY);
  for (const person of scene.people) {
    const group = scene.groups[person.group];
    if (!group) continue;
    const spot = seat(group, person, 0);
    person.x = spot.x;
    person.y = spot.y;
    person.together = 1;
  }
  for (const group of scene.groups) group.halo = 1;
}

const rgba = ([r, g, b]: Rgb, alpha: number) =>
  `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function drawGlow(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  x: number,
  y: number,
  radius: number,
  strength: number,
) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, rgba(scene.primary, 0.14 * strength));
  glow.addColorStop(0.55, rgba(scene.primary, 0.06 * strength));
  glow.addColorStop(1, rgba(scene.primary, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function drawPointerGroup(ctx: CanvasRenderingContext2D, scene: Scene) {
  const pointer = scene.pointer;
  if (!pointer) return;
  const together =
    scene.people
      .filter((p) => p.attracted)
      .reduce((sum, p) => sum + p.together, 0) / POINTER_CAPACITY;
  if (together < 0.05) return;
  drawGlow(ctx, scene, pointer.x, pointer.y, 70, Math.min(1, together));
}

function drawGroups(ctx: CanvasRenderingContext2D, scene: Scene) {
  scene.groups.forEach((group, index) => {
    if (group.halo < 0.01) return;
    drawGlow(
      ctx,
      scene,
      group.x,
      group.y,
      ringRadius(group.size) * 2.3,
      group.halo,
    );

    // Threads between neighbours: the group as a circle of people.
    const members = scene.people
      .filter((p) => p.group === index && p.together > 0.5)
      .sort((a, b) => a.slot - b.slot);
    if (members.length < 3) return;
    ctx.strokeStyle = rgba(scene.primary, 0.16 * group.halo);
    ctx.lineWidth = 1;
    ctx.beginPath();
    members.forEach((member, i) => {
      if (i === 0) ctx.moveTo(member.x, member.y);
      else ctx.lineTo(member.x, member.y);
    });
    ctx.closePath();
    ctx.stroke();
  });
}

function drawPeople(ctx: CanvasRenderingContext2D, scene: Scene) {
  for (const person of scene.people) {
    const quiet = quietness(scene, person.x, person.y);
    if (quiet < 0.01) continue;
    const color = mix(scene.ink, scene.primary, person.together);
    const alpha = (0.32 + 0.5 * person.together) * quiet;
    if (person.host && person.together > 0.4) {
      ctx.fillStyle = rgba(scene.primary, 0.16 * person.together * quiet);
      ctx.beginPath();
      ctx.arc(person.x, person.y, person.r * 2.6, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = rgba(
      color,
      person.host ? Math.min(1, alpha + 0.15) : alpha,
    );
    ctx.beginPath();
    ctx.arc(person.x, person.y, person.r, 0, TAU);
    ctx.fill();
  }
}

function draw(ctx: CanvasRenderingContext2D, scene: Scene) {
  ctx.clearRect(0, 0, scene.w, scene.h);
  drawGroups(ctx, scene);
  drawPointerGroup(ctx, scene);
  drawPeople(ctx, scene);
}

export function GatheringScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    // The panel content sits above the canvas, so listen on the panel itself.
    const host = canvas?.parentElement?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !host || !ctx) return;

    const scene: Scene = {
      w: 0,
      h: 0,
      people: [],
      groups: [],
      gathered: false,
      changedAt: 0,
      pointer: null,
      primary: [40, 70, 120],
      ink: [60, 70, 90],
    };
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = 0;
    let elapsed = 0;
    let visible = true;

    const render = () => draw(ctx, scene);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const first = scene.w === 0;
      const sx = first ? 1 : rect.width / scene.w;
      const sy = first ? 1 : rect.height / scene.h;
      scene.w = rect.width;
      scene.h = rect.height;
      if (first) {
        scene.people = createPeople(scene);
        if (motion.matches) settle(scene);
      } else {
        for (const p of scene.people) {
          p.x *= sx;
          p.y *= sy;
          p.homeX *= sx;
          p.homeY *= sy;
        }
        for (const g of scene.groups) {
          g.x *= sx;
          g.y *= sy;
        }
      }
      render();
    };

    const tick = (now: number) => {
      // Clamp dt so a stalled tab doesn't fling people across the panel.
      const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      last = now;
      elapsed += dt;
      step(scene, dt, elapsed);
      render();
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };
    const start = () => {
      if (frame || motion.matches || document.hidden || !visible) return;
      frame = requestAnimationFrame(tick);
    };

    const onMotionChange = () => {
      if (motion.matches) {
        stop();
        settle(scene);
        render();
      } else {
        start();
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      scene.pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };
    const onPointerLeave = () => {
      scene.pointer = null;
    };

    readColors(canvas, scene);
    const themeObserver = new MutationObserver(() => {
      readColors(canvas, scene);
      render();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
      else stop();
    });
    intersection.observe(canvas);
    motion.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', onVisibility);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);

    resize();
    start();

    return () => {
      stop();
      themeObserver.disconnect();
      resizeObserver.disconnect();
      intersection.disconnect();
      motion.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
