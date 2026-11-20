// Referência em f64 da atmosfera como meio dos froxels (spec 041, R21): o espelho de uma coluna da grade (a injeção, o
// acúmulo no limite e a integração por fatias) com o mesmo integrando da tabela da perspectiva aérea, a leitura dos
// froxels e da tabela como a GPU as faz, e a emenda perto/longe — os froxels da câmera até o alcance deles, a tabela só
// do alcance ao ponto (a diferença da luz espalhada dela). A integral contínua é `aerialPerspective` com a mesma
// visibilidade e passos finos. Distâncias em km; por unidade de iluminância do sol.

import {
    mediumAt,
    miePhase,
    rayleighPhase,
    segmentLength,
    transmittanceToTop,
    type AerialColumn,
    type AtmosphereParams,
    type SunVisibility,
    type Vec3,
} from '../../scene/reference/atmosphere';

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const mul = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => add(scale(a, 1 - t), scale(b, t));

/** A coluna dos froxels no centro da tela (a distância ao longo do raio é a profundidade da vista). */
export interface FroxelAtmosphereColumn {
    /** A distância (km) do começo da primeira fatia e do fim de cada uma. */
    readonly near: number;
    readonly distance: readonly number[];
    /** A luz espalhada da câmera até o fim de cada fatia (a da grade inteira: o meio até o alcance). */
    readonly scattered: readonly Vec3[];
}

/** Opções da coluna (as da GPU por padrão: 128 fatias exponenciais de 0,1 m até o fim da grade). */
export interface FroxelColumnOptions {
    /** Começo da primeira fatia (km). Padrão 10⁻⁴ (`FROXEL_NEAR`). */
    readonly near?: number;
    /** Fim da última fatia (km). Padrão 32 (o alcance da tabela). */
    readonly far?: number;
    /** Fatias. Padrão 128. */
    readonly slices?: number;
    /**
     * Pontos por fatia: o limite do acúmulo temporal da injeção (um ponto por quadro, sorteado na fatia uniforme no
     * índice dela — logo na escala logarítmica da distância). Padrão 32 (estratificados).
     */
    readonly samples?: number;
    /** Até onde o meio entra (km, radial: o alcance da tabela). Padrão 32. */
    readonly range?: number;
}

/**
 * O integrando da tabela num ponto do raio a `t` km (o espelho de `scene_medium` do `Sky`): a luz simples do sol (as
 * fases, a transmitância da atmosfera até o sol, a visibilidade) mais a múltipla Ψms, e a extinção. Fora da atmosfera ou
 * além de `range`, nada.
 */
function mediumSample(
    p: AtmosphereParams,
    pos: Vec3,
    view: Vec3,
    sun: Vec3,
    seg: number,
    range: number,
    t: number,
    ms: (r: number, muS: number) => Vec3,
    visibility: SunVisibility,
): { free: Vec3; multi: Vec3; extinction: Vec3 } {
    if (t > seg || t > range) return { free: [0, 0, 0], multi: [0, 0, 0], extinction: [0, 0, 0] };
    const x = add(pos, scale(view, t));
    const rx = len(x);
    const m = mediumAt(p, rx - p.bottomRadius);
    const cosTheta = dot(view, sun);
    const muS = dot(x, sun) / rx;
    const free = mul(
        add(scale(m.rayleigh, rayleighPhase(cosTheta)), [
            m.mie * miePhase(cosTheta, p.mieG),
            m.mie * miePhase(cosTheta, p.mieG),
            m.mie * miePhase(cosTheta, p.mieG),
        ]),
        transmittanceToTop(p, rx, muS, 64),
    );
    return {
        free: scale(free, visibility(x)),
        multi: mul(m.scattering, ms(rx, muS)),
        extinction: m.extinction,
    };
}

/**
 * Espelho f64 de uma coluna dos froxels com a atmosfera como meio (`media_froxel_inject` + o acúmulo no limite +
 * `media_froxel_integrate`): por fatia exponencial, a fonte média nos pontos sorteados (uniformes no índice da fatia), a
 * extinção no meio da fatia, a integral exata do meio homogêneo — `S·(1 − e^(−σΔ))/σ` — atenuada pela transmitância
 * acumulada.
 */
export function froxelAtmosphereColumn(
    p: AtmosphereParams,
    altitude: number,
    view: Vec3,
    sun: Vec3,
    ms: (r: number, muS: number) => Vec3,
    visibility: SunVisibility,
    options: FroxelColumnOptions = {},
): FroxelAtmosphereColumn {
    const near = options.near ?? 1e-4;
    const far = options.far ?? 32;
    const slices = options.slices ?? 128;
    const samples = options.samples ?? 32;
    const range = options.range ?? 32;
    const r = p.bottomRadius + altitude;
    const pos: Vec3 = [0, r, 0];
    const seg = segmentLength(p, r, view[1]);
    const depth = (s: number): number => near * Math.exp((s / slices) * Math.log(far / near));
    const distance: number[] = [];
    const scattered: Vec3[] = [];
    let lum: Vec3 = [0, 0, 0];
    let through: Vec3 = [1, 1, 1];
    for (let k = 0; k < slices; k++) {
        const z0 = depth(k);
        const z1 = depth(k + 1);
        // A parte lisa no centro da fatia (o meio do índice dela), a visibilidade média nos pontos sorteados.
        const center = mediumSample(p, pos, view, sun, seg, range, depth(k + 0.5), ms, () => 1);
        const x0 = (t: number): Vec3 => add(pos, scale(view, t));
        let vis = 0;
        for (let j = 0; j < samples; j++) vis += visibility(x0(depth(k + (j + 0.5) / samples)));
        const source = add(scale(center.free, vis / samples), center.multi);
        const sigma = mediumSample(
            p,
            pos,
            view,
            sun,
            seg,
            range,
            0.5 * (z0 + z1),
            ms,
            () => 1,
        ).extinction;
        const dt = z1 - z0;
        const integ = [0, 1, 2].map((c) => {
            const x = sigma[c]! * dt;
            return x > 0 ? (dt * (1 - Math.exp(-x))) / x : dt;
        }) as unknown as Vec3;
        lum = add(lum, mul(through, mul(source, integ)));
        through = mul(through, [0, 1, 2].map((c) => Math.exp(-sigma[c]! * dt)) as unknown as Vec3);
        distance.push(z1);
        scattered.push(lum);
    }
    return { near, distance, scattered };
}

/**
 * A leitura dos froxels a `d` km (`froxel_fog` no centro da tela): linear entre os fins das fatias no índice contínuo
 * delas; antes do fim da primeira, a fração dela desde nada; depois da última, a última.
 */
export function froxelLookup(column: FroxelAtmosphereColumn, d: number): Vec3 {
    const n = column.distance.length;
    const far = column.distance[n - 1]!;
    if (d <= column.near) return [0, 0, 0];
    const f = (Math.log(d / column.near) / Math.log(far / column.near)) * n;
    const s = Math.min(Math.max(f - 1, 0), n - 1);
    const k = Math.min(Math.floor(s), n - 2);
    const value = mix(column.scattered[k]!, column.scattered[k + 1]!, s - k);
    return f < 1 ? scale(column.scattered[0]!, f) : value;
}

/**
 * A leitura da tabela da perspectiva aérea a `d` km (`sky_aerial` até o alcance dela): pela raiz da distância entre os
 * fins das fatias; antes do fim da primeira, linear desde (0, 1).
 */
export function aerialLookup(
    column: AerialColumn,
    d: number,
    range = 32,
): { scattered: Vec3; transmittance: Vec3 } {
    const n = column.distance.length;
    const first = range / (n * n);
    const s = Math.min(Math.max(Math.sqrt(Math.min(d, range) / range) * n - 1, 0), n - 1);
    const k = Math.min(Math.floor(s), n - 2);
    const scattered = mix(column.scattered[k]!, column.scattered[k + 1]!, s - k);
    const transmittance = mix(column.transmittance[k]!, column.transmittance[k + 1]!, s - k);
    if (d < first) {
        const w = d / first;
        return { scattered: scale(scattered, w), transmittance: mix([1, 1, 1], transmittance, w) };
    }
    return { scattered, transmittance };
}

/**
 * A emenda perto/longe (R21; `sky_scene_fog_far` sobre a leitura dos froxels): os froxels da câmera até `min(d, alcance)`
 * e a tabela só do alcance ao ponto — `S = Sf(min(d, a)) + Sa(d) − Sa(min(d, a))`, a transmitância a da tabela.
 */
export function nearFarAerial(
    froxels: FroxelAtmosphereColumn,
    table: AerialColumn,
    reach: number,
    d: number,
): { scattered: Vec3; transmittance: Vec3 } {
    const m = Math.min(d, reach);
    const far = aerialLookup(table, d);
    const start = aerialLookup(table, m);
    return {
        scattered: add(froxelLookup(froxels, m), sub(far.scattered, start.scattered)),
        transmittance: far.transmittance,
    };
}
