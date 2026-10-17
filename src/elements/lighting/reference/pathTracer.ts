// Traçador de caminhos de referência na CPU (spec 033, R8; só para testes e smokes): a luz física das cenas pequenas dos smokes de iluminação
// global (Cornell box, cômodo com janela, caixa fechada, ambiente branco, névoa) — difuso de Lambert, espelho, emissão,
// luzes da 011 (direcional em lux, pontual em candela), céu por função e meios participantes (homogêneos ou por
// densidade, fase de Henyey-Greenstein). Amostragem determinística (hash por pixel e amostra); o número de rebatimentos é
// fixo, o mesmo do alvo. Saída: a radiância HDR por pixel e a instância vista, para medir por região.

export type Vec3 = readonly [number, number, number];

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const mul = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));
const exp3 = (a: Vec3): Vec3 => [Math.exp(a[0]), Math.exp(a[1]), Math.exp(a[2])];
const ZERO: Vec3 = [0, 0, 0];
const EPS = 1e-4;

/** Material de uma superfície. */
export interface PtMaterial {
    /** Albedo difuso (Lambert). */
    readonly albedo: Vec3;
    /** Radiância emitida (dos dois lados nos quadriláteros). */
    readonly emission?: Vec3;
    /** Espelho perfeito com esta refletância (sem difuso). */
    readonly mirror?: Vec3;
}

/** Caixa (opcionalmente girada em torno do eixo y pelo centro). */
export interface PtBox {
    readonly kind: 'box';
    readonly min: Vec3;
    readonly max: Vec3;
    /** Rotação em torno de y, em radianos. */
    readonly rotationY?: number;
}

/** Esfera. */
export interface PtSphere {
    readonly kind: 'sphere';
    readonly center: Vec3;
    readonly radius: number;
}

/** Quadrilátero `corner + s·u + t·v` (s, t em [0, 1]), dos dois lados. */
export interface PtQuad {
    readonly kind: 'quad';
    readonly corner: Vec3;
    readonly u: Vec3;
    readonly v: Vec3;
}

/** Objeto da cena: forma, material e o id da região (máscara). */
export interface PtObject {
    readonly id: number;
    readonly shape: PtBox | PtSphere | PtQuad;
    readonly material: PtMaterial;
}

/** Luzes da 011: direcional (direção de propagação, lux) e pontual (candela). */
export type PtLight =
    | { readonly kind: 'directional'; readonly direction: Vec3; readonly illuminance: Vec3 }
    | { readonly kind: 'point'; readonly position: Vec3; readonly intensity: Vec3 };

/** Meio participante numa caixa: coeficientes na densidade 1 e a densidade em [0, 1] por ponto (padrão 1). */
export interface PtMedium {
    readonly min: Vec3;
    readonly max: Vec3;
    readonly scattering: Vec3;
    readonly absorption: Vec3;
    /** Anisotropia de Henyey-Greenstein. */
    readonly g: number;
    readonly density?: (p: Vec3) => number;
}

/** Cena do traçador. */
export interface PtScene {
    readonly objects: readonly PtObject[];
    readonly lights?: readonly PtLight[];
    /** Radiância do céu por direção (raios que escapam). */
    readonly sky?: (dir: Vec3) => Vec3;
    readonly media?: readonly PtMedium[];
}

/** Câmera estenopeica. */
export interface PtCamera {
    readonly position: Vec3;
    readonly target: Vec3;
    /** Campo de visão vertical em radianos. */
    readonly fovY: number;
    readonly up?: Vec3;
}

/** Opções da renderização. */
export interface PtOptions {
    readonly width: number;
    readonly height: number;
    readonly samples: number;
    /** Rebatimentos indiretos (0 = só luz direta). */
    readonly bounces: number;
    /** Meio: espalhamento simples por marcha (determinístico) ou caminhos completos. Padrão `'full'`. */
    readonly media?: 'single' | 'full';
    /** Passos da marcha do espalhamento simples. Padrão 256. */
    readonly marchSteps?: number;
    /** Só a luz indireta (descarta a direta na primeira superfície). */
    readonly indirectOnly?: boolean;
}

/** Imagem HDR e a instância vista por pixel (−1 = nada). */
export interface PtImage {
    readonly width: number;
    readonly height: number;
    readonly rgb: Float32Array;
    readonly ids: Int32Array;
}

interface Hit {
    readonly t: number;
    readonly normal: Vec3;
    readonly object: PtObject;
}

/** Gerador determinístico por (pixel, amostra, dimensão): hash PCG. */
function hash(a: number, b: number, c: number): number {
    let s = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77) ^ Math.imul(c, 0xc2b2ae3d)) >>> 0;
    s = (Math.imul(s, 747796405) + 2891336453) >>> 0;
    const w = Math.imul((s >>> ((s >>> 28) + 4)) ^ s, 277803737) >>> 0;
    return ((w >>> 22) ^ w) >>> 0;
}

class Rng {
    private dim = 0;
    constructor(
        private readonly pixel: number,
        private readonly sample: number,
    ) {}
    next(): number {
        return hash(this.pixel, this.sample, this.dim++) / 4294967296;
    }
}

function intersectBox(box: PtBox, o: Vec3, d: Vec3, tMax: number): { t: number; n: Vec3 } | null {
    const center = scale(add(box.min, box.max), 0.5);
    const rot = box.rotationY ?? 0;
    const c = Math.cos(-rot);
    const s = Math.sin(-rot);
    const toLocal = (v: Vec3): Vec3 => [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
    const lo = toLocal(sub(o, center));
    const ld = toLocal(d);
    const half = scale(sub(box.max, box.min), 0.5);
    let t0 = -Infinity;
    let t1 = Infinity;
    let axis0 = 0;
    let sign0 = 1;
    let axis1 = 0;
    let sign1 = 1;
    for (let k = 0; k < 3; k++) {
        const inv = 1 / ld[k]!;
        let a = (-half[k]! - lo[k]!) * inv;
        let b = (half[k]! - lo[k]!) * inv;
        let sa = -1;
        let sb = 1;
        if (a > b) {
            [a, b] = [b, a];
            [sa, sb] = [sb, sa];
        }
        if (a > t0) {
            t0 = a;
            axis0 = k;
            sign0 = sa;
        }
        if (b < t1) {
            t1 = b;
            axis1 = k;
            sign1 = sb;
        }
    }
    if (t0 > t1) return null;
    let t: number;
    let axis: number;
    let sign: number;
    if (t0 > EPS && t0 < tMax) {
        t = t0;
        axis = axis0;
        sign = sign0;
    } else if (t1 > EPS && t1 < tMax) {
        t = t1;
        axis = axis1;
        sign = sign1;
    } else return null;
    const ln: [number, number, number] = [0, 0, 0];
    ln[axis] = sign;
    // De volta ao mundo (rotação +rot).
    const cw = Math.cos(rot);
    const sw = Math.sin(rot);
    return { t, n: [cw * ln[0] + sw * ln[2], ln[1], -sw * ln[0] + cw * ln[2]] };
}

function intersectSphere(
    sp: PtSphere,
    o: Vec3,
    d: Vec3,
    tMax: number,
): { t: number; n: Vec3 } | null {
    const oc = sub(o, sp.center);
    const b = dot(oc, d);
    const c = dot(oc, oc) - sp.radius * sp.radius;
    const disc = b * b - c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    let t = -b - s;
    if (t <= EPS || t >= tMax) t = -b + s;
    if (t <= EPS || t >= tMax) return null;
    return { t, n: scale(add(oc, scale(d, t)), 1 / sp.radius) };
}

function intersectQuad(q: PtQuad, o: Vec3, d: Vec3, tMax: number): { t: number; n: Vec3 } | null {
    const n = normalize(cross(q.u, q.v));
    const denom = dot(n, d);
    if (Math.abs(denom) < 1e-12) return null;
    const t = dot(sub(q.corner, o), n) / denom;
    if (t <= EPS || t >= tMax) return null;
    const p = sub(add(o, scale(d, t)), q.corner);
    const uu = dot(q.u, q.u);
    const vv = dot(q.v, q.v);
    const s = dot(p, q.u) / uu;
    const r = dot(p, q.v) / vv;
    if (s < 0 || s > 1 || r < 0 || r > 1) return null;
    return { t, n };
}

function intersect(scene: PtScene, o: Vec3, d: Vec3, tMax: number): Hit | null {
    let best: Hit | null = null;
    let limit = tMax;
    for (const object of scene.objects) {
        const sh = object.shape;
        const h =
            sh.kind === 'box'
                ? intersectBox(sh, o, d, limit)
                : sh.kind === 'sphere'
                  ? intersectSphere(sh, o, d, limit)
                  : intersectQuad(sh, o, d, limit);
        if (h !== null) {
            limit = h.t;
            best = { t: h.t, normal: h.n, object };
        }
    }
    return best;
}

/** Entrada e saída de um raio numa caixa de meio (ou `null`). */
function mediumSpan(m: PtMedium, o: Vec3, d: Vec3, tMax: number): [number, number] | null {
    let t0 = 0;
    let t1 = tMax;
    for (let k = 0; k < 3; k++) {
        const inv = 1 / d[k]!;
        const a = (m.min[k]! - o[k]!) * inv;
        const b = (m.max[k]! - o[k]!) * inv;
        t0 = Math.max(t0, Math.min(a, b));
        t1 = Math.min(t1, Math.max(a, b));
    }
    return t0 < t1 ? [t0, t1] : null;
}

const densityAt = (m: PtMedium, p: Vec3): number => (m.density === undefined ? 1 : m.density(p));

/** Transmitância dos meios ao longo de [0, tMax] (marcha com passos finos; exata para densidade constante). */
export function mediaTransmittance(
    scene: PtScene,
    o: Vec3,
    d: Vec3,
    tMax: number,
    steps = 64,
): Vec3 {
    let depth: Vec3 = ZERO;
    for (const m of scene.media ?? []) {
        const span = mediumSpan(m, o, d, tMax);
        if (span === null) continue;
        const ext = add(m.scattering, m.absorption);
        if (m.density === undefined) {
            depth = add(depth, scale(ext, span[1] - span[0]));
            continue;
        }
        const dt = (span[1] - span[0]) / steps;
        for (let i = 0; i < steps; i++) {
            const p = add(o, scale(d, span[0] + (i + 0.5) * dt));
            depth = add(depth, scale(ext, densityAt(m, p) * dt));
        }
    }
    return exp3(scale(depth, -1));
}

/** Fase de Henyey-Greenstein (cosseno entre a direção de chegada da luz e a de saída). */
export function henyeyGreenstein(cosTheta: number, g: number): number {
    const d = 1 + g * g - 2 * g * cosTheta;
    return (1 - g * g) / (4 * Math.PI * d * Math.sqrt(d));
}

/** Direção amostrada pela fase HG em torno de `w`. */
function sampleHg(w: Vec3, g: number, r1: number, r2: number): Vec3 {
    let cosT: number;
    if (Math.abs(g) < 1e-3) cosT = 1 - 2 * r1;
    else {
        const s = (1 - g * g) / (1 - g + 2 * g * r1);
        cosT = (1 + g * g - s * s) / (2 * g);
    }
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    const phi = 2 * Math.PI * r2;
    const [t, b] = basis(w);
    return normalize(
        add(add(scale(t, sinT * Math.cos(phi)), scale(b, sinT * Math.sin(phi))), scale(w, cosT)),
    );
}

function basis(n: Vec3): [Vec3, Vec3] {
    const a: Vec3 = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t = normalize(cross(a, n));
    return [t, cross(n, t)];
}

function cosineSample(n: Vec3, r1: number, r2: number): Vec3 {
    const r = Math.sqrt(r1);
    const phi = 2 * Math.PI * r2;
    const [t, b] = basis(n);
    return normalize(
        add(
            add(scale(t, r * Math.cos(phi)), scale(b, r * Math.sin(phi))),
            scale(n, Math.sqrt(1 - r1)),
        ),
    );
}

/** Luz direta (luzes da 011 e emissores quadriláteros) que chega a `p` vinda de cada fonte, com a função de resposta. */
function directLight(
    scene: PtScene,
    p: Vec3,
    respond: (l: Vec3) => Vec3,
    rng: Rng,
    surfaceNormal: Vec3 | null,
): Vec3 {
    let sum: Vec3 = ZERO;
    for (const light of scene.lights ?? []) {
        let l: Vec3;
        let dist: number;
        let radiance: Vec3;
        if (light.kind === 'directional') {
            l = normalize(scale(light.direction, -1));
            dist = Infinity;
            radiance = light.illuminance;
        } else {
            const dv = sub(light.position, p);
            dist = length(dv);
            l = scale(dv, 1 / dist);
            radiance = scale(light.intensity, 1 / (dist * dist));
        }
        if (surfaceNormal !== null && dot(surfaceNormal, l) <= 0) continue;
        const origin = surfaceNormal === null ? p : add(p, scale(surfaceNormal, EPS * 10));
        if (intersect(scene, origin, l, dist) !== null) continue;
        const tr = mediaTransmittance(scene, origin, l, dist === Infinity ? 1e6 : dist);
        sum = add(sum, mul(mul(radiance, tr), respond(l)));
    }
    // Emissores de área (quadriláteros): uma amostra por emissor.
    for (const object of scene.objects) {
        const e = object.material.emission;
        if (e === undefined || object.shape.kind !== 'quad') continue;
        const q = object.shape;
        const target = add(add(q.corner, scale(q.u, rng.next())), scale(q.v, rng.next()));
        const dv = sub(target, p);
        const dist = length(dv);
        const l = scale(dv, 1 / dist);
        if (surfaceNormal !== null && dot(surfaceNormal, l) <= 0) continue;
        const area = length(cross(q.u, q.v));
        const ln = normalize(cross(q.u, q.v));
        const cosL = Math.abs(dot(ln, l));
        if (cosL <= 0) continue;
        const origin = surfaceNormal === null ? p : add(p, scale(surfaceNormal, EPS * 10));
        const blocker = intersect(scene, origin, l, dist - EPS * 20);
        if (blocker !== null) continue;
        const tr = mediaTransmittance(scene, origin, l, dist);
        // Radiância × ângulo sólido (área · cos / d²).
        sum = add(sum, mul(mul(scale(e, (area * cosL) / (dist * dist)), tr), respond(l)));
    }
    return sum;
}

/** Radiância que chega à origem do raio `d` (caminho completo com o número de rebatimentos dado). */
function radiance(
    scene: PtScene,
    o0: Vec3,
    d0: Vec3,
    opts: PtOptions,
    rng: Rng,
    scatter = true,
): Vec3 {
    let o = o0;
    let d = d0;
    let throughput: Vec3 = [1, 1, 1];
    let sum: Vec3 = ZERO;
    let countEmission = true;
    for (let depth = 0; depth <= opts.bounces; depth++) {
        const hit = intersect(scene, o, d, Infinity);
        const tSurf = hit === null ? Infinity : hit.t;
        // Meio: amostragem de voo livre por rastreamento delta (majorante = coeficiente na densidade 1).
        // Sem espalhamento (modo simples): o meio só atenua, aplicado por quem chama e nas luzes diretas.
        const scatterEvent = scatter ? sampleMedia(scene, o, d, tSurf, rng) : null;
        if (scatterEvent !== null) {
            const { p, medium } = scatterEvent;
            const albedo: Vec3 = [0, 1, 2].map((c) => {
                const ext = medium.scattering[c]! + medium.absorption[c]!;
                return ext > 0 ? medium.scattering[c]! / ext : 0;
            }) as unknown as Vec3;
            throughput = mul(throughput, albedo);
            const wo = scale(d, -1);
            const direct = directLight(
                scene,
                p,
                (l) => {
                    const ph = henyeyGreenstein(dot(l, scale(wo, -1)), medium.g);
                    return [ph, ph, ph];
                },
                rng,
                null,
            );
            if (!(opts.indirectOnly === true && depth === 0))
                sum = add(sum, mul(throughput, direct));
            o = p;
            d = sampleHg(d, medium.g, rng.next(), rng.next());
            countEmission = false;
            continue;
        }
        if (hit === null) {
            if (scene.sky !== undefined && !(opts.indirectOnly === true && depth === 0)) {
                sum = add(sum, mul(throughput, scene.sky(d)));
            }
            break;
        }
        const p = add(o, scale(d, hit.t));
        let n = hit.normal;
        if (dot(n, d) > 0) n = scale(n, -1);
        const mat = hit.object.material;
        // Quadriláteros emissores entram pela amostragem direta; as outras formas emissoras, pelo acerto.
        const sampledEmitter = hit.object.shape.kind === 'quad';
        if (mat.emission !== undefined && (countEmission || !sampledEmitter)) {
            sum = add(sum, mul(throughput, mat.emission));
        }
        if (mat.mirror !== undefined) {
            throughput = mul(throughput, mat.mirror);
            d = sub(d, scale(n, 2 * dot(d, n)));
            o = add(p, scale(n, EPS * 10));
            countEmission = true;
            continue;
        }
        const brdf = scale(mat.albedo, 1 / Math.PI);
        const direct = directLight(scene, p, (l) => scale(brdf, Math.max(0, dot(n, l))), rng, n);
        if (!(opts.indirectOnly === true && depth === 0)) sum = add(sum, mul(throughput, direct));
        // Rebatimento difuso por cosseno: o peso é o albedo.
        throughput = mul(throughput, mat.albedo);
        d = cosineSample(n, rng.next(), rng.next());
        o = add(p, scale(n, EPS * 10));
        // A emissão de área já entrou pela amostragem direta.
        countEmission = false;
    }
    return sum;
}

/** Evento de espalhamento antes de `tMax` (rastreamento delta em cada meio), ou `null`. */
function sampleMedia(
    scene: PtScene,
    o: Vec3,
    d: Vec3,
    tMax: number,
    rng: Rng,
): { p: Vec3; medium: PtMedium } | null {
    let best: { t: number; medium: PtMedium } | null = null;
    for (const m of scene.media ?? []) {
        const span = mediumSpan(m, o, d, tMax);
        if (span === null) continue;
        // Majorante escalar: o maior coeficiente de extinção (cor tratada pela razão no evento).
        const ext = add(m.scattering, m.absorption);
        const major = Math.max(ext[0], ext[1], ext[2]);
        if (major <= 0) continue;
        let t = span[0];
        for (;;) {
            t -= Math.log(1 - rng.next()) / major;
            if (t >= span[1] || (best !== null && t >= best.t)) break;
            const p = add(o, scale(d, t));
            const lum = (ext[0] + ext[1] + ext[2]) / 3;
            if (rng.next() < (densityAt(m, p) * lum) / major) {
                best = { t, medium: m };
                break;
            }
        }
    }
    return best === null ? null : { p: add(o, scale(d, best.t)), medium: best.medium };
}

/** Espalhamento simples de um raio de câmera (marcha determinística) somado à superfície atenuada. */
function singleScatter(scene: PtScene, o: Vec3, d: Vec3, opts: PtOptions, rng: Rng): Vec3 {
    const hit = intersect(scene, o, d, Infinity);
    const tSurf = hit === null ? Infinity : hit.t;
    let sum: Vec3 = ZERO;
    const steps = opts.marchSteps ?? 256;
    for (const m of scene.media ?? []) {
        const span = mediumSpan(m, o, d, tSurf === Infinity ? 1e6 : tSurf);
        if (span === null) continue;
        const dt = (span[1] - span[0]) / steps;
        for (let i = 0; i < steps; i++) {
            const t = span[0] + (i + 0.5) * dt;
            const p = add(o, scale(d, t));
            const tr = mediaTransmittance(scene, o, d, t);
            const sigma = scale(m.scattering, densityAt(m, p) * dt);
            const inscatter = directLight(
                scene,
                p,
                (l) => {
                    const ph = henyeyGreenstein(dot(l, d), m.g);
                    return [ph, ph, ph];
                },
                rng,
                null,
            );
            sum = add(sum, mul(mul(tr, sigma), inscatter));
        }
    }
    if (hit !== null) {
        const surf = radiance(scene, o, d, opts, rng, false);
        sum = add(sum, mul(mediaTransmittance(scene, o, d, tSurf), surf));
    } else if (scene.sky !== undefined) {
        sum = add(sum, mul(mediaTransmittance(scene, o, d, 1e6), scene.sky(d)));
    }
    return sum;
}

/** Renderiza a cena: radiância HDR média por pixel e a instância vista no centro do pixel. */
export function renderPathTraced(scene: PtScene, camera: PtCamera, opts: PtOptions): PtImage {
    const { width, height } = opts;
    const rgb = new Float32Array(width * height * 3);
    const ids = new Int32Array(width * height).fill(-1);
    const forward = normalize(sub(camera.target, camera.position));
    const right = normalize(cross(forward, camera.up ?? [0, 1, 0]));
    const up = cross(right, forward);
    const tanY = Math.tan(camera.fovY / 2);
    const tanX = tanY * (width / height);
    const dirAt = (x: number, y: number): Vec3 =>
        normalize(
            add(
                add(forward, scale(right, ((2 * x) / width - 1) * tanX)),
                scale(up, (1 - (2 * y) / height) * tanY),
            ),
        );
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixel = y * width + x;
            const center = intersect(scene, camera.position, dirAt(x + 0.5, y + 0.5), Infinity);
            ids[pixel] = center === null ? -1 : center.object.id;
            let acc: Vec3 = ZERO;
            for (let s = 0; s < opts.samples; s++) {
                const rng = new Rng(pixel, s);
                const d = dirAt(x + rng.next(), y + rng.next());
                const l =
                    opts.media === 'single'
                        ? singleScatter(scene, camera.position, d, opts, rng)
                        : radiance(scene, camera.position, d, opts, rng);
                acc = add(acc, l);
            }
            rgb[pixel * 3] = acc[0] / opts.samples;
            rgb[pixel * 3 + 1] = acc[1] / opts.samples;
            rgb[pixel * 3 + 2] = acc[2] / opts.samples;
        }
    }
    return { width, height, rgb, ids };
}

/** Radiância que sai de um ponto de superfície em direção a `view` (para medir pontos isolados). */
export function radianceAt(scene: PtScene, origin: Vec3, dir: Vec3, opts: PtOptions): Vec3 {
    let acc: Vec3 = ZERO;
    for (let s = 0; s < opts.samples; s++)
        acc = add(acc, radiance(scene, origin, normalize(dir), opts, new Rng(7, s)));
    return scale(acc, 1 / opts.samples);
}

/** Radiância média por região (id da instância vista), contando só os pixels inteiros dentro dela. */
export function regionMeans(image: PtImage): Map<number, Vec3> {
    const sums = new Map<number, { s: [number, number, number]; n: number }>();
    for (let i = 0; i < image.ids.length; i++) {
        const id = image.ids[i]!;
        if (id < 0) continue;
        let e = sums.get(id);
        if (e === undefined) sums.set(id, (e = { s: [0, 0, 0], n: 0 }));
        e.s[0] += image.rgb[i * 3]!;
        e.s[1] += image.rgb[i * 3 + 1]!;
        e.s[2] += image.rgb[i * 3 + 2]!;
        e.n++;
    }
    const out = new Map<number, Vec3>();
    for (const [id, e] of sums) out.set(id, [e.s[0] / e.n, e.s[1] / e.n, e.s[2] / e.n]);
    return out;
}
