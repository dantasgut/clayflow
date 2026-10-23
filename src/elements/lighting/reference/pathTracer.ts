// Traçador de caminhos de referência na CPU (spec 033, R8; só para testes e smokes): a luz física das cenas pequenas dos smokes de iluminação
// global (Cornell box, cômodo com janela, caixa fechada, ambiente branco, névoa) — difuso de Lambert, espelho, emissão,
// luzes da 011 (direcional em lux, pontual em candela), céu por função e meios participantes (homogêneos ou por
// densidade, fase de Henyey-Greenstein). Amostragem determinística (hash por pixel e amostra); o número de rebatimentos é
// fixo, o mesmo do alvo. Saída: a radiância HDR por pixel e a instância vista, para medir por região.
//
// Dielétricos (spec 034, R10 — a referência da refração, independente da GPU): Fresnel exato (luz não polarizada em
// cada interface, sem seguir a polarização — a convenção do motor), reflexão interna total, rugosidade GGX amostrada
// pela distribuição visível de normais (peso G1), absorção de Beer–Lambert pelo comprimento em cada meio, dispersão
// por canal (o canal sorteado na primeira interface dispersiva segue sozinho, com o próprio índice em todas as
// interfaces), pilha de meios com prioridade (na sobreposição de volumes vale o de maior prioridade; cruzar a borda de
// um meio que não é o corrente não é interface), interfaces coincidentes cruzadas juntas, parede fina (quadrilátero:
// placa de espessura zero) e a água como caixa com o topo por tabela de alturas. A radiância muda pelo quadrado da
// razão dos índices ao atravessar (L/n² se conserva). As luzes pontuais e direcionais não atravessam dielétricos (só
// chegam por um caminho que as atinja, o que um delta não permite): a sombra de vidro e água é a física sem cáusticas.

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
    /** Dielétrico (vidro, água): sem difuso; o volume da forma é o meio. */
    readonly dielectric?: PtDielectric;
    /** Xadrez pela posição no mundo no lugar do albedo e da emissão constantes. */
    readonly checker?: PtChecker;
}

/**
 * Xadrez procedural (spec 034, smoke `refraction`): a paridade de ⌊p[a]/size⌋ + ⌊p[b]/size⌋ nos dois eixos `axes`
 * escolhe o primeiro valor (par) ou o segundo.
 */
export interface PtChecker {
    readonly size: number;
    readonly axes: readonly [number, number];
    readonly albedo?: readonly [Vec3, Vec3];
    readonly emission?: readonly [Vec3, Vec3];
}

/** Albedo e emissão do material no ponto `p` (o xadrez, se houver). */
function surfaceAt(m: PtMaterial, p: Vec3): { albedo: Vec3; emission: Vec3 | undefined } {
    const c = m.checker;
    if (c === undefined) return { albedo: m.albedo, emission: m.emission };
    const cell = Math.floor(p[c.axes[0]]! / c.size) + Math.floor(p[c.axes[1]]! / c.size);
    const odd = ((cell % 2) + 2) % 2;
    return {
        albedo: c.albedo?.[odd] ?? m.albedo,
        emission: c.emission?.[odd] ?? m.emission,
    };
}

/** Dielétrico na convenção do `closure_transmission` do motor. */
export interface PtDielectric {
    /** Índice de refração na linha d (≥ 1). */
    readonly ior: number;
    /** Número de Abbe (0 ou ausente = sem dispersão). */
    readonly abbe?: number;
    /** Cor atingida a `depth` de percurso (Beer–Lambert); `depth` 0 ou ausente = sem absorção. */
    readonly color?: Vec3;
    readonly depth?: number;
    /** Rugosidade em [0, 1]; α do GGX = rugosidade². */
    readonly roughness?: number;
    /** Na sobreposição de volumes vale o meio de maior prioridade (padrão 0; empate: o último em que se entrou). */
    readonly priority?: number;
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

/**
 * Caixa com o topo por tabela de alturas (a água): o volume `min.y ≤ y ≤ h(x, z)` sobre `[min.x, max.x] × [min.z,
 * max.z]`; `heights` tem `nx × nz` amostras (x mais rápido) nos cantos de uma grade regular, interpoladas por bilinear;
 * `max.y` é um limite de cima das alturas.
 */
export interface PtHeightField {
    readonly kind: 'heightField';
    readonly min: Vec3;
    readonly max: Vec3;
    readonly nx: number;
    readonly nz: number;
    readonly heights: Float32Array;
}

/** Objeto da cena: forma, material e o id da região (máscara). */
export interface PtObject {
    readonly id: number;
    readonly shape: PtBox | PtSphere | PtQuad | PtHeightField;
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
    /**
     * O céu como tabela latitude-longitude (vai por mensagem aos workers, ao contrário da função): `width` × `height`
     * texels rgb, u = azimute (atan2(z, x)) e v = ângulo a partir de +y; lida pelo texel mais próximo. Vale sem `sky`.
     */
    readonly skyTable?: PtSkyTable;
    readonly media?: readonly PtMedium[];
}

/** Tabela latitude-longitude da radiância do céu. */
export interface PtSkyTable {
    readonly width: number;
    readonly height: number;
    readonly rgb: Float32Array;
}

/** Direção do centro do texel (i, j) da tabela do céu. */
export function skyTableDir(table: PtSkyTable, i: number, j: number): Vec3 {
    const phi = ((i + 0.5) / table.width) * 2 * Math.PI - Math.PI;
    const theta = ((j + 0.5) / table.height) * Math.PI;
    return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
}

/** Radiância da tabela do céu na direção unitária `d`. */
function skyTableAt(table: PtSkyTable, d: Vec3): Vec3 {
    const u = (Math.atan2(d[2], d[0]) + Math.PI) / (2 * Math.PI);
    const v = Math.acos(Math.max(-1, Math.min(1, d[1]))) / Math.PI;
    const i = Math.min(table.width - 1, Math.max(0, Math.floor(u * table.width)));
    const j = Math.min(table.height - 1, Math.max(0, Math.floor(v * table.height)));
    const k = (j * table.width + i) * 3;
    return [table.rgb[k]!, table.rgb[k + 1]!, table.rgb[k + 2]!];
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
    /** Só a luz indireta (descarta a direta e a emissão na primeira superfície). */
    readonly indirectOnly?: boolean;
    /**
     * Faixa de linhas [início, fim) a renderizar (padrão: todas); as outras ficam zeradas. A semente é por pixel, então
     * faixas renderizadas à parte (em paralelo) compõem a mesma imagem.
     */
    readonly rows?: readonly [number, number];
    /**
     * Índice da primeira amostra (padrão 0): duas renderizações com `samples` N e `firstSample` 0 e N são independentes
     * e a média delas é a de 2N amostras — a diferença entre elas mede o ruído da própria referência.
     */
    readonly firstSample?: number;
    /** Interfaces dielétricas por caminho (padrão 64); no limite o caminho termina (a energia conta como absorvida). */
    readonly interfaces?: number;
}

/** Imagem HDR e a instância vista por pixel (−1 = nada). */
export interface PtImage {
    readonly width: number;
    readonly height: number;
    readonly rgb: Float32Array;
    readonly ids: Int32Array;
    /** Face vista no centro do pixel: o eixo dominante da normal e o sinal (0–5; −1 sem acerto). */
    readonly faces: Int8Array;
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

/** Altura bilinear da tabela e o gradiente (∂h/∂x, ∂h/∂z) da célula. */
function heightAt(f: PtHeightField, x: number, z: number): [number, number, number] {
    const cw = (f.max[0] - f.min[0]) / (f.nx - 1);
    const cd = (f.max[2] - f.min[2]) / (f.nz - 1);
    const gx = Math.min(f.nx - 2, Math.max(0, Math.floor((x - f.min[0]) / cw)));
    const gz = Math.min(f.nz - 2, Math.max(0, Math.floor((z - f.min[2]) / cd)));
    const fx = (x - f.min[0]) / cw - gx;
    const fz = (z - f.min[2]) / cd - gz;
    const h00 = f.heights[gz * f.nx + gx]!;
    const h10 = f.heights[gz * f.nx + gx + 1]!;
    const h01 = f.heights[(gz + 1) * f.nx + gx]!;
    const h11 = f.heights[(gz + 1) * f.nx + gx + 1]!;
    const h = (1 - fz) * ((1 - fx) * h00 + fx * h10) + fz * ((1 - fx) * h01 + fx * h11);
    const dx = ((1 - fz) * (h10 - h00) + fz * (h11 - h01)) / cw;
    const dz = ((1 - fx) * (h01 - h00) + fx * (h11 - h10)) / cd;
    return [h, dx, dz];
}

function insideHeightField(f: PtHeightField, p: Vec3): boolean {
    if (p[0] < f.min[0] || p[0] > f.max[0] || p[2] < f.min[2] || p[2] > f.max[2]) return false;
    return p[1] >= f.min[1] && p[1] <= heightAt(f, p[0], p[2])[0];
}

/**
 * Raio contra o volume da água: marcha em 512 passos pelo trecho dentro da caixa envolvente até a troca de dentro/fora,
 * refinada por bisseção; a normal é a do topo (pelo gradiente da célula) ou a da face da caixa onde a troca caiu.
 */
function intersectHeightField(
    f: PtHeightField,
    o: Vec3,
    d: Vec3,
    tMax: number,
): { t: number; n: Vec3 } | null {
    let t0 = EPS;
    let t1 = tMax;
    for (let k = 0; k < 3; k++) {
        const inv = 1 / d[k]!;
        const a = (f.min[k]! - o[k]!) * inv;
        const b = (f.max[k]! - o[k]!) * inv;
        t0 = Math.max(t0, Math.min(a, b) - EPS);
        t1 = Math.min(t1, Math.max(a, b) + EPS);
    }
    if (!(t0 < t1)) return null;
    const at = (t: number): Vec3 => add(o, scale(d, t));
    const start = insideHeightField(f, at(t0));
    const steps = 512;
    let prev = t0;
    for (let i = 1; i <= steps; i++) {
        const t = t0 + ((t1 - t0) * i) / steps;
        if (insideHeightField(f, at(t)) === start) {
            prev = t;
            continue;
        }
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 48; k++) {
            const mid = 0.5 * (lo + hi);
            if (insideHeightField(f, at(mid)) === start) lo = mid;
            else hi = mid;
        }
        const th = 0.5 * (lo + hi);
        if (th <= EPS || th >= tMax) return null;
        const p = at(th);
        const tol = 1e-6 * (1 + Math.abs(th));
        const faces: [number, Vec3][] = [
            [Math.abs(p[0] - f.min[0]), [-1, 0, 0]],
            [Math.abs(p[0] - f.max[0]), [1, 0, 0]],
            [Math.abs(p[2] - f.min[2]), [0, 0, -1]],
            [Math.abs(p[2] - f.max[2]), [0, 0, 1]],
            [Math.abs(p[1] - f.min[1]), [0, -1, 0]],
        ];
        const [h, hx, hz] = heightAt(f, p[0], p[2]);
        let best: [number, Vec3] = [Math.abs(p[1] - h), normalize([-hx, 1, -hz])];
        for (const face of faces) if (face[0] < best[0] - tol) best = face;
        return { t: th, n: best[1] };
    }
    return null;
}

function intersectShape(
    sh: PtObject['shape'],
    o: Vec3,
    d: Vec3,
    tMax: number,
): { t: number; n: Vec3 } | null {
    switch (sh.kind) {
        case 'box':
            return intersectBox(sh, o, d, tMax);
        case 'sphere':
            return intersectSphere(sh, o, d, tMax);
        case 'quad':
            return intersectQuad(sh, o, d, tMax);
        case 'heightField':
            return intersectHeightField(sh, o, d, tMax);
    }
}

function intersect(scene: PtScene, o: Vec3, d: Vec3, tMax: number): Hit | null {
    let best: Hit | null = null;
    let limit = tMax;
    for (const object of scene.objects) {
        const h = intersectShape(object.shape, o, d, limit);
        if (h !== null) {
            limit = h.t;
            best = { t: h.t, normal: h.n, object };
        }
    }
    return best;
}

/** Os dielétricos cuja borda o raio cruza junto com o acerto mais próximo (interfaces coincidentes), com a normal de fora. */
function coincidentDielectrics(
    scene: PtScene,
    o: Vec3,
    d: Vec3,
    hit: Hit,
): { object: PtObject; normal: Vec3 }[] {
    const tol = 1e-5 * (1 + hit.t);
    const out: { object: PtObject; normal: Vec3 }[] = [];
    for (const object of scene.objects) {
        if (object.material.dielectric === undefined) continue;
        if (object === hit.object) {
            out.push({ object, normal: hit.normal });
            continue;
        }
        const h = intersectShape(object.shape, o, d, hit.t + tol);
        if (h !== null && h.t >= hit.t - tol) out.push({ object, normal: h.n });
    }
    return out;
}

/** Ponto dentro do volume da forma (o quadrilátero não tem volume). */
function contains(sh: PtObject['shape'], p: Vec3): boolean {
    switch (sh.kind) {
        case 'box': {
            const center = scale(add(sh.min, sh.max), 0.5);
            const rot = sh.rotationY ?? 0;
            const c = Math.cos(-rot);
            const s = Math.sin(-rot);
            const v = sub(p, center);
            const l: Vec3 = [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
            const half = scale(sub(sh.max, sh.min), 0.5);
            return (
                Math.abs(l[0]) <= half[0] && Math.abs(l[1]) <= half[1] && Math.abs(l[2]) <= half[2]
            );
        }
        case 'sphere':
            return length(sub(p, sh.center)) <= sh.radius;
        case 'quad':
            return false;
        case 'heightField':
            return insideHeightField(sh, p);
    }
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

/** Refletâncias s e p de Fresnel na interface n1 → n2 com o cosseno de incidência `cosI` (1 e 1 na reflexão interna total). */
function fresnelSP(cosI: number, n1: number, n2: number): [number, number] {
    const ci = Math.min(1, Math.abs(cosI));
    const sin2t = (n1 / n2) ** 2 * (1 - ci * ci);
    if (sin2t >= 1) return [1, 1];
    const ct = Math.sqrt(1 - sin2t);
    const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
    const rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
    return [rs * rs, rp * rp];
}

/** Refletância de Fresnel exata (luz não polarizada) da interface dielétrica n1 → n2; 1 acima do ângulo crítico. */
export function fresnelDielectric(cosI: number, n1: number, n2: number): number {
    const [rs, rp] = fresnelSP(cosI, n1, n2);
    return 0.5 * (rs + rp);
}

/** Índices por canal (R, G, B) pelo número de Abbe: n_d + (n_d − 1)/V · (−½, 0, ½), V ≥ 10 (a convenção do motor). */
export function dispersionIors(m: PtDielectric): Vec3 {
    const abbe = m.abbe ?? 0;
    const k = abbe > 0 ? (m.ior - 1) / Math.max(abbe, 10) : 0;
    return [m.ior - 0.5 * k, m.ior, m.ior + 0.5 * k];
}

/** Mascaramento de Smith do GGX para a direção com cosseno `cos` em relação à normal de macro-superfície. */
export function smithG1(cos: number, alpha: number): number {
    const c = Math.min(1, Math.abs(cos));
    if (c <= 0) return 0;
    const tan2 = (1 - c * c) / (c * c);
    return 2 / (1 + Math.sqrt(1 + alpha * alpha * tan2));
}

/** Normal de microfaceta GGX amostrada pela distribuição visível (Heitz 2018) para `wo` no referencial com z = normal. */
function sampleVndf(wo: Vec3, alpha: number, u1: number, u2: number): Vec3 {
    const vh = normalize([alpha * wo[0], alpha * wo[1], wo[2]]);
    const lensq = vh[0] * vh[0] + vh[1] * vh[1];
    const t1: Vec3 = lensq > 0 ? scale([-vh[1], vh[0], 0], 1 / Math.sqrt(lensq)) : [1, 0, 0];
    const t2 = cross(vh, t1);
    const r = Math.sqrt(u1);
    const phi = 2 * Math.PI * u2;
    const p1 = r * Math.cos(phi);
    const sv = 0.5 * (1 + vh[2]);
    const p2 = (1 - sv) * Math.sqrt(Math.max(0, 1 - p1 * p1)) + sv * r * Math.sin(phi);
    const nh = add(
        add(scale(t1, p1), scale(t2, p2)),
        scale(vh, Math.sqrt(Math.max(0, 1 - p1 * p1 - p2 * p2))),
    );
    return normalize([alpha * nh[0], alpha * nh[1], Math.max(1e-7, nh[2])]);
}

/** Amostra de uma interface dielétrica: a direção seguinte, o peso e se atravessou. */
export interface PtInterfaceSample {
    readonly dir: Vec3;
    readonly weight: number;
    readonly transmitted: boolean;
}

/**
 * Interface dielétrica n1 (lado de onde o raio `d` vem) → n2 com a normal geométrica `normal` (qualquer sentido) e o α
 * do GGX (0 = lisa). A microfaceta vem da distribuição visível; reflete com a probabilidade de Fresnel na microfaceta,
 * senão refrata por Snell. Peso: G1 da direção de saída (0 se ela cai do lado errado da macro-superfície) e, ao
 * atravessar, (n1/n2)² — a radiância vista do lado n1. `u` em [0, 1)³. `null`: caminho perdido.
 */
export function sampleDielectricInterface(
    d: Vec3,
    normal: Vec3,
    n1: number,
    n2: number,
    alpha: number,
    u: readonly [number, number, number],
): PtInterfaceSample | null {
    const nf = dot(normal, d) < 0 ? normal : scale(normal, -1);
    const wo = scale(d, -1);
    let m = nf;
    if (alpha > 1e-4) {
        const [t, b] = basis(nf);
        const local: Vec3 = [dot(wo, t), dot(wo, b), dot(wo, nf)];
        const ml = sampleVndf(local, alpha, u[0], u[1]);
        m = normalize(add(add(scale(t, ml[0]), scale(b, ml[1])), scale(nf, ml[2])));
    }
    const c = dot(wo, m);
    if (c <= 0) return null;
    const eta = n1 / n2;
    const sin2t = eta * eta * (1 - c * c);
    const f = fresnelDielectric(c, n1, n2);
    let dir: Vec3;
    let transmitted: boolean;
    if (u[2] < f) {
        dir = sub(scale(m, 2 * c), wo);
        transmitted = false;
        if (dot(dir, nf) <= 0) return null;
    } else {
        dir = normalize(add(scale(d, eta), scale(m, eta * c - Math.sqrt(1 - sin2t))));
        transmitted = true;
        if (dot(dir, nf) >= 0) return null;
    }
    let weight = alpha > 1e-4 ? smithG1(dot(dir, nf), alpha) : 1;
    if (transmitted) weight *= eta * eta;
    return { dir, weight, transmitted };
}

/** Meio da pilha: o objeto dielétrico em que o caminho está. */
interface StackEntry {
    readonly object: PtObject;
    readonly medium: PtDielectric;
}

/** O meio corrente: o de maior prioridade; no empate, o último em que se entrou (`null` = ar, índice 1). */
function currentMedium(stack: readonly StackEntry[]): StackEntry | null {
    let best: StackEntry | null = null;
    for (const e of stack)
        if (best === null || (e.medium.priority ?? 0) >= (best.medium.priority ?? 0)) best = e;
    return best;
}

/** Pilha inicial: os dielétricos cujo volume contém o ponto, por prioridade crescente. */
function initialStack(scene: PtScene, p: Vec3): StackEntry[] {
    const out: StackEntry[] = [];
    for (const object of scene.objects) {
        const medium = object.material.dielectric;
        if (medium !== undefined && contains(object.shape, p)) out.push({ object, medium });
    }
    return out.sort((a, b) => (a.medium.priority ?? 0) - (b.medium.priority ?? 0));
}

/** Coeficiente de absorção por canal (−ln cor / profundidade). */
function absorptionOf(m: PtDielectric): Vec3 {
    const depth = m.depth ?? 0;
    const color = m.color ?? [1, 1, 1];
    if (depth <= 0) return ZERO;
    return color.map((c) => (c >= 1 ? 0 : -Math.log(Math.max(c, 1e-9)) / depth)) as unknown as Vec3;
}

/** A energia que resta depois de `t` de percurso no meio (Beer–Lambert; o ar não absorve). */
function absorbed(throughput: Vec3, inside: StackEntry | null, t: number): Vec3 {
    if (inside === null) return throughput;
    const sigma = absorptionOf(inside.medium);
    return throughput.map((v, c) =>
        sigma[c]! > 0 ? v * Math.exp(-sigma[c]! * t) : v,
    ) as unknown as Vec3;
}

/** Índice do meio no canal (−1 = todos: o da linha d). */
function iorOf(m: StackEntry | null, channel: number): number {
    if (m === null) return 1;
    return channel < 0 ? m.medium.ior : dispersionIors(m.medium)[channel]!;
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
    // Pilha de meios dielétricos, o canal da dispersão (−1 = os três juntos) e as interfaces atravessadas.
    let stack = initialStack(scene, o0);
    let channel = -1;
    let interfaces = 0;
    const maxInterfaces = opts.interfaces ?? 64;
    let depth = 0;
    while (depth <= opts.bounces) {
        const hit = intersect(scene, o, d, Infinity);
        const tSurf = hit === null ? Infinity : hit.t;
        // Beer–Lambert no meio dielétrico corrente pelo trecho percorrido.
        throughput = absorbed(throughput, currentMedium(stack), tSurf);
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
            depth++;
            continue;
        }
        if (hit === null) {
            if (scene.sky !== undefined && !(opts.indirectOnly === true && depth === 0)) {
                sum = add(sum, mul(throughput, scene.sky(d)));
            }
            break;
        }
        const p = add(o, scale(d, hit.t));
        const mat = hit.object.material;
        const surf = surfaceAt(mat, p);
        if (mat.dielectric !== undefined) {
            if (++interfaces > maxInterfaces) break;
            const next = crossDielectric(scene, o, d, hit, stack, channel, rng);
            if (next === null) break;
            throughput = afterCrossing(throughput, channel, next);
            channel = next.channel;
            stack = next.stack;
            o = next.origin;
            d = next.dir;
            countEmission = true;
            continue;
        }
        let n = hit.normal;
        if (dot(n, d) > 0) n = scale(n, -1);
        // Quadriláteros emissores entram pela amostragem direta; as outras formas emissoras, pelo acerto.
        const sampledEmitter = hit.object.shape.kind === 'quad';
        const firstHitDirect = opts.indirectOnly === true && depth === 0;
        if (surf.emission !== undefined && (countEmission || !sampledEmitter) && !firstHitDirect) {
            sum = add(sum, mul(throughput, surf.emission));
        }
        if (mat.mirror !== undefined) {
            throughput = mul(throughput, mat.mirror);
            d = sub(d, scale(n, 2 * dot(d, n)));
            o = add(p, scale(n, EPS * 10));
            countEmission = true;
            depth++;
            continue;
        }
        const brdf = scale(surf.albedo, 1 / Math.PI);
        const direct = directLight(scene, p, (l) => scale(brdf, Math.max(0, dot(n, l))), rng, n);
        if (!(opts.indirectOnly === true && depth === 0)) sum = add(sum, mul(throughput, direct));
        // Rebatimento difuso por cosseno: o peso é o albedo.
        throughput = mul(throughput, surf.albedo);
        d = cosineSample(n, rng.next(), rng.next());
        o = add(p, scale(n, EPS * 10));
        // A emissão de área já entrou pela amostragem direta.
        countEmission = false;
        depth++;
    }
    return sum;
}

/** Estado do caminho depois de uma interface dielétrica. */
interface Crossing {
    readonly stack: StackEntry[];
    readonly channel: number;
    readonly dir: Vec3;
    readonly origin: Vec3;
    readonly weight: number;
}

/** O canal que segue: sorteado na primeira interface com meio dispersivo, depois o mesmo. */
function channelAt(channel: number, dispersive: boolean, pick: number): number {
    return dispersive && channel < 0 ? Math.min(2, Math.floor(pick * 3)) : channel;
}

/**
 * Saída de uma interface: o raio seguinte parte do próprio ponto (a interseção ignora acertos a menos de `EPS`). Nada
 * de afastar a origem pela normal: o deslocamento lateral muda onde o raio cai, e numa lupa (ampliação forte perto das
 * dobras da cáustica) 1 mm no ponto de saída cria ou apaga traços inteiros da imagem.
 */
function leave(p: Vec3, rest: Omit<Crossing, 'origin'>): Crossing {
    return { ...rest, origin: p };
}

/**
 * Parede fina (quadrilátero): placa de espessura zero no meio corrente, sem mudar a pilha; as reflexões múltiplas entre
 * as duas faces somadas (R + T²R/(1 − R²) = 2R/(1 + R), luz não polarizada como nas outras interfaces); atravessa sem
 * desviar.
 */
function crossThinWall(
    p: Vec3,
    d: Vec3,
    hit: Hit,
    stack: readonly StackEntry[],
    channel0: number,
    u: number,
    pick: number,
): Crossing {
    const slab = hit.object.material.dielectric!;
    const before = currentMedium(stack);
    const channel = channelAt(
        channel0,
        (slab.abbe ?? 0) > 0 || (before?.medium.abbe ?? 0) > 0,
        pick,
    );
    const nIn = channel < 0 ? slab.ior : dispersionIors(slab)[channel]!;
    const r = fresnelDielectric(dot(d, hit.normal), iorOf(before, channel), nIn);
    const nf = dot(hit.normal, d) < 0 ? hit.normal : scale(hit.normal, -1);
    const reflected = u < (2 * r) / (1 + r);
    const dir = reflected ? sub(d, scale(nf, 2 * dot(d, nf))) : d;
    return leave(p, { stack: [...stack], channel, dir, weight: 1 });
}

/** A pilha depois de cruzar as bordas dadas: sai de quem a normal aponta para fora no sentido do raio, entra nos outros. */
function stackAfter(
    stack: readonly StackEntry[],
    d: Vec3,
    crossings: readonly { object: PtObject; normal: Vec3 }[],
): StackEntry[] {
    let after: StackEntry[] = [...stack];
    for (const c of crossings) {
        if (dot(c.normal, d) > 0) after = after.filter((e) => e.object !== c.object);
        else if (!after.some((e) => e.object === c.object))
            after.push({ object: c.object, medium: c.object.material.dielectric! });
    }
    return after;
}

/** A energia depois da interface: o peso dela e, se a dispersão acabou de separar os canais, só o sorteado (× 3). */
function afterCrossing(throughput: Vec3, channel: number, next: Crossing): Vec3 {
    const w = scale(throughput, next.weight);
    if (next.channel === channel) return w;
    return w.map((v, c) => (c === next.channel ? 3 * v : 0)) as unknown as Vec3;
}

/** Travessia de uma interface dielétrica (com as coincidentes): pilha, canal, direção, origem e peso seguintes. */
function crossDielectric(
    scene: PtScene,
    o: Vec3,
    d: Vec3,
    hit: Hit,
    stack: readonly StackEntry[],
    channel0: number,
    rng: Rng,
): Crossing | null {
    const p = add(o, scale(d, hit.t));
    const u: [number, number, number] = [rng.next(), rng.next(), rng.next()];
    const pick = rng.next();
    if (hit.object.shape.kind === 'quad')
        return crossThinWall(p, d, hit, stack, channel0, u[2], pick);
    // Interfaces coincidentes cruzadas juntas.
    const crossings = coincidentDielectrics(scene, o, d, hit);
    const after = stackAfter(stack, d, crossings);
    const before = currentMedium(stack);
    const next = currentMedium(after);
    // A borda de um meio que não é o corrente nem passa a ser: não é interface, o raio segue.
    if (before?.object === next?.object) {
        return leave(p, { stack: after, channel: channel0, dir: d, weight: 1 });
    }
    const dispersive = (before?.medium.abbe ?? 0) > 0 || (next?.medium.abbe ?? 0) > 0;
    const channel = channelAt(channel0, dispersive, pick);
    // Rugosidade: a da superfície cruzada (a maior entre as coincidentes).
    const roughness = Math.max(
        ...crossings.map((c) => c.object.material.dielectric!.roughness ?? 0),
    );
    const sample = sampleDielectricInterface(
        d,
        hit.normal,
        iorOf(before, channel),
        iorOf(next, channel),
        roughness * roughness,
        u,
    );
    if (sample === null) return null;
    return leave(p, {
        stack: sample.transmitted ? after : [...stack],
        channel,
        dir: sample.dir,
        weight: sample.weight,
    });
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
export function renderPathTraced(input: PtScene, camera: PtCamera, opts: PtOptions): PtImage {
    const table = input.skyTable;
    const scene: PtScene =
        input.sky === undefined && table !== undefined
            ? { ...input, sky: (d) => skyTableAt(table, d) }
            : input;
    const { width, height } = opts;
    const rgb = new Float32Array(width * height * 3);
    const ids = new Int32Array(width * height).fill(-1);
    const faces = new Int8Array(width * height).fill(-1);
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
    const [y0, y1] = opts.rows ?? [0, height];
    for (let y = y0; y < y1; y++) {
        for (let x = 0; x < width; x++) {
            const pixel = y * width + x;
            const center = intersect(scene, camera.position, dirAt(x + 0.5, y + 0.5), Infinity);
            ids[pixel] = center === null ? -1 : center.object.id;
            if (center !== null) {
                const a = center.normal.map(Math.abs);
                const axis = a[0]! >= a[1]! && a[0]! >= a[2]! ? 0 : a[1]! >= a[2]! ? 1 : 2;
                faces[pixel] = axis * 2 + (center.normal[axis] > 0 ? 1 : 0);
            }
            let acc: Vec3 = ZERO;
            const first = opts.firstSample ?? 0;
            for (let s = first; s < first + opts.samples; s++) {
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
    return { width, height, rgb, ids, faces };
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
