// Referência f64 do transporte não local das nuvens (spec 041, T023, R8): o cache de espalhamento por sondas. Numa
// grade de sondas na camada (centrada na câmera, deformada por asinh no plano), cada sonda guarda a luz que chega a ela
// por todas as ordens de espalhamento (o sol a partir da segunda colisão, o céu e o chão) espalhada pela fase na direção
// da câmera — estimada por caminhos aleatórios (rastreamento delta, Novák 2018) no meio com o pico de frente truncado
// (δ-M, Wiscombe 1977: a parte da fase a menos de `θc` da frente é tratada como transmitida). A marcha da câmera soma o
// espalhamento simples exato (o meio completo, a fase completa) e a luz da sonda interpolada × σs. Espelho de
// `cloud_scatter.wgsl` e `cloud_scatter_lookup.wgsl`.
import {
    drainePhase,
    jdePhase,
    altitude,
    cloudDensity,
    shellSegments,
    sphereSpan,
    type CloudModel,
    type JdeParams,
    type Vec3,
} from './cloudModel';

/** Ângulo (graus) do núcleo do pico de frente tratado como transmitido. */
export const CLOUD_PHASE_CUT_DEGREES = 2;

/** A truncagem da fase: o cosseno do corte, a fração da fase no núcleo, a chance da HG entre as partes truncadas e a
 * acumulada da HG até o corte. */
export interface PhaseTruncation {
    readonly cosCut: number;
    readonly fc: number;
    readonly pickHG: number;
    readonly cdfHG: number;
}

/** Acumulada da HG em `μ` de −1 até `mu` (a massa em ângulo sólido). */
export function hgCdf(mu: number, g: number): number {
    return ((1 - g * g) / (2 * g)) * (1 / Math.sqrt(1 + g * g - 2 * g * mu) - 1 / (1 + g));
}

/**
 * A truncagem da fase de J&dE pelo núcleo de `degrees`: a HG pela acumulada fechada, a de Draine pela integral numérica
 * (2000 trechos na grade quadrática do núcleo).
 */
export function phaseTruncation(p: JdeParams, degrees = CLOUD_PHASE_CUT_DEGREES): PhaseTruncation {
    const cosCut = Math.cos((degrees * Math.PI) / 180);
    const coreHG = 1 - hgCdf(cosCut, p.gHG);
    let coreD = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
        const c0 = 1 - (1 - cosCut) * (i / n) ** 2;
        const c1 = 1 - (1 - cosCut) * ((i + 1) / n) ** 2;
        coreD +=
            0.5
            * (drainePhase(c0, p.gD, p.alpha) + drainePhase(c1, p.gD, p.alpha))
            * (c0 - c1)
            * 2
            * Math.PI;
    }
    const fc = (1 - p.wD) * coreHG + p.wD * coreD;
    return {
        cosCut,
        fc,
        pickHG: ((1 - p.wD) * (1 - coreHG)) / (1 - fc),
        cdfHG: 1 - coreHG,
    };
}

/** A fase truncada (normalizada a 1 em 4π sem o núcleo). */
export function truncatedPhase(c: number, p: JdeParams, t: PhaseTruncation): number {
    return c > t.cosCut ? 0 : jdePhase(c, p) / (1 - t.fc);
}

/** Base ortonormal em volta de `w` (a mesma do shader). */
function basis(w: Vec3): [Vec3, Vec3] {
    const a: Vec3 = Math.abs(w[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t0: Vec3 = [
        a[1] * w[2] - a[2] * w[1],
        a[2] * w[0] - a[0] * w[2],
        a[0] * w[1] - a[1] * w[0],
    ];
    const l = Math.hypot(...t0);
    const t: Vec3 = [t0[0] / l, t0[1] / l, t0[2] / l];
    return [t, [w[1] * t[2] - w[2] * t[1], w[2] * t[0] - w[0] * t[2], w[0] * t[1] - w[1] * t[0]]];
}

/** A direção com o cosseno `c` em volta de `w` e o azimute `phi`. */
export function rotateAround(w: Vec3, c: number, phi: number): Vec3 {
    const [t, b] = basis(w);
    const s = Math.sqrt(Math.max(0, 1 - c * c));
    const x = s * Math.cos(phi);
    const y = s * Math.sin(phi);
    const v: Vec3 = [
        t[0] * x + b[0] * y + w[0] * c,
        t[1] * x + b[1] * y + w[1] * c,
        t[2] * x + b[2] * y + w[2] * c,
    ];
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
}

/** Tentativas da amostragem por rejeição (o teto do shader). */
export const CLOUD_PHASE_TRIES = 8;

/**
 * Cosseno amostrado da fase truncada: com a chance `pickHG`, a HG pela inversa restrita a `μ < cosCut`; senão Draine por
 * rejeição sobre a HG de `g_D` (envelope `(1 + αμ²)/(1 + α)`) e fora do núcleo, com `CLOUD_PHASE_TRIES` tentativas (a
 * última é aceita).
 */
export function sampleTruncatedCos(p: JdeParams, t: PhaseTruncation, rng: () => number): number {
    if (rng() < t.pickHG) {
        const g = p.gHG;
        const q = (rng() * t.cdfHG * 2 * g) / (1 - g * g) + 1 / (1 + g);
        return Math.min(t.cosCut, Math.max(-1, (1 + g * g - 1 / (q * q)) / (2 * g)));
    }
    const g = p.gD;
    let mu = 0;
    for (let k = 0; k < CLOUD_PHASE_TRIES; k++) {
        const s = (1 - g * g) / (1 - g + 2 * g * rng());
        mu = Math.max(-1, Math.min(1, (1 + g * g - s * s) / (2 * g)));
        const accept = (1 + p.alpha * mu * mu) / (1 + p.alpha);
        if (mu <= t.cosCut && rng() < accept) return mu;
    }
    return Math.min(mu, t.cosCut);
}

/** A luz que um caminho encontra: o sol (direção, a luz num ponto e a profundidade ótica até ele), o céu e o chão. */
export interface ScatterLight {
    readonly sunDir: Vec3;
    /** A iluminância do sol que chega ao topo da atmosfera sobre o ponto (já atenuada pela atmosfera até ele). */
    readonly sunAt: (x: Vec3) => Vec3;
    /** A profundidade ótica das nuvens (meio completo) de `x` até o sol. */
    readonly sunDepth: (x: Vec3) => number;
    /** A radiância do céu numa direção. */
    readonly sky: (d: Vec3) => Vec3;
    /** A radiância do chão no ponto onde o caminho o encontra (o caminho para ali). */
    readonly ground: (x: Vec3) => Vec3;
    /**
     * A parte do sol na radiância do chão (o resto é a do céu; T074: as duas partes guardadas cada uma pela sua luz).
     * Ausente: o chão todo na parte do céu.
     */
    readonly groundSun?: (x: Vec3) => Vec3;
}

/** As duas partes da luz de um caminho (T074): a do sol (os próximos eventos ao sol e o sol no chão) e a do céu. */
export interface ScatterParts {
    readonly sun: number[];
    readonly sky: number[];
}

/** O piso da transmitância da atmosfera até a sonda na parte do sol guardada (a sonda na sombra da Terra). */
export const CLOUD_SCATTER_SUN_FLOOR = 1e-3;
/** O piso da irradiância do céu na parte do céu guardada (unidades da cena; a noite sem céu). */
export const CLOUD_SCATTER_SKY_FLOOR = 1e-9;

/**
 * A luz de uma sonda como o cache a guarda (T074; espelho de `cloud_scatter_main`): a parte do sol por unidade da
 * iluminância do sol que chega à sonda (`sun × atmosphere`, a transmitância da atmosfera até ela com o piso) e a do céu
 * por unidade da irradiância do céu de cima (`sky`) — a cor e o brilho do sol baixo, que mudam depressa com o ângulo, saem do
 * que a página guarda e entram na leitura com o sol e o céu de agora (`scatterRecompose`).
 */
export function scatterNormalize(
    parts: ScatterParts,
    sun: Vec3,
    atmosphere: Vec3,
    sky: Vec3,
): ScatterParts {
    return {
        sun: [0, 1, 2].map(
            (c) => parts.sun[c]! / (sun[c]! * Math.max(atmosphere[c]!, CLOUD_SCATTER_SUN_FLOOR)),
        ),
        sky: [0, 1, 2].map((c) => parts.sky[c]! / Math.max(sky[c]!, CLOUD_SCATTER_SKY_FLOOR)),
    };
}

/**
 * A luz guardada de volta na unidade da cena com o sol (`sun` a iluminância no topo, `atmosphere` a transmitância até o
 * ponto lido) e o céu (`sky`, a irradiância de cima) de agora.
 */
export function scatterRecompose(
    stored: ScatterParts,
    sun: Vec3,
    atmosphere: Vec3,
    sky: Vec3,
): Vec3 {
    return [0, 1, 2].map(
        (c) =>
            stored.sun[c]! * sun[c]! * Math.max(atmosphere[c]!, CLOUD_SCATTER_SUN_FLOOR)
            + stored.sky[c]! * Math.max(sky[c]!, CLOUD_SCATTER_SKY_FLOOR),
    ) as unknown as Vec3;
}

/** Tetos do caminho: colisões reais e passos (todos: nulos, reais e saltos), como no shader. */
export const CLOUD_SCATTER_COLLISIONS = 24;
export const CLOUD_SCATTER_STEPS = 256;

/**
 * Um caminho a partir de `x0` (a sonda) para a câmera em `dcam` (a direção da câmera até a sonda): a primeira direção é
 * `dcam` com a chance `fc` (o núcleo transmitido) ou a fase truncada em volta dela; rastreamento delta no meio truncado
 * (extinção `σt·(1 − ω·fc)`, albedo `ω(1 − fc)/(1 − ω·fc)`, majorante a extinção na densidade 1), o próximo evento ao sol
 * em cada colisão (a fase truncada, a profundidade ótica truncada até ele), o céu ao sair por cima ou pelo lado, o chão
 * ao sair por baixo. Devolve a luz que chega a `x0` na direção amostrada (a estimativa da luz da sonda); com `parts`,
 * soma nele as duas partes (o sol e o céu, `ScatterParts`).
 */
export function scatterWalk(
    m: CloudModel,
    x0: Vec3,
    dcam: Vec3,
    light: ScatterLight,
    p: JdeParams,
    t: PhaseTruncation,
    rng: () => number,
    collisions = CLOUD_SCATTER_COLLISIONS,
    steps = CLOUD_SCATTER_STEPS,
    parts?: ScatterParts,
): Vec3 {
    const kT = 1 - m.albedo * t.fc;
    const albedo = (m.albedo * (1 - t.fc)) / kT;
    const majorant = m.density * kT;
    const R = m.groundRadius;
    let d: Vec3 =
        rng() < t.fc
            ? dcam
            : rotateAround(dcam, sampleTruncatedCos(p, t, rng), 2 * Math.PI * rng());
    let x = x0;
    let thr = 1;
    const L = [0, 0, 0];
    let hits = 0;
    const add = (v: Vec3, w: number, sun = false): void => {
        for (let c = 0; c < 3; c++) {
            L[c]! += v[c]! * w;
            if (parts !== undefined) (sun ? parts.sun : parts.sky)[c]! += v[c]! * w;
        }
    };
    const ground = (xg: Vec3, w: number): void => {
        const g = light.ground(xg);
        const gs = light.groundSun?.(xg) ?? [0, 0, 0];
        add(gs, w, true);
        add([g[0] - gs[0], g[1] - gs[1], g[2] - gs[2]], w);
    };
    for (let s = 0; s < steps; s++) {
        const alt = altitude(m, x);
        const up: Vec3 = [x[0] / (R + alt), (x[1] + R) / (R + alt), x[2] / (R + alt)];
        const rising = up[0] * d[0] + up[1] * d[1] + up[2] * d[2];
        if (alt >= m.top) {
            if (rising >= 0) {
                add(light.sky(d), thr);
                return L as unknown as Vec3;
            }
            // Acima da camada descendo: salta até a entrada pelo topo (no vazio não há colisão).
            const span = sphereSpan(m, x, d, R + m.top);
            if (span === undefined) {
                add(light.sky(d), thr);
                return L as unknown as Vec3;
            }
            const tt = span[0] + 1e-3;
            x = [x[0] + d[0] * tt, x[1] + d[1] * tt, x[2] + d[2] * tt];
            continue;
        }
        if (alt <= m.base) {
            if (rising < 0) {
                // Abaixo da camada descendo: o chão (ou o céu, se o raio passar do horizonte do planeta).
                const g = sphereSpan(m, x, d, R);
                if (g !== undefined && g[0] > 0)
                    ground([x[0] + d[0] * g[0], x[1] + d[1] * g[0], x[2] + d[2] * g[0]], thr);
                else add(light.sky(d), thr);
                return L as unknown as Vec3;
            }
            const span = sphereSpan(m, x, d, R + m.base);
            const tt = (span === undefined ? 0 : Math.max(span[1], 0)) + 1e-3;
            x = [x[0] + d[0] * tt, x[1] + d[1] * tt, x[2] + d[2] * tt];
            continue;
        }
        const dt = -Math.log(1 - rng()) / majorant;
        x = [x[0] + d[0] * dt, x[1] + d[1] * dt, x[2] + d[2] * dt];
        const a2 = altitude(m, x);
        if (a2 >= m.top || a2 <= m.base) continue;
        const sigma = cloudDensity(m, x) * m.density * kT;
        if (rng() >= sigma / majorant) continue;
        thr *= albedo;
        const c = d[0] * light.sunDir[0] + d[1] * light.sunDir[1] + d[2] * light.sunDir[2];
        const ph = truncatedPhase(c, p, t);
        if (ph > 0) add(light.sunAt(x), thr * Math.exp(-light.sunDepth(x) * kT) * ph, true);
        d = rotateAround(d, sampleTruncatedCos(p, t, rng), 2 * Math.PI * rng());
        if (++hits >= collisions) return L as unknown as Vec3;
    }
    // Passos esgotados: o resto sai pelo céu na direção do caminho.
    add(light.sky(d), thr);
    return L as unknown as Vec3;
}

/** A grade das sondas: lados, centro (x, z), escala e alcance do asinh do plano. */
export interface ScatterGrid {
    readonly size: readonly [number, number, number];
    readonly center: readonly [number, number];
    readonly x0: number;
    readonly reach: number;
}

/** A posição de mundo da sonda (i, j, k): x e z por `x0·sinh(alcance·a)`, `a` ∈ (−1, 1); a altitude no meio da camada. */
export function scatterProbePosition(
    m: CloudModel,
    g: ScatterGrid,
    i: number,
    j: number,
    k: number,
): Vec3 {
    const ax = ((i + 0.5) / g.size[0]) * 2 - 1;
    const az = ((k + 0.5) / g.size[2]) * 2 - 1;
    const x = g.center[0] + g.x0 * Math.sinh(g.reach * ax);
    const z = g.center[1] + g.x0 * Math.sinh(g.reach * az);
    const alt = m.base + ((j + 0.5) / g.size[1]) * (m.top - m.base);
    const R = m.groundRadius;
    const y = Math.sqrt(Math.max(0, (R + alt) ** 2 - x * x - z * z)) - R;
    return [x, y, z];
}

/** As coordenadas contínuas da grade (em texels, centros em k + 0,5) de um ponto. */
export function scatterGridCoords(m: CloudModel, g: ScatterGrid, x: Vec3): Vec3 {
    const ax = Math.asinh((x[0] - g.center[0]) / g.x0) / g.reach;
    const az = Math.asinh((x[2] - g.center[1]) / g.x0) / g.reach;
    const h = (altitude(m, x) - m.base) / (m.top - m.base);
    return [((ax + 1) / 2) * g.size[0], h * g.size[1], ((az + 1) / 2) * g.size[2]];
}

/** Leitura trilinear (com a borda presa) de um campo por sonda `value(i, j, k)`. */
export function scatterLookup(
    m: CloudModel,
    g: ScatterGrid,
    x: Vec3,
    value: (i: number, j: number, k: number) => Vec3,
): Vec3 {
    const f = scatterGridCoords(m, g, x).map((v) => v - 0.5);
    const b = f.map(Math.floor);
    const fr = f.map((v, k) => v - b[k]!);
    const out = [0, 0, 0];
    for (let dz = 0; dz < 2; dz++)
        for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) {
                const w =
                    (dx ? fr[0]! : 1 - fr[0]!)
                    * (dy ? fr[1]! : 1 - fr[1]!)
                    * (dz ? fr[2]! : 1 - fr[2]!);
                if (w === 0) continue;
                const i = Math.min(g.size[0] - 1, Math.max(0, b[0]! + dx));
                const j = Math.min(g.size[1] - 1, Math.max(0, b[1]! + dy));
                const k = Math.min(g.size[2] - 1, Math.max(0, b[2]! + dz));
                const v = value(i, j, k);
                for (let c = 0; c < 3; c++) out[c]! += w * v[c]!;
            }
    return out as unknown as Vec3;
}

/**
 * A marcha do esquema: o meio completo na câmera, o feixe do sol (o não desviado e o desviado pelo núcleo da fase, δ-M)
 * espalhado pela fase completa e a luz das sondas × σs.
 */
export function marchScatter(
    m: CloudModel,
    o: Vec3,
    d: Vec3,
    tMax: number,
    light: ScatterLight,
    p: JdeParams,
    t: PhaseTruncation,
    probe: (x: Vec3) => Vec3,
    steps = 256,
): { scattered: Vec3; transmittance: number } {
    // O feixe do sol que chega ao ponto inclui a luz que o núcleo da fase desviou menos de θc (δ-M): `e^(−(1 − ω·fc)τ)`.
    const kT = 1 - m.albedo * t.fc;
    let T = 1;
    const L = [0, 0, 0];
    const cos = d[0] * light.sunDir[0] + d[1] * light.sunDir[1] + d[2] * light.sunDir[2];
    const ph = jdePhase(cos, p);
    for (const [a, b] of shellSegments(m, o, d, tMax)) {
        const dt = (b - a) / steps;
        for (let i = 0; i < steps; i++) {
            const tt = a + (i + 0.5) * dt;
            const x: Vec3 = [o[0] + d[0] * tt, o[1] + d[1] * tt, o[2] + d[2] * tt];
            const sigma = cloudDensity(m, x) * m.density;
            if (sigma <= 0) continue;
            const e = Math.exp(-sigma * dt);
            const w = T * (1 - e) * m.albedo;
            const sun = light.sunAt(x);
            const ts = Math.exp(-light.sunDepth(x) * kT) * ph;
            const J = probe(x);
            for (let c = 0; c < 3; c++) L[c]! += w * (sun[c]! * ts + J[c]!);
            T *= e;
            if (T < 1e-6) return { scattered: L as unknown as Vec3, transmittance: T };
        }
    }
    return { scattered: L as unknown as Vec3, transmittance: T };
}

/**
 * O centro (mundo, x e z) da grade das sondas no referencial das nuvens (T074; espelho do empacotamento em
 * `CloudNoiseFlow`): a câmera nesse referencial (`eye − offset`, o deslocamento do vento) encaixada a `snap`, de volta ao
 * mundo. As sondas andam com as nuvens: o vento não muda o que elas guardam (o conteúdo à volta de cada uma é o mesmo), e
 * a grade só troca de centro quando a câmera, nesse referencial, cruza o encaixe.
 */
export function scatterGridCenter(
    eye: readonly [number, number],
    offset: readonly [number, number],
    snap: number,
): [number, number] {
    const at = (e: number, o: number): number => Math.floor((e - o) / snap + 0.5) * snap + o;
    return [at(eye[0], offset[0]), at(eye[1], offset[1])];
}

/** A área (m²) de uma sonda no plano no ponto `x` da grade `g` (o produto dos espaçamentos nos dois eixos). */
export function scatterCellArea(g: ScatterGrid, x: Vec3): number {
    const s = (v: number, c: number, n: number): number => {
        const a = Math.asinh((v - c) / g.x0) / g.reach;
        return (g.x0 * g.reach * Math.cosh(g.reach * a) * 2) / n;
    };
    return s(x[0], g.center[0], g.size[0]) * s(x[2], g.center[1], g.size[2]);
}

/**
 * O peso da sonda levada da grade de antes à de agora quando o centro muda (T074; espelho de `cloud_scatter_carry`): a
 * contagem filtrada da de antes no ponto × `min(1, A_agora/A_antes)` (as áreas da sonda no plano) — a sonda de antes mais
 * espaçada guarda a luz de uma área maior, e vale menos caminhos na sonda mais fina de agora; mais fina, vale inteira.
 * Fora da grade de antes, 0 (a sonda que entra pela borda começa do zero).
 */
export function scatterCarryWeight(
    now: ScatterGrid,
    before: ScatterGrid,
    m: CloudModel,
    x: Vec3,
): number {
    const f = scatterGridCoords(m, before, x);
    if (f[0] < 0 || f[0] > before.size[0] || f[2] < 0 || f[2] > before.size[2]) return 0;
    return Math.min(1, scatterCellArea(now, x) / scatterCellArea(before, x));
}
