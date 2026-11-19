import { useEffect, useRef, useState } from 'react';

const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

// Shared by every pass: the scene's geometry, window mask, sun and camera.
const COMMON = `precision highp float;

uniform vec2 uRes;     // render pixels of this pass
uniform float uTime;
uniform vec2 uPointer; // eased, -1..1

out vec4 outColor;

// A small modern church in metres. The back wall's room face is z = 0 and the
// room is z < 0; the glass sits at z = WALL_D in each opening; floor y = 0.
// Everything lit (glass, reveals, shafts, floor, the Bible on its lectern) comes
// from the same windowMask() and the same sun direction, so light and windows agree.

const float WALL_D = 0.25;
const float SILL = 2.9;
const float PITCH = 1.5;
const float WX = 1.6;          // central window x
const float C_SPAN = 1.0;      // central window: wider and taller
const float C_SPRING = 3.1;    // straight jamb height before the round head
const float S_SPAN = 0.82;
const float S_SPRING = 2.55;
const vec3 SUN_COL = vec3(1.0, 0.84, 0.6);
const vec3 BASE_L = vec3(-0.16, -0.75, -0.6); // light travel, before the pointer nudge
const float DESK_Y = 1.1;      // lectern desk height
const float AIM_Y = 1.75;      // the Bible sits in light from this height above the central sill
const float TILT = 0.4;        // the desk leans toward the reader (-z)
const float LECTERN_SCALE = 1.35; // the stand and book, scaled up so the Bible reads at panel size
const vec3 BOX_MIN = vec3(-0.45, 0.0, -0.4) * LECTERN_SCALE;
const vec3 BOX_MAX = vec3(0.45, 1.34, 0.38) * LECTERN_SCALE;

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
                mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
                mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}

// Anti-aliased band: 1 inside [a, b], fading over the footprint w at each edge.
float aaBand(float x, float a, float b, float w) {
  return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x));
}

// Wall position -> (x from the nearest window's centre, y from the sill, window index -1..1).
vec3 winLocal(vec2 w) {
  float i = clamp(floor((w.x - WX) / PITCH + 0.5), -1.0, 1.0);
  return vec3(w.x - WX - i * PITCH, w.y - SILL, i);
}

// Signed distance (metres, > 0 inside) to a round-headed opening.
float archSd(vec2 q, float span, float spring) {
  float hw = span * 0.5;
  float d = min(hw - abs(q.x), q.y);
  if (q.y > spring) d = min(d, hw - length(vec2(q.x, q.y - spring)));
  return d;
}

float openingSd(vec2 w) {
  vec3 l = winLocal(w);
  bool c = l.z == 0.0;
  return archSd(l.xy, c ? C_SPAN : S_SPAN, c ? C_SPRING : S_SPRING);
}

// Glass transmission at wall position w, blurred by blur metres (at least the
// pixel footprint, so every frame edge is anti-aliased): 0 on the perimeter
// frame and the bars, ~1 through the panes. All three windows share one modern
// frame: a mullion and two transoms.
float windowMask(vec2 w, float blur) {
  blur = max(blur, 0.0005);
  vec3 l = winLocal(w);
  bool c = l.z == 0.0;
  float hw = (c ? C_SPAN : S_SPAN) * 0.5;
  float spring = c ? C_SPRING : S_SPRING;
  float frame = c ? 0.05 : 0.04;
  float inside = smoothstep(frame - blur, frame + blur, archSd(l.xy, hw * 2.0, spring));
  if (inside <= 0.0) return 0.0;
  float top = spring + hw;
  float bars = min(abs(l.x), min(abs(l.y - top * 0.36), abs(l.y - top * 0.7)));
  float barW = c ? 0.04 : 0.032;
  float glass = smoothstep(barW - blur, barW + blur, bars);
  glass *= 0.95 + 0.05 * sin(l.x * 19.0 + sin(l.y * 11.0) * 1.7); // faint frosted ripple
  return inside * mix(glass, 0.86, smoothstep(0.08, 0.3, blur));
}

// Soft glare from all three windows; summed so it is continuous between them.
float glareAt(vec2 w) {
  float g = 0.0;
  for (int i = -1; i <= 1; i++) {
    vec2 q = vec2(w.x - WX - float(i) * PITCH, w.y - SILL);
    bool c = i == 0;
    g += exp(-max(-archSd(q, c ? C_SPAN : S_SPAN, c ? C_SPRING : S_SPRING), 0.0) * 1.9);
  }
  return g;
}

vec3 sunDir() {
  vec3 l = normalize(BASE_L);
  float a = uPointer.x * 0.035;
  float b = uPointer.y * 0.025;
  l.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * l.xz;
  l.yz = mat2(cos(b), -sin(b), sin(b), cos(b)) * l.yz;
  return normalize(l);
}

// Sunlight reaching room point p (p.z < 0): it must pass the inner opening (z = 0)
// and the glass (z = WALL_D); the penumbra grows with distance behind the glass.
float sunlight(vec3 p, vec3 L, float extraBlur) {
  float t0 = p.z / L.z;
  float tg = (p.z - WALL_D) / L.z;
  vec2 w0 = p.xy - L.xy * t0;
  vec2 wg = p.xy - L.xy * tg;
  float pen = tg * 0.006 + extraBlur + 0.0005;
  float inner = smoothstep(-pen, pen, openingSd(w0));
  if (inner <= 0.0) return 0.0;
  return inner * windowMask(wg, pen);
}

// ---- The lectern and the open Bible: an SDF, marched only inside its box ----

vec3 lecternPos() {
  // Stand where light through the central window's lower panes meets the desk.
  vec3 l = normalize(BASE_L);
  vec3 aim = vec3(WX, SILL + AIM_Y, 0.0);
  vec3 p = aim + l * ((DESK_Y * LECTERN_SCALE - aim.y) / l.y);
  return vec3(p.x, 0.0, p.z);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// Lectern space -> desk space: y is the desk normal, -z runs down the slope to the reader.
vec3 deskLocal(vec3 p) {
  vec3 q = p - vec3(0.0, DESK_Y, 0.0);
  float c = cos(TILT), s = sin(TILT);
  return vec3(q.x, c * q.y - s * q.z, s * q.y + c * q.z);
}

const vec3 DESK_N = vec3(0.0, 0.92106, -0.38942); // desk normal in lectern space (cos, -sin TILT)

const float COVER_TOP = 0.034;

// Height of the open page surface above the cover: the paper rises out of a soft
// crease at the spine, arcs over, and thins toward the fore-edge. Well-thumbed
// paper is never flat: a slow wave crosses each page and the leaves lift at the fore-edge.
float pageTop(vec2 xz) {
  float a = sqrt(xz.x * xz.x + 0.00002);
  float side = xz.x < 0.0 ? -1.0 : 1.0;
  float h = 0.003 + 0.05 * (1.0 - exp(-a * 16.0)) * (1.0 - 0.35 * smoothstep(0.1, 0.326, a));
  h += 0.003 * smoothstep(0.02, 0.12, a) * sin(a * 17.0 + xz.y * 9.0 + 1.3 * sin(xz.y * 13.0 + side * 2.0));
  h += 0.005 * smoothstep(0.22, 0.326, a) * (0.5 + 0.5 * sin(xz.y * 11.0 + side * 1.7));
  return h;
}

// A rounded rectangle in the desk plane (corner radius r), bounded below and
// above by two distances; e rounds the rim, so no outline has a hard crease.
float sdPlate(vec2 xz, vec2 half2, float r, float below, float above, float e) {
  vec2 a = abs(xz) - half2 + r;
  float plan = length(max(a, 0.0)) + min(max(a.x, a.y), 0.0) - r;
  vec2 w = vec2(plan, max(below, above)) + e;
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - e;
}

// Materials: 1 wood, 2 leather cover, 3 pages. Unscaled lectern space.
float lecternSd0(vec3 p, out float mat) {
  // A modern stand: rounded base, rounded post, slanted desk with a low ledge.
  float d = sdRoundBox(p - vec3(0.0, 0.025, 0.0), vec3(0.23, 0.025, 0.19), 0.02);
  d = min(d, sdRoundBox(p - vec3(0.0, 0.56, 0.04), vec3(0.052, 0.53, 0.042), 0.03));
  vec3 q = deskLocal(p);
  d = min(d, sdRoundBox(q, vec3(0.37, 0.018, 0.27), 0.012));
  d = min(d, sdRoundBox(q - vec3(0.0, 0.022, -0.262), vec3(0.37, 0.014, 0.011), 0.009));
  mat = 1.0;
  // One leather board, open flat: a continuous rim a little larger than the pages.
  float cover = sdPlate(q.xz, vec2(0.348, 0.25), 0.02, 0.018 - q.y, q.y - COVER_TOP, 0.005);
  if (cover < d) { d = cover; mat = 2.0; }
  // The text block: rounded corners in plan, one curved page surface across the gutter.
  // The leaves are not quite flush, so the edges of the block ripple with height.
  float ragged = 0.001 * sin(q.y * 300.0) + 0.0006 * sin(q.y * 170.0 + q.x * 9.0 + q.z * 7.0);
  float top = (q.y - COVER_TOP - pageTop(q.xz)) * 0.75; // 0.75: the surface slopes up to 0.8
  float pages = sdPlate(q.xz, vec2(0.325, 0.23) + ragged, 0.012, 0.024 - q.y, top, 0.004);
  if (pages < d) { d = pages; mat = 3.0; }
  return d;
}

// The lectern turns about its post to face the sun, so the central mullion's
// shadow falls into the gutter instead of striping a page.
const vec2 FACE = vec2(0.25766, 0.96624); // -normalize(BASE_L.xz)

vec3 lecternTurn(vec3 v) {
  return vec3(FACE.y * v.x - FACE.x * v.z, v.y, FACE.x * v.x + FACE.y * v.z);
}

float lecternSd(vec3 p, out float mat) {
  return lecternSd0(lecternTurn(p) / LECTERN_SCALE, mat) * LECTERN_SCALE;
}

vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 a = (bmin - ro) * inv;
  vec3 b = (bmax - ro) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  return vec2(max(max(lo.x, lo.y), max(lo.z, 0.0)), min(min(hi.x, hi.y), hi.z));
}

// Ray in lectern space. x: hit distance, or the closest approach when missed
// (-1 when the box is missed); y: closest d/t (0 on a hit); z: 1 on a hit.
vec3 traceLectern(vec3 ro, vec3 rd, float tol) {
  vec2 span = boxHit(ro, rd, BOX_MIN, BOX_MAX);
  if (span.x >= span.y) return vec3(-1.0, 1.0, 0.0);
  float t = max(span.x, 0.001);
  float best = 1.0, bestT = t;
  float m;
  for (int i = 0; i < 48; i++) {
    float d = lecternSd(ro + rd * t, m);
    if (d < tol * t + 0.0002) return vec3(t, 0.0, 1.0);
    if (d / t < best) { best = d / t; bestT = t; }
    t += d;
    if (t > span.y) break;
  }
  return vec3(bestT, best, 0.0);
}

// Soft shadow of the lectern and book along rd (lectern space): 1 = unoccluded.
float lecternShadow(vec3 ro, vec3 rd) {
  vec2 span = boxHit(ro, rd, BOX_MIN, BOX_MAX);
  if (span.x >= span.y) return 1.0;
  float t = max(span.x, 0.004);
  float res = 1.0;
  float m;
  for (int i = 0; i < 16; i++) {
    float d = lecternSd(ro + rd * t, m);
    res = min(res, 12.0 * d / t);
    if (res < 0.002) break;
    t += clamp(d, 0.006, 0.1);
    if (t > span.y) break;
  }
  return smoothstep(0.0, 1.0, res);
}

struct Cam {
  vec3 ro, fw, rt, up;
  float zoom;
  float pixel; // radians per pixel of this pass
  bool band;
};

Cam camera() {
  Cam c;
  c.band = uRes.x / uRes.y > 1.6;
  // The desktop panel stands close to the lectern, a little above the open Bible, windows high behind; the phone band frames the windows.
  c.ro = c.band ? vec3(WX - 0.9, 4.6, -9.0) : vec3(0.65, 2.7, -6.75);
  vec3 ta = c.band ? vec3(WX - 0.75, 5.15, 0.0) : vec3(0.65, 2.45, 0.0);
  c.zoom = c.band ? 2.6 : 0.76;
  c.fw = normalize(ta - c.ro);
  c.rt = normalize(cross(vec3(0, 1, 0), c.fw));
  c.up = cross(c.fw, c.rt);
  c.pixel = 1.0 / (uRes.y * c.zoom);
  return c;
}

vec3 rayDir(Cam c, vec2 frag) {
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;
  return normalize(c.fw * c.zoom + c.rt * uv.x + c.up * uv.y);
}`;

const STATIC_SHADER = `#version 300 es
${COMMON}
// Baked once, supersampled: every surface, with every edge anti-aliased over
// its own pixel footprint. The composite filters it down to the display.

const vec3 PLASTER = vec3(0.62, 0.57, 0.5);

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// Where the central window's light meets the floor, for the warm bounce.
vec3 centralPatch(vec3 L) {
  vec3 a = vec3(WX, SILL + 1.6, 0.0);
  return a + L * (-a.y / L.y);
}

vec3 shadePlaster(vec3 p, vec3 sun, vec3 L) {
  float tex = 0.95 + 0.06 * noise3(vec3(p.xy * 1.6, 3.0));
  float glare = glareAt(p.xy);
  vec3 cf = centralPatch(L);
  float bounce = exp(-p.y * 0.5) * exp(-pow((p.x - cf.x) * 0.45, 2.0));
  vec3 amb = vec3(0.05, 0.045, 0.04) + sun * (0.11 * glare + 0.09 * bounce);
  return PLASTER * tex * amb * mix(0.55, 1.0, smoothstep(0.0, 1.2, p.y)); // soft contact shade at the floor
}

// Looking into an opening: the glass at z = WALL_D, or the plaster reveal before it.
vec3 shadeOpening(vec3 ro, vec3 rd, float tWall, float pixel, vec3 L, vec3 sun) {
  float tg = (WALL_D - ro.z) / rd.z;
  vec3 g = ro + rd * tg;
  float fp = tg * pixel;
  float gcov = smoothstep(-fp, fp, openingSd(g.xy));
  vec3 glassCol = vec3(0.0);
  vec3 revealCol = vec3(0.0);
  if (gcov > 0.0) {
    float m = windowMask(g.xy, fp * 1.2);
    float toSun = max(dot(rd, -L), 0.0);
    vec2 gl = winLocal(g.xy).xy;
    vec3 sky = mix(vec3(1.0, 0.95, 0.86), vec3(1.2, 1.02, 0.78), smoothstep(0.7, 0.97, toSun));
    float frost = 0.82 + 0.18 * noise3(vec3(g.xy * 3.0, 1.0));
    float glow = (1.7 + 3.0 * pow(toSun, 10.0)) * (0.8 + 0.2 * smoothstep(0.0, 4.0, gl.y)) * frost;
    glassCol = sky * sun * glow * m + vec3(0.1, 0.085, 0.07) * (1.0 - m);
  }
  if (gcov < 1.0) {
    float lo = tWall, hi = tg;
    for (int i = 0; i < 6; i++) {
      float mid = 0.5 * (lo + hi);
      if (openingSd((ro + rd * mid).xy) > 0.0) lo = mid; else hi = mid;
    }
    vec3 j = ro + rd * lo;
    float depth = clamp(j.z / WALL_D, 0.0, 1.0);
    vec2 q = winLocal(j.xy).xy;
    // The jamb that faces the sun (the left one, light travels -x) is the bright one.
    float facing = mix(1.0, 0.25, smoothstep(-0.06, 0.06, q.x));
    revealCol = PLASTER * (0.12 + 0.9 * facing * depth) * sun * 0.6;
  }
  return mix(revealCol, glassCol, gcov);
}

vec3 shadeWall(vec3 ro, vec3 rd, float tWall, float pixel, vec3 L, vec3 sun) {
  vec3 p = ro + rd * tWall;
  float fp = tWall * pixel;
  float cov = smoothstep(-fp, fp, openingSd(p.xy));
  vec3 col = cov < 1.0 ? shadePlaster(p, sun, L) : vec3(0.0);
  if (cov > 0.0) col = mix(col, shadeOpening(ro, rd, tWall, pixel, L, sun), cov);
  return col;
}

vec3 shadeFloor(vec3 ro, vec3 rd, float tFloor, float pixel, vec3 L, vec3 sun, bool band) {
  vec3 p = ro + rd * tFloor;
  float foot = tFloor * pixel;
  vec3 alb = vec3(0.34, 0.31, 0.28) * (0.92 + 0.12 * noise3(vec3(p.xz * 1.3, 0.0)));
  float lit = sunlight(p, L, foot);
  vec3 lp = lecternPos();
  float ao = 1.0;
  if (!band) {
    // The lectern stands in the beam: its long soft shadow, and contact shade at its base.
    if (lit > 0.0) lit *= lecternShadow(p - lp + vec3(0.0, 0.002, 0.0), -L);
    vec2 b = abs(lecternTurn(p - lp).xz) - vec2(0.21, 0.17) * LECTERN_SCALE;
    float bd = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
    ao = mix(0.45, 1.0, smoothstep(0.0, 0.18, bd));
  }
  float spill = sunlight(p, L, 0.5); // soft warm bounce around the patches
  vec3 col = alb * (0.05 + 0.05 * exp(p.z * 0.25)) * ao;
  col += alb * sun * lit * 1.5 * -L.y;
  col += sun * spill * 0.04 * ao;
  // Polished concrete: a soft reflection of the glowing windows.
  vec3 r = reflect(rd, vec3(0.0, 1.0, 0.0));
  if (r.z > 0.0) {
    float tr = -p.z / r.z;
    vec3 wp = p + r * tr;
    float gloss = 0.05 + tr * 0.06;
    float glow = smoothstep(-gloss, gloss, openingSd(wp.xy) - 0.04);
    float fres = 0.04 + 0.96 * pow(1.0 - max(-rd.y, 0.0), 5.0);
    col += sun * glow * fres * 1.4 * ao;
  }
  col += sun * lit * pow(max(dot(r, -L), 0.0), 40.0) * 0.6;
  return col;
}

// One shaded sample of the lectern and Bible. foot: metres per pixel at the hit.
vec3 shadeLectern(vec3 p, vec3 rd, vec3 lp, vec3 L, vec3 sun, float footW) {
  vec3 q = p - lp;
  vec3 qs = lecternTurn(q) / LECTERN_SCALE; // texture space: the unscaled, unturned stand
  float foot = footW / LECTERN_SCALE;
  float mat;
  lecternSd(q, mat);
  vec2 e = vec2(0.0007, -0.0007);
  float m;
  vec3 n = normalize(e.xyy * lecternSd(q + e.xyy, m) + e.yyx * lecternSd(q + e.yyx, m) +
                     e.yxy * lecternSd(q + e.yxy, m) + e.xxx * lecternSd(q + e.xxx, m));
  vec3 dq = deskLocal(qs);
  float ax = abs(dq.x);
  float topness = dot(lecternTurn(n), DESK_N);

  bool desk = dq.y > -0.024;
  float fine = 1.0 - smoothstep(0.003, 0.009, foot); // detail finer than a pixel fades to its mean
  vec3 alb;
  float gloss = 30.0, ks = 0.16;
  if (mat == 1.0) {
    // Warm wood: growth rings stretched along the grain, which runs across the desk and the base and up the post.
    vec3 gp = desk ? vec3(dq.x * 2.0, dq.zy * 34.0)
            : qs.y < 0.07 ? vec3(qs.x * 2.0, qs.zy * 34.0) : vec3(qs.y * 2.0, qs.xz * 34.0);
    float fig = noise3(gp);
    float rings = 0.5 + 0.5 * sin((gp.y + fig * 2.5) * 6.0);
    float grain = 0.55 * rings + 0.45 * noise3(gp * vec3(1.0, 3.0, 3.0) + 7.0);
    grain = mix(grain, 0.5, smoothstep(0.004, 0.012, foot)); // fade when finer than a pixel
    alb = mix(vec3(0.2, 0.1, 0.05), vec3(0.4, 0.225, 0.115), grain);
    alb *= 0.88 + 0.24 * noise3(qs * 9.0); // the stain took unevenly
    gloss = 48.0; ks = 0.2;
  } else if (mat == 2.0) {
    // Worn leather: a pebbled grain in colour, normal and sheen, rubbed pale along the rounded rim.
    float grainL = mix(0.5, noise3(qs * 120.0), fine);
    vec3 bump = vec3(noise3(qs * 120.0 + 11.0), noise3(qs * 120.0 + 23.0), noise3(qs * 120.0 + 37.0)) - 0.5;
    n = normalize(n + 0.45 * fine * bump);
    float wear = smoothstep(0.15, 0.5, topness) * (1.0 - smoothstep(0.8, 0.99, topness));
    wear *= 0.35 + 0.65 * noise3(qs * 40.0);
    alb = vec3(0.1, 0.048, 0.035) * (0.78 + 0.44 * grainL);
    alb = mix(alb, vec3(0.3, 0.18, 0.115), 0.55 * wear);
    gloss = mix(9.0, 22.0, grainL); ks = 0.03 + 0.06 * grainL;
  } else {
    float sgn = dq.x < 0.0 ? -1.0 : 1.0;
    // Thin paper, a little yellowed and mottled with handling, warmer toward the thumbed edges.
    float rim = max(smoothstep(0.23, 0.326, ax), smoothstep(0.15, 0.231, abs(dq.z)));
    vec3 cream = mix(vec3(0.9, 0.86, 0.76), vec3(0.86, 0.76, 0.58), 0.5 * rim);
    cream *= 0.93 + 0.12 * noise3(vec3(dq.xz * 28.0, sgn * 3.0));
    // Edges of the block: irregular leaves, some standing proud, under worn gilding.
    float side = 1.0 - smoothstep(0.3, 0.6, topness);
    float v = dq.y + 0.004 * noise3(vec3(dq.xz * 14.0, 5.0)); // the leaves fan a little
    float leaf = noise3(vec3(v * 130.0, 0.5, sgn * 3.0));
    float hair = noise3(vec3(v * 340.0, 9.5, sgn * 2.0));
    float stri = mix(0.5, 0.6 * leaf + 0.4 * mix(0.5, hair, fine), 1.0 - smoothstep(0.006, 0.014, foot));
    float gilt = 0.25 + 0.3 * noise3(vec3(dq.xz * 22.0, 8.0));
    vec3 edge = mix(cream, vec3(0.83, 0.61, 0.28), gilt) * (0.62 + 0.5 * stri);
    // Top: four columns of text, never readable. Lines of uneven words; a paragraph's last
    // line stops short, and each column has one break with a short heading.
    float w = foot * 1.2;
    float inner = ax < 0.167 ? 0.0 : 1.0;
    float colId = sgn * (1.0 + inner);
    float cx0 = inner < 0.5 ? 0.036 : 0.176;
    float cols = aaBand(ax, cx0, cx0 + 0.122, w) * aaBand(dq.z, -0.2, 0.196, w);
    float u = (ax - cx0) / 0.122;
    if (sgn < 0.0) u = 1.0 - u;
    const float lineSp = 0.009;
    float rowId = floor(dq.z / lineSp);
    float rowf = abs(fract(dq.z / lineSp) - 0.5);
    float hr = hash12(vec2(rowId + 40.0, colId * 7.0 + 30.0));
    float dr = rowId - floor(mix(-14.0, 12.0, hash12(vec2(colId + 9.0, 5.0))));
    float lo = 0.0, hi = hr < 0.14 ? 0.3 + 3.5 * hr : 1.0, weight = 1.0;
    if (dr == 0.0) { lo = 0.22; hi = 0.78; weight = 1.5; }
    float len = abs(dr) == 1.0 ? 0.0 : aaBand(u, lo, hi, w / 0.122);
    float words = smoothstep(0.24, 0.44, noise3(vec3(u * 15.0, rowId * 3.7, colId * 5.1)));
    words = mix(words, 0.74, smoothstep(0.25, 0.9, foot * 15.0 / 0.122));
    float stroke = 1.0 - smoothstep(0.14, 0.32, rowf);
    stroke = mix(stroke, 0.46, smoothstep(0.2, 0.5, foot / lineSp));
    float ink = cols * len * words * stroke * weight;
    vec3 top = mix(cream, vec3(0.2, 0.18, 0.17), min(0.4 * ink, 0.6));
    top *= mix(0.5, 1.0, smoothstep(0.0, 0.085, ax)); // the paper darkens into the gutter
    alb = mix(top, edge, side);
    gloss = mix(8.0, 30.0, side); ks = mix(0.03, 0.22, side); // the gilt edge takes a sheen
  }

  float sh = lecternShadow(q + n * 0.004, -L);
  float lit = sunlight(p + n * 0.003, L, footW) * sh;
  float diff = max(dot(n, -L), 0.0);
  // Ambient occlusion from three steps along the normal.
  float occ = 0.0;
  for (int i = 1; i <= 3; i++) {
    float h = 0.012 * float(i);
    occ += (h - lecternSd(q + n * h, m)) / h;
  }
  float ao = clamp(1.0 - 0.3 * occ, 0.25, 1.0);
  // Contact shade: the book resting on the desk, and the text block over the cover's rim.
  float contact = 1.0;
  if (mat == 1.0 && desk) {
    vec2 b = abs(dq.xz) - vec2(0.348, 0.25);
    contact = mix(0.35, 1.0, smoothstep(0.0, 0.045, length(max(b, 0.0)) + min(max(b.x, b.y), 0.0)));
  } else if (mat == 2.0) {
    vec2 b = abs(dq.xz) - vec2(0.326, 0.231);
    contact = mix(0.45, 1.0, smoothstep(0.0, 0.02, max(b.x, b.y)));
  }
  vec3 amb = vec3(0.06, 0.053, 0.046) * (0.6 + 0.4 * n.y) + sun * 0.05 * max(-n.y, 0.0) + sun * 0.02;
  // Room fill from the reader's side, so faces turned from the sun keep their form.
  amb += vec3(0.12, 0.105, 0.09) * (0.5 + 0.5 * dot(n, vec3(-0.553, 0.352, -0.755)));
  if (mat == 1.0 && !desk) {
    amb *= mix(0.55, 1.0, smoothstep(0.0, 0.35, DESK_Y - 0.05 - qs.y)); // the desk shades the post
    amb += sun * 0.05 * exp(-qs.y * 3.0);                                // warm bounce off the floor
  }
  // The low ledge sits in the book's shade; without this, slivers of it catch the sun as specks.
  float ledge = mat == 1.0 && desk ? smoothstep(0.018, 0.03, dq.y) * smoothstep(-0.238, -0.25, dq.z) : 0.0;
  lit *= 1.0 - 0.75 * ledge;
  vec3 col = alb * (amb * ao * contact + sun * lit * diff * 1.7 * mix(0.75, 1.0, contact));
  if (mat == 3.0) {
    // Sun through thin paper: a warm glow, strongest where the leaves thin out at the edges.
    float thin = max(smoothstep(0.2, 0.326, ax), smoothstep(0.13, 0.231, abs(dq.z)));
    col += alb * sun * vec3(1.0, 0.86, 0.66) * lit * (0.1 + 0.22 * thin * (1.0 - 0.6 * diff));
  }
  vec3 h = normalize(-L - rd);
  col += sun * lit * ks * pow(max(dot(n, h), 0.0), gloss) * contact;
  // Varnish: rounded edges and the desk pick up a faint reflection of the windows.
  vec3 r = reflect(rd, n);
  if (mat == 1.0 && r.z > 0.02) {
    vec3 wp = p + r * (-p.z / r.z);
    float fres = 0.04 + 0.6 * pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
    col += sun * min(glareAt(wp.xy), 1.0) * fres * (desk ? 0.7 : 0.35) * ao * contact;
  }
  return col;
}

// The lectern seen through a pixel sample: rgb shade, a coverage (silhouettes
// fade continuously by the ray's closest approach, so edges never step).
vec4 sampleLectern(Cam cam, vec3 rd, vec3 lp, vec3 L, vec3 sun, float pix) {
  vec3 tr = traceLectern(cam.ro - lp, rd, pix * 0.4);
  if (tr.x < 0.0) return vec4(0.0);
  float cov = tr.z > 0.5 ? 1.0 : 1.0 - smoothstep(0.0, pix, tr.y);
  if (cov <= 0.0) return vec4(0.0);
  vec3 p = cam.ro + rd * tr.x;
  return vec4(shadeLectern(p, rd, lp, L, sun, tr.x * pix), cov);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  Cam cam = camera();
  vec3 ro = cam.ro;
  vec3 rd = rayDir(cam, frag);
  float pixel = cam.pixel;
  vec3 L = sunDir();
  vec3 sun = SUN_COL;

  // Wall and floor, blended across the horizon over one pixel footprint.
  float tWall = -ro.z / rd.z;
  vec3 pw = ro + rd * tWall;
  float fpw = tWall * pixel;
  float floorCov = 1.0 - smoothstep(-fpw, fpw, pw.y);
  vec3 col = vec3(0.0);
  float cover = 0.0;
  if (floorCov < 1.0) col = shadeWall(ro, rd, tWall, pixel, L, sun);
  if (floorCov > 0.0 && rd.y < 0.0) {
    col = mix(col, shadeFloor(ro, rd, -ro.y / rd.y, pixel, L, sun, cam.band), floorCov);
  }

  // The lectern and Bible: one sample, and 4 rotated-grid samples wherever the
  // 2x2 pixel quad sees an edge (silhouette, material or crease).
  if (!cam.band) {
    vec3 lp = lecternPos();
    vec4 lc = sampleLectern(cam, rd, lp, L, sun, pixel);
    float lum = dot(lc.rgb, vec3(0.3, 0.5, 0.2));
    bool edge = fwidth(lc.a) > 0.002 || fwidth(lum) > 0.12;
    if (edge) {
      vec3 sum = vec3(0.0);
      float w = 0.0;
      vec2 offs[4] = vec2[4](vec2(0.125, 0.375), vec2(-0.375, 0.125), vec2(-0.125, -0.375), vec2(0.375, -0.125));
      for (int i = 0; i < 4; i++) {
        vec4 s = sampleLectern(cam, rayDir(cam, frag + offs[i]), lp, L, sun, pixel * 0.5);
        sum += s.rgb * s.a;
        w += s.a;
      }
      lc = vec4(w > 0.0 ? sum / w : vec3(0.0), w * 0.25);
    }
    col = mix(col, lc.rgb, lc.a);
    cover = lc.a;
  }

  // Bloom of the bright glass.
  col += sun * glareAt(pw.xy) * 0.07;
  // Alpha carries the lectern's coverage, so the composite can hide the air behind it.
  // Range-compressed, so the composite's downsample is tone-weighted and an 8-bit target has headroom.
  outColor = vec4(col / (1.0 + max(col.r, max(col.g, col.b))), cover);
}
`;

const SHAFT_SHADER = `#version 300 es
${COMMON}
// Baked once: the light shafts in the room air. They are soft, but they end at the
// lectern's silhouette, so they are supersampled with the scene on a 1x display.
void main() {
  vec2 frag = gl_FragCoord.xy;
  Cam cam = camera();
  vec3 ro = cam.ro;
  vec3 rd = rayDir(cam, frag);
  vec3 L = sunDir();

  float tWall = -ro.z / rd.z;
  float tFloor = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  float tHit = min(tWall, tFloor);
  // Lit air ends at the lectern too, so the shafts in front of it are exact (no seam at the horizon).
  if (!cam.band) {
    vec3 tr = traceLectern(ro - lecternPos(), rd, cam.pixel * 0.4);
    if (tr.z > 0.5) tHit = min(tHit, tr.x);
  }

  float tStart = max((-6.5 - ro.z) / rd.z, 0.0);
  float tEnd = min(tHit, 40.0);
  const int STEPS = 22;
  float dt = max(tEnd - tStart, 0.0) / float(STEPS);
  float jitter = fract(dot(frag, vec2(0.7548776662, 0.5698402910))); // R2: even, unpatterned
  float cosT = dot(L, -rd);
  float gg = 0.55;
  float phase = (1.0 - gg * gg) / pow(1.0 + gg * gg - 2.0 * gg * cosT, 1.5);
  float shaft = 0.0;
  vec3 drift = vec3(0.1, 0.03, -0.05) * uTime;
  float hazeA = noise3((ro + rd * (tStart + dt * 6.0)) * 0.8 + drift);
  float hazeB = noise3((ro + rd * (tStart + dt * 16.0)) * 0.8 + drift);
  #ifndef NO_SHAFT
  for (int i = 0; i < STEPS; i++) {
    vec3 q = ro + rd * (tStart + dt * (float(i) + jitter));
    if (q.z >= 0.0 || q.y <= 0.0) continue;
    // Blurred to the step size: soft shafts; bar shadows still show near the glass.
    float l = sunlight(q, L, 0.12 - q.z * 0.05);
    if (l <= 0.0) continue;
    float haze = 0.4 + 0.6 * mix(hazeA, hazeB, float(i) / float(STEPS));
    shaft += l * haze * dt;
  }
  #endif
  // Stored at a quarter so an 8-bit target (no float buffers) still has headroom.
  outColor = vec4(vec3(shaft * phase * 0.27 * 0.25), 1.0);
}
`;

const COMPOSITE_SHADER = `#version 300 es
${COMMON}
uniform sampler2D uStatic;
uniform sampler2D uShafts;
uniform float uTap;     // downsample tap offset, in output pixels
uniform vec2 uHand;     // pointer in render pixels (GL origin, bottom-left)
uniform float uHandOn;  // eased 0..1 while the pointer is over the panel

// Cheap 2D value noise for the haze drifting through the baked shafts.
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 s = frag / uRes;
  bool band = uRes.x / uRes.y > 1.6;
  // A cloud passing: the light swells and settles, never strobes.
  float breath = 1.0 + 0.1 * sin(uTime * 0.5) * (0.6 + 0.4 * sin(uTime * 0.19 + 1.3));
  vec3 sun = SUN_COL * breath;

  // Baked shafts, softened over their texel (march jitter). They must stay registered
  // with the baked scene: the lectern's silhouette lives in both layers.
  // Half a texel at display resolution; three quarters (a tent) when the shafts were supersampled.
  vec2 shaftSize = vec2(textureSize(uShafts, 0));
  vec2 st = clamp(0.5 + 0.5 * shaftSize.x / uRes.x, 1.0, 1.5) / shaftSize;
  vec2 su = frag / uRes;
  float shaft = 0.25 * (texture(uShafts, su + st * vec2(0.5, 0.5)).r + texture(uShafts, su + st * vec2(-0.5, 0.5)).r +
                        texture(uShafts, su + st * vec2(0.5, -0.5)).r + texture(uShafts, su + st * vec2(-0.5, -0.5)).r);
  // The scene was baked supersampled and range-compressed. Four bilinear taps make a tent
  // over the source texels; averaging before expanding keeps bright glass edges smooth.
  vec2 tap = uTap / uRes;
  vec3 enc = 0.25 * (texture(uStatic, s + tap).rgb + texture(uStatic, s - tap).rgb +
                     texture(uStatic, s + vec2(tap.x, -tap.y)).rgb + texture(uStatic, s + vec2(-tap.x, tap.y)).rgb);
  vec3 col = enc / max(1.0 - max(enc.r, max(enc.g, enc.b)), 0.004) * breath;
  // Haze drifting through the beams: two slow octaves over the baked shafts.
  vec2 hz = frag / uRes.y;
  float haze = 0.62 * vnoise(hz * 3.0 + vec2(0.02, -0.035) * uTime) + 0.38 * vnoise(hz * 7.0 - vec2(0.03, 0.02) * uTime);
  col += sun * shaft * 4.0 * (0.7 + 0.6 * haze);

  // Dust: sparse soft motes drifting in screen space, visible only where a beam lights the air.
  vec2 cell = vec2(46.0) * (uRes.y / 900.0);
  // A hand passing through the light: the air it touches glows a little and the
  // dust swirls away from it. Nothing in the room moves, so light and scene agree.
  vec2 toHand = frag - uHand;
  float handD = length(toHand) / uRes.y;
  float touch = uHandOn * exp(-handD * handD / 0.006);
  col += sun * shaft * 1.8 * touch;
  vec2 dp = frag + vec2(sin(uTime * 0.07) * 18.0, uTime * 6.0) * (uRes.y / 900.0);
  dp += toHand / max(length(toHand), 1.0) * 34.0 * touch * (uRes.y / 900.0);
  vec2 id = floor(dp / cell);
  float h = hash12(id);
  if (h > 0.86) {
    vec2 c = vec2(hash12(id + 3.1), hash12(id + 7.7)) * 0.8 + 0.1;
    float r = length(fract(dp / cell) - c) * cell.x / (1.2 + 1.6 * hash12(id + 5.3)) / (uRes.y / 900.0);
    col += sun * exp(-r * r) * min(shaft * 14.0, 1.0) * (h - 0.84) * 3.0;
  }

  col = aces(col * 1.35);
  // Fall away into darkness at the edges; keep the brand mark and tagline quiet.
  if (!band) {
    float v = smoothstep(1.15, 0.35, length((s - vec2(0.55, 0.45)) * vec2(1.3, 1.0)));
    col *= mix(0.35, 1.0, v);
    float corner = smoothstep(0.4, 0.0, length((s - vec2(0.0, 1.0)) * vec2(1.0, 1.8)));
    corner += smoothstep(0.62, 0.0, length((s - vec2(0.0, 0.0)) * vec2(1.0, 3.6)));
    col *= 1.0 - 0.7 * clamp(corner, 0.0, 1.0);
    col *= 1.0 - 0.88 * smoothstep(0.2, 0.06, s.y) * smoothstep(0.75, 0.45, s.x); // tagline stays >= 4.5:1
  } else {
    col *= 1.0 - 0.72 * smoothstep(0.55, 0.0, s.x);
  }
  col = pow(col, vec3(1.0 / 1.08));
  col += (hash12(frag + fract(uTime) * 61.0) - 0.5) / 160.0;
  outColor = vec4(col, 1.0);
}
`;

/** Seconds into the animation the bake is taken at, chosen for a settled composition. */
const BAKE_TIME = 40;
// Quality levels tried in order: [supersampling of the baked scene per axis, device
// pixel ratio cap]. A slow device gives up supersampling first and resolution last.
const QUALITY: [number, number][] = [
  [2, 2],
  [1.5, 2],
  [1, 2],
  [1, 1.5],
  [1, 1],
];
// A bake projected to take longer than this (all strips together) steps the quality down.
const BAKE_BUDGET_MS = 2500;
// Each bake strip should cost about this much, so no single frame blocks for long.
const STRIP_BUDGET_MS = 12;
// The ambient motion is slow; 30fps is plenty and halves the work.
const FRAME_MS = 1000 / 30;
// This many consecutive late frames means the composite is too heavy: step down.
const SLOW_FRAME_MS = 50;
const HAND_EASE_PER_SECOND = 4;
const SLOW_FRAME_LIMIT = 45;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function link(gl: WebGL2RenderingContext, vertex: WebGLShader, source: string) {
  const fragment = compile(gl, gl.FRAGMENT_SHADER, source);
  const program = gl.createProgram();
  if (!fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(fragment);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

function createTarget(gl: WebGL2RenderingContext): Target {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, width: 0, height: 0 };
}

function sizeTarget(
  gl: WebGL2RenderingContext,
  target: Target,
  width: number,
  height: number,
  float: boolean,
) {
  target.width = width;
  target.height = height;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    float ? gl.RGBA16F : gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
    null,
  );
}

/**
 * Runs the scene on `canvas`. Everything costly (surfaces and light shafts) is
 * baked once per size, in strips across frames; each frame then runs one cheap
 * composite pass. `onReady` fires after the first bake, `onUnsupported` when
 * WebGL2 is missing or lost. Returns cleanup.
 */
function startScene(
  canvas: HTMLCanvasElement,
  onReady: () => void,
  onUnsupported: () => void,
) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
  });
  const vertex = gl && compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const staticProgram = gl && vertex && link(gl, vertex, STATIC_SHADER);
  const shaftProgram = gl && vertex && link(gl, vertex, SHAFT_SHADER);
  const compositeProgram = gl && vertex && link(gl, vertex, COMPOSITE_SHADER);
  if (!gl || !vertex || !staticProgram || !shaftProgram || !compositeProgram) {
    onUnsupported();
    return () => {};
  }
  gl.bindVertexArray(gl.createVertexArray());
  const float = Boolean(gl.getExtension('EXT_color_buffer_float'));
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const surfaces = createTarget(gl);
  const shafts = createTarget(gl);
  const programs = [staticProgram, shaftProgram, compositeProgram];
  const probe = float ? new Float32Array(4) : new Uint8Array(4);

  const uniform = (program: WebGLProgram, name: string) =>
    gl.getUniformLocation(program, name);
  const setCommon = (program: WebGLProgram, width: number, height: number) => {
    gl.useProgram(program);
    gl.uniform2f(uniform(program, 'uRes'), width, height);
    gl.uniform1f(uniform(program, 'uTime'), BAKE_TIME);
    gl.uniform2f(uniform(program, 'uPointer'), 0, 0);
  };

  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  let level = 0;
  let tap = 0;
  let strips = 0;
  let frame = 0;
  let lastStamp = 0;
  let lastDraw = 0;
  let elapsed = BAKE_TIME;
  // The pointer, in CSS pixels relative to the canvas; eased toward the target.
  const hand = { x: 0, y: 0, on: 0 };
  const handTarget = { x: 0, y: 0, on: 0 };
  let onScreen = true;
  let slowFrames = 0;
  // Diagnostics, mirrored onto the canvas once a second.
  let drawn = 0;
  let drawMs = 0;
  let reported = 0;
  let ready = false;
  // Bake progress: rows done per target, rows per strip (tuned by measuring).
  let baking = false;
  let bakeRow = 0;
  let stripRows = 32;
  let bakeStarted = 0;
  let firstBake = true;

  const supersample = () => QUALITY[level]?.[0] ?? 1;
  const ratio = () =>
    Math.min(window.devicePixelRatio || 1, QUALITY[level]?.[1] ?? 1);
  // Moves to the next level that changes anything on this display, and rebakes.
  const stepDown = () => {
    const before = [supersample(), ratio()];
    while (level < QUALITY.length - 1) {
      level += 1;
      if (supersample() !== before[0] || ratio() !== before[1]) {
        resize();
        return true;
      }
    }
    return false;
  };

  // Bakes rows [bakeRow, bakeRow + stripRows) of both caches, measured with a 1-pixel read.
  const bakeStrip = () => {
    const started = performance.now();
    const passes: [Target, WebGLProgram][] = [
      [surfaces, staticProgram],
      [shafts, shaftProgram],
    ];
    gl.enable(gl.SCISSOR_TEST);
    for (const [target, program] of passes) {
      // The shafts may bake smaller than the scene: the same rows, scaled.
      const scale = target.height / surfaces.height;
      const y0 = Math.floor(bakeRow * scale);
      const y1 = Math.ceil((bakeRow + stripRows) * scale);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.scissor(0, y0, target.width, Math.max(y1 - y0, 1));
      setCommon(program, target.width, target.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
    // Wait for the strip: one pixel of it, read in the scene target's own format.
    gl.bindFramebuffer(gl.FRAMEBUFFER, surfaces.framebuffer);
    gl.readPixels(
      0,
      Math.min(bakeRow, surfaces.height - 1),
      1,
      1,
      gl.RGBA,
      float ? gl.FLOAT : gl.UNSIGNED_BYTE,
      probe,
    );
    const spent = performance.now() - started;
    const perRow = spent / stripRows;
    bakeRow += stripRows;
    strips += 1;
    // The first strip also pays for the driver compiling the shaders: never judge by it.
    if (strips > 1) {
      stripRows = Math.max(
        8,
        Math.round(STRIP_BUDGET_MS / Math.max(perRow, 0.001)),
      );
      if (perRow * surfaces.height > BAKE_BUDGET_MS && stepDown()) return;
    }
    if (bakeRow >= surfaces.height) {
      baking = false;
      canvas.dataset.bakeMs = String(
        Math.round(performance.now() - bakeStarted),
      );
      canvas.dataset.pixelRatio = String(ratio());
      canvas.dataset.supersample = String(surfaces.width / canvas.width);
      if (!ready) {
        ready = true;
        onReady();
      }
    }
  };

  const draw = () => {
    const started = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(compositeProgram);
    gl.uniform2f(
      uniform(compositeProgram, 'uRes'),
      canvas.width,
      canvas.height,
    );
    gl.uniform1f(uniform(compositeProgram, 'uTime'), elapsed);
    gl.uniform2f(uniform(compositeProgram, 'uPointer'), 0, 0);
    gl.uniform1f(uniform(compositeProgram, 'uTap'), tap);
    const scale = canvas.width / Math.max(1, canvas.clientWidth);
    gl.uniform2f(
      uniform(compositeProgram, 'uHand'),
      hand.x * scale,
      canvas.height - hand.y * scale,
    );
    gl.uniform1f(uniform(compositeProgram, 'uHandOn'), hand.on);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, surfaces.texture);
    gl.uniform1i(uniform(compositeProgram, 'uStatic'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shafts.texture);
    gl.uniform1i(uniform(compositeProgram, 'uShafts'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawn += 1;
    drawMs = performance.now() - started;
  };

  const tick = (stamp: number) => {
    frame = requestAnimationFrame(tick);
    if (baking) {
      bakeStrip();
      if (!baking && ready) draw();
      return;
    }
    if (reduceMotion) {
      draw();
      cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    if (lastDraw && stamp - lastDraw < FRAME_MS - 2) return;
    const gap = lastDraw ? stamp - lastDraw : 0;
    const dt = lastStamp ? Math.min((stamp - lastStamp) / 1000, 0.1) : 0;
    lastStamp = stamp;
    lastDraw = stamp;
    elapsed += dt;
    const ease = 1 - Math.exp(-dt * HAND_EASE_PER_SECOND);
    hand.x += (handTarget.x - hand.x) * ease;
    hand.y += (handTarget.y - hand.y) * ease;
    hand.on += (handTarget.on - hand.on) * ease;
    draw();
    if (stamp - reported > 1000) {
      reported = stamp;
      canvas.dataset.frames = String(drawn);
      canvas.dataset.drawMs = drawMs.toFixed(2);
    }
    // Persistently late frames on a weak device: bake smaller and carry on.
    slowFrames = gap > SLOW_FRAME_MS ? slowFrames + 1 : 0;
    if (slowFrames > SLOW_FRAME_LIMIT) {
      slowFrames = 0;
      stepDown();
    }
  };

  const sync = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastStamp = 0;
    lastDraw = 0;
    if ((onScreen && !document.hidden) || baking) {
      frame = requestAnimationFrame(tick);
    }
  };

  const resize = () => {
    const r = ratio();
    // The backing store matches the CSS size exactly, so the browser never rescales it.
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * r));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * r));
    // The scene bakes supersampled, as far as the GPU's texture limit allows.
    const ss = Math.min(
      supersample(),
      maxSize / canvas.width,
      maxSize / canvas.height,
    );
    sizeTarget(
      gl,
      surfaces,
      Math.max(1, Math.floor(canvas.width * ss)),
      Math.max(1, Math.floor(canvas.height * ss)),
      float,
    );
    // 0.75 of a source texel at 2x: a [1 3 3 1] tent per axis; nothing at 1x.
    tap = 0.375 * Math.max(surfaces.width / canvas.width - 1, 0);
    strips = 0;
    sizeTarget(
      gl,
      shafts,
      Math.max(1, Math.min(surfaces.width, Math.ceil(canvas.clientWidth * ss))),
      Math.max(
        1,
        Math.min(surfaces.height, Math.ceil(canvas.clientHeight * ss)),
      ),
      float,
    );
    baking = true;
    bakeRow = 0;
    stripRows = firstBake ? 16 : stripRows;
    firstBake = false;
    bakeStarted = performance.now();
    sync();
  };

  // The panel, not the canvas: the brand mark and tagline sit above the scene.
  const host = canvas.parentElement?.parentElement ?? canvas;
  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    handTarget.x = event.clientX - rect.left;
    handTarget.y = event.clientY - rect.top;
    if (handTarget.on === 0) {
      hand.x = handTarget.x;
      hand.y = handTarget.y;
    }
    handTarget.on = 1;
  };
  const onPointerLeave = () => {
    handTarget.on = 0;
  };
  if (!reduceMotion) {
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);
  }

  const onContextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    onUnsupported();
  };

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas);
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    sync();
  });
  visibility.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', onContextLost);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    visibility.disconnect();
    document.removeEventListener('visibilitychange', sync);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    host.removeEventListener('pointermove', onPointerMove);
    host.removeEventListener('pointerleave', onPointerLeave);
    for (const program of programs) gl.deleteProgram(program);
    for (const target of [surfaces, shafts]) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }
    gl.deleteShader(vertex);
  };
}

/**
 * Decorative: a modern church at early morning. Three round-arched windows in
 * a plaster wall; light falls through them onto an open Bible on a lectern.
 * The glass, the shafts and every lit patch come from one window mask and one
 * sun direction, so the light always matches the windows. WebGL2, baked once
 * per size and composited at 30fps; the CSS approximation shows until the first
 * bake is ready (and stays without WebGL2). Fills its positioned parent.
 */
export function SanctuaryLightScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'baking' | 'ready' | 'unsupported'>(
    'baking',
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startScene(
      canvas,
      () => setState('ready'),
      () => setState('unsupported'),
    );
  }, []);

  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      <div className="sanctuary-light-fallback absolute inset-0" />
      {state !== 'unsupported' && (
        <canvas
          ref={canvasRef}
          className="sanctuary-light-canvas relative block size-full"
          data-ready={state === 'ready'}
        />
      )}
    </div>
  );
}
