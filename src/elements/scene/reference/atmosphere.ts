// Referência em CPU do céu físico (spec 033, R4): o modelo de atmosfera de Hillaire (2020) — espalhamento de Rayleigh
// e de Mie, absorção do ozônio, múltiplo espalhamento pela aproximação isotrópica de segunda ordem (Ψms) — integrado
// numericamente, sem tabelas, em passos quadráticos (as camadas densas ficam perto do chão). Os módulos WGSL `sky_*` calculam o mesmo por tabelas; o teste e o smoke `sky` comparam.
// Distâncias em km; o planeta centrado na origem, o "para cima" é +y (o da cena).

export type Vec3 = readonly [number, number, number];

/** Parâmetros da atmosfera (os do `Sky`). */
export interface AtmosphereParams {
    /** Raio do planeta (km). */
    readonly bottomRadius: number;
    /** Raio do topo da atmosfera (km). */
    readonly topRadius: number;
    /** Espalhamento de Rayleigh ao nível do chão (1/km). */
    readonly rayleighScattering: Vec3;
    /** Altura de escala de Rayleigh (km). */
    readonly rayleighScale: number;
    /** Espalhamento de Mie ao nível do chão (1/km). */
    readonly mieScattering: number;
    /** Extinção de Mie ao nível do chão (1/km). */
    readonly mieExtinction: number;
    /** Altura de escala de Mie (km). */
    readonly mieScale: number;
    /** Assimetria da fase de Mie. */
    readonly mieG: number;
    /** Absorção do ozônio no pico (1/km). */
    readonly ozoneAbsorption: Vec3;
    /** Centro da camada de ozônio (km). */
    readonly ozoneCenter: number;
    /** Meia largura da camada de ozônio (km). */
    readonly ozoneHalfWidth: number;
    /** Albedo do chão (para o múltiplo espalhamento). */
    readonly groundAlbedo: Vec3;
}

/** Terra (Hillaire 2020, tabela 1). `turbidity` multiplica o Mie (1 = céu limpo). */
export function earthAtmosphere(turbidity = 1): AtmosphereParams {
    return {
        bottomRadius: 6360,
        topRadius: 6460,
        rayleighScattering: [5.802e-3, 13.558e-3, 33.1e-3],
        rayleighScale: 8,
        mieScattering: 3.996e-3 * turbidity,
        mieExtinction: 4.44e-3 * turbidity,
        mieScale: 1.2,
        mieG: 0.8,
        ozoneAbsorption: [0.65e-3, 1.881e-3, 0.085e-3],
        ozoneCenter: 25,
        ozoneHalfWidth: 15,
        groundAlbedo: [0.3, 0.3, 0.3],
    };
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const mul = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const exp3 = (a: Vec3): Vec3 => [Math.exp(a[0]), Math.exp(a[1]), Math.exp(a[2])];

/** Coeficientes do meio a uma altura `h` (km acima do chão). */
export interface Medium {
    readonly scattering: Vec3;
    readonly extinction: Vec3;
    readonly rayleigh: Vec3;
    readonly mie: number;
}

/** Espalhamento e extinção à altura `h`. */
export function mediumAt(p: AtmosphereParams, h: number): Medium {
    const dr = Math.exp(-h / p.rayleighScale);
    const dm = Math.exp(-h / p.mieScale);
    const dz = Math.max(0, 1 - Math.abs(h - p.ozoneCenter) / p.ozoneHalfWidth);
    const rayleigh = scale(p.rayleighScattering, dr);
    const mie = p.mieScattering * dm;
    const mieExt = p.mieExtinction * dm;
    const ozone = scale(p.ozoneAbsorption, dz);
    return {
        rayleigh,
        mie,
        scattering: add(rayleigh, [mie, mie, mie]),
        extinction: add(add(rayleigh, [mieExt, mieExt, mieExt]), ozone),
    };
}

/** Fase de Rayleigh. */
export function rayleighPhase(cosTheta: number): number {
    return (3 / (16 * Math.PI)) * (1 + cosTheta * cosTheta);
}

/** Fase de Mie de Cornette-Shanks. */
export function miePhase(cosTheta: number, g: number): number {
    const k = (3 / (8 * Math.PI)) * ((1 - g * g) / (2 + g * g));
    return (k * (1 + cosTheta * cosTheta)) / Math.pow(1 + g * g - 2 * g * cosTheta, 1.5);
}

/** Distância até a esfera de raio `radius` saindo de `r` com cosseno zenital `mu` (≥ 0 se sai; −1 se não atinge). */
function distanceToSphere(r: number, mu: number, radius: number, far: boolean): number {
    const disc = r * r * (mu * mu - 1) + radius * radius;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    const t = far ? -r * mu + s : -r * mu - s;
    return t;
}

/** O raio de `r`, `mu` atinge o chão? */
export function hitsGround(p: AtmosphereParams, r: number, mu: number): boolean {
    return mu < 0 && r * r * (mu * mu - 1) + p.bottomRadius * p.bottomRadius >= 0;
}

/** Comprimento do segmento dentro da atmosfera (até o topo ou o chão). */
export function segmentLength(p: AtmosphereParams, r: number, mu: number): number {
    if (hitsGround(p, r, mu)) return Math.max(0, distanceToSphere(r, mu, p.bottomRadius, false));
    return Math.max(0, distanceToSphere(r, mu, p.topRadius, true));
}

/**
 * Passos quadráticos de [0, `length`] (mais curtos perto da origem, onde ficam as camadas densas): o meio e o
 * comprimento de cada passo.
 */
function quadraticSteps(length: number, steps: number): { t: number; dt: number }[] {
    const out: { t: number; dt: number }[] = [];
    for (let i = 0; i < steps; i++) {
        const t0 = length * (i / steps) ** 2;
        const t1 = length * ((i + 1) / steps) ** 2;
        out.push({ t: (t0 + t1) * 0.5, dt: t1 - t0 });
    }
    return out;
}

/** Transmitância de `r`, `mu` até o topo da atmosfera (0 se o raio atinge o chão). */
export function transmittanceToTop(p: AtmosphereParams, r: number, mu: number, steps = 256): Vec3 {
    if (hitsGround(p, r, mu)) return [0, 0, 0];
    const length = Math.max(0, distanceToSphere(r, mu, p.topRadius, true));
    let depth: Vec3 = [0, 0, 0];
    for (const { t, dt } of quadraticSteps(length, steps)) {
        const ri = Math.sqrt(r * r + t * t + 2 * r * mu * t);
        depth = add(depth, scale(mediumAt(p, ri - p.bottomRadius).extinction, dt));
    }
    return exp3(scale(depth, -1));
}

/**
 * Ψms (Hillaire 2020, §5.5): luz do múltiplo espalhamento por unidade de iluminância do sol, a raio `r` com o sol a
 * cosseno zenital `muS` — a segunda ordem isotrópica `L2` somada como série geométrica de razão `fms`.
 */
export function multipleScattering(
    p: AtmosphereParams,
    r: number,
    muS: number,
    dirs = 64,
    steps = 40,
): Vec3 {
    const pos: Vec3 = [0, r, 0];
    const sun: Vec3 = [Math.sqrt(Math.max(0, 1 - muS * muS)), muS, 0];
    let l2: Vec3 = [0, 0, 0];
    let fms: Vec3 = [0, 0, 0];
    const isotropic = 1 / (4 * Math.PI);
    // Direções estratificadas em espiral de Fibonacci sobre a esfera.
    for (let k = 0; k < dirs; k++) {
        const z = 1 - (2 * (k + 0.5)) / dirs;
        const phi = k * Math.PI * (3 - Math.sqrt(5));
        const s = Math.sqrt(1 - z * z);
        const dir: Vec3 = [s * Math.cos(phi), z, s * Math.sin(phi)];
        const mu = dot(pos, dir) / r;
        const length = segmentLength(p, r, mu);
        let throughput: Vec3 = [1, 1, 1];
        let lum: Vec3 = [0, 0, 0];
        let fmsDir: Vec3 = [0, 0, 0];
        for (const { t, dt } of quadraticSteps(length, steps)) {
            const x = add(pos, scale(dir, t));
            const rx = len(x);
            const m = mediumAt(p, rx - p.bottomRadius);
            const stepT = exp3(scale(m.extinction, -dt));
            // Integral analítica do segmento: (1 − e^(−σt·dt)) / σt.
            const integ: Vec3 = [0, 1, 2].map((c) =>
                m.extinction[c]! > 0 ? (1 - stepT[c]!) / m.extinction[c]! : dt,
            ) as unknown as Vec3;
            const muSx = dot(x, sun) / rx;
            const sunT = transmittanceToTop(p, rx, muSx, 48);
            const inScatter = scale(mul(m.scattering, sunT), isotropic);
            lum = add(lum, mul(mul(throughput, inScatter), integ));
            fmsDir = add(fmsDir, mul(mul(throughput, m.scattering), integ));
            throughput = mul(throughput, stepT);
        }
        // Chão: rebate a luz do sol (Lambert) atenuada até ele.
        if (hitsGround(p, r, mu)) {
            const x = add(pos, scale(dir, length));
            const n = scale(x, 1 / len(x));
            const nl = Math.max(0, dot(n, sun));
            const sunT = transmittanceToTop(p, p.bottomRadius, dot(n, sun), 48);
            lum = add(lum, scale(mul(mul(throughput, sunT), p.groundAlbedo), nl / Math.PI));
        }
        l2 = add(l2, scale(lum, (4 * Math.PI) / dirs));
        fms = add(fms, scale(fmsDir, (4 * Math.PI) / dirs));
    }
    l2 = scale(l2, isotropic);
    fms = scale(fms, isotropic);
    return [0, 1, 2].map((c) => l2[c]! / (1 - fms[c]!)) as unknown as Vec3;
}

/**
 * Radiância do céu por unidade de iluminância do sol vista de `altitude` (km) na direção `view` com o sol na direção
 * `sun` (ambos unitários, +y para cima): espalhamento simples de Rayleigh e Mie com a transmitância do sol, mais o
 * múltiplo espalhamento Ψms, integrados ao longo do raio até o topo ou o chão. Sem o disco do sol.
 */
export function skyRadiance(
    p: AtmosphereParams,
    altitude: number,
    view: Vec3,
    sun: Vec3,
    steps = 128,
    ms?: (r: number, muS: number) => Vec3,
): Vec3 {
    const r = p.bottomRadius + altitude;
    const pos: Vec3 = [0, r, 0];
    const mu = view[1];
    const length = segmentLength(p, r, mu);
    const cosTheta = dot(view, sun);
    const pr = rayleighPhase(cosTheta);
    const pm = miePhase(cosTheta, p.mieG);
    const msOf = ms ?? ((rr: number, muS: number): Vec3 => multipleScattering(p, rr, muS, 32, 24));
    let throughput: Vec3 = [1, 1, 1];
    let lum: Vec3 = [0, 0, 0];
    for (const { t, dt } of quadraticSteps(length, steps)) {
        const x = add(pos, scale(view, t));
        const rx = len(x);
        const m = mediumAt(p, rx - p.bottomRadius);
        const stepT = exp3(scale(m.extinction, -dt));
        const integ: Vec3 = [0, 1, 2].map((c) =>
            m.extinction[c]! > 0 ? (1 - stepT[c]!) / m.extinction[c]! : dt,
        ) as unknown as Vec3;
        const muSx = dot(x, sun) / rx;
        const sunT = transmittanceToTop(p, rx, muSx, 64);
        const single = mul(add(scale(m.rayleigh, pr), [m.mie * pm, m.mie * pm, m.mie * pm]), sunT);
        const multi = mul(m.scattering, msOf(rx, muSx));
        lum = add(lum, mul(mul(throughput, add(single, multi)), integ));
        throughput = mul(throughput, stepT);
    }
    // Abaixo do horizonte: o chão do planeta iluminado pelo sol (Lambert), atenuado até o observador.
    if (hitsGround(p, r, mu)) {
        const x = add(pos, scale(view, length));
        const n = scale(x, 1 / len(x));
        const muS = dot(n, sun);
        const sunT = transmittanceToTop(p, p.bottomRadius, muS);
        lum = add(
            lum,
            scale(mul(mul(throughput, sunT), p.groundAlbedo), Math.max(muS, 0) / Math.PI),
        );
    }
    return lum;
}

/** Transmitância do sol até um ponto a `altitude` (km) com o sol na direção `sun` (a cor física do sol no chão). */
export function sunTransmittance(p: AtmosphereParams, altitude: number, sun: Vec3): Vec3 {
    return transmittanceToTop(p, p.bottomRadius + altitude, sun[1]);
}

/** Luz espalhada e transmitância da atmosfera entre a câmera e um ponto (spec 041, R10). */
export interface AerialPerspective {
    /** Luz espalhada no trecho, por unidade de iluminância do sol. */
    readonly scattered: Vec3;
    /** Transmitância do trecho. */
    readonly transmittance: Vec3;
}

/**
 * A visibilidade do sol num ponto do ar além da atmosfera (spec 041, raios crepusculares): o ponto em km no sistema do
 * planeta (centro na origem, +y para cima); 1 ao sol, 0 na sombra de uma nuvem opaca, `e^(−τ)` atrás de uma rala.
 */
export type SunVisibility = (x: Vec3) => number;

/**
 * Perspectiva aérea (spec 041, R10; Hillaire 2020, §5.4): a luz espalhada (simples de Rayleigh e Mie com a
 * transmitância do sol, mais o múltiplo Ψms) e a transmitância da câmera, a `altitude` km, até a distância `distance` km
 * na direção `view`, cortada no topo e no chão da atmosfera. Por unidade de iluminância do sol; a superfície no ponto
 * fica de fora (`L' = L · T + S`). Distância infinita acima do horizonte = `skyRadiance`. Com `visibility`, a luz simples
 * de cada ponto × a visibilidade do sol ali (a sombra das nuvens no ar: os raios crepusculares); o múltiplo fica.
 */
export function aerialPerspective(
    p: AtmosphereParams,
    altitude: number,
    view: Vec3,
    sun: Vec3,
    distance: number,
    steps = 128,
    ms?: (r: number, muS: number) => Vec3,
    visibility?: SunVisibility,
): AerialPerspective {
    const r = p.bottomRadius + altitude;
    const pos: Vec3 = [0, r, 0];
    const length = Math.min(Math.max(distance, 0), segmentLength(p, r, view[1]));
    const cosTheta = dot(view, sun);
    const pr = rayleighPhase(cosTheta);
    const pm = miePhase(cosTheta, p.mieG);
    const msOf = ms ?? ((rr: number, muS: number): Vec3 => multipleScattering(p, rr, muS, 32, 24));
    let throughput: Vec3 = [1, 1, 1];
    let lum: Vec3 = [0, 0, 0];
    for (const { t, dt } of quadraticSteps(length, steps)) {
        const x = add(pos, scale(view, t));
        const rx = len(x);
        const m = mediumAt(p, rx - p.bottomRadius);
        const stepT = exp3(scale(m.extinction, -dt));
        const integ: Vec3 = [0, 1, 2].map((c) =>
            m.extinction[c]! > 0 ? (1 - stepT[c]!) / m.extinction[c]! : dt,
        ) as unknown as Vec3;
        const muSx = dot(x, sun) / rx;
        const sunT = transmittanceToTop(p, rx, muSx, 64);
        const v = visibility === undefined ? 1 : visibility(x);
        const single = scale(
            mul(add(scale(m.rayleigh, pr), [m.mie * pm, m.mie * pm, m.mie * pm]), sunT),
            v,
        );
        const multi = mul(m.scattering, msOf(rx, muSx));
        lum = add(lum, mul(mul(throughput, add(single, multi)), integ));
        throughput = mul(throughput, stepT);
    }
    return { scattered: lum, transmittance: throughput };
}

/** Uma coluna da tabela da perspectiva aérea com a sombra (o que o kernel `sky_aerial` grava). */
export interface AerialColumn {
    /** A luz espalhada da câmera até o fim de cada fatia (por unidade de iluminância do sol). */
    readonly scattered: readonly Vec3[];
    /** A transmitância da câmera até o fim de cada fatia. */
    readonly transmittance: readonly Vec3[];
    /** A distância (km) do fim de cada fatia. */
    readonly distance: readonly number[];
    /** O déficit da sombra no fundo: a luz simples que o ar sombreado deixa de espalhar até `shadowRange` km. */
    readonly deficit: Vec3;
}

/**
 * Espelho f64 de uma coluna do kernel `sky_aerial` (spec 041, raios crepusculares): `slices` fatias em distribuição
 * quadrática até `range` km, `substeps` subpassos pelo meio de cada uma (o que cruza o fim da atmosfera vai só até ele), a luz simples × a visibilidade do sol no meio
 * do subpasso; o déficit da sombra até `shadowRange` km (o resto além de `range` em `slices` trechos iguais). A integral
 * exata é `aerialPerspective` com a mesma visibilidade e passos finos.
 */
export function aerialColumn(
    p: AtmosphereParams,
    altitude: number,
    view: Vec3,
    sun: Vec3,
    ms: (r: number, muS: number) => Vec3,
    visibility: SunVisibility,
    range = 32,
    slices = 32,
    substeps = 4,
    shadowRange = 150,
): AerialColumn {
    const r = p.bottomRadius + altitude;
    const pos: Vec3 = [0, r, 0];
    const seg = segmentLength(p, r, view[1]);
    const cosTheta = dot(view, sun);
    const pr = rayleighPhase(cosTheta);
    const pm = miePhase(cosTheta, p.mieG);
    const span = (t0: number, t1: number): { lum: Vec3; deficit: Vec3; tr: Vec3 } => {
        const step = (t1 - t0) / substeps;
        let tr: Vec3 = [1, 1, 1];
        let lum: Vec3 = [0, 0, 0];
        let deficit: Vec3 = [0, 0, 0];
        for (let j = 0; j < substeps; j++) {
            // O subpasso cortado no fim da atmosfera (o topo ou o chão).
            const a = t0 + j * step;
            const dt = Math.max(Math.min(a + step, seg) - a, 0);
            if (dt <= 0) break;
            const mid = a + 0.5 * dt;
            const x = add(pos, scale(view, mid));
            const rx = len(x);
            const m = mediumAt(p, rx - p.bottomRadius);
            const stepT = exp3(scale(m.extinction, -dt));
            const integ: Vec3 = [0, 1, 2].map((c) =>
                m.extinction[c]! > 0 ? (1 - stepT[c]!) / m.extinction[c]! : dt,
            ) as unknown as Vec3;
            const muSx = dot(x, sun) / rx;
            const free = mul(
                add(scale(m.rayleigh, pr), [m.mie * pm, m.mie * pm, m.mie * pm]),
                transmittanceToTop(p, rx, muSx, 64),
            );
            const single = scale(free, visibility(x));
            const multi = mul(m.scattering, ms(rx, muSx));
            lum = add(lum, mul(mul(tr, add(single, multi)), integ));
            deficit = add(deficit, mul(mul(tr, add(free, scale(single, -1))), integ));
            tr = mul(tr, stepT);
        }
        return { lum, deficit, tr };
    };
    const scattered: Vec3[] = [];
    const transmittance: Vec3[] = [];
    const distance: number[] = [];
    let lum: Vec3 = [0, 0, 0];
    let deficit: Vec3 = [0, 0, 0];
    let tr: Vec3 = [1, 1, 1];
    for (let k = 0; k < slices; k++) {
        const t0 = range * (k / slices) ** 2;
        const t1 = range * ((k + 1) / slices) ** 2;
        const s = span(t0, t1);
        lum = add(lum, mul(tr, s.lum));
        deficit = add(deficit, mul(tr, s.deficit));
        tr = mul(tr, s.tr);
        scattered.push(lum);
        transmittance.push(tr);
        distance.push(t1);
    }
    const end = Math.max(Math.min(seg, shadowRange), range);
    const step = (end - range) / slices;
    for (let k = 0; k < slices; k++) {
        const s = span(range + k * step, range + (k + 1) * step);
        deficit = add(deficit, mul(tr, s.deficit));
        tr = mul(tr, s.tr);
    }
    return { scattered, transmittance, distance, deficit };
}
