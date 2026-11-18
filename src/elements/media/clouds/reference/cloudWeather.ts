// Referência f64 do tempo das nuvens (spec 041, R18): o campo de pressão em escala sinótica (o padrão de sistemas de
// alta e baixa que nascem, crescem e se desfazem), as derivadas pelo estêncil de 9 pontos, o vento equilibrado com a
// pressão (o vento gradiente com atrito linear: geostrófico, gradiente, ciclostrófico e antitríptico como limites), a
// velocidade vertical no topo da camada limite pela convergência do vento com atrito (a relação de Ekman), o parâmetro de
// Okubo–Weiss (a deformação que domina a rotação, onde os sistemas se encontram) e o mapeamento para a cobertura, o
// tipo e o topo das nuvens. Espelho de `gpu/wgsl/clouds/cloud_weather.wgsl`. Só para testes e smokes: a produção não
// importa daqui.
// Unidades: metros e segundos; x = leste, z = sul (y para cima, mão direita: o norte é −z); pressão em Pa (a anomalia
// em torno da média).

import { hash3, pcgHash, randomUnit } from '../../../math/reference/random';

/** Velocidade angular da Terra (rad/s, o dia sideral). */
export const EARTH_OMEGA = 7.2921159e-5;
/** Densidade do ar na camada limite (kg/m³). */
export const AIR_DENSITY = 1.2;
/** Espessura da camada limite (m): a convergência dela sobe o ar até o topo dela (Ekman). */
export const BOUNDARY_LAYER_DEPTH = 1000;
/**
 * Atrito linear da atmosfera livre (1/s, ~1 dia de amortecimento): regulariza o vento perto do equador (sem ele, o
 * equilíbrio geostrófico diverge com f → 0) e deixa o anticiclone com gradiente forte sempre com solução.
 */
export const FREE_DRAG = 1e-5;
/** Velocidade vertical (m/s) em que a subida é plena no mapeamento (2 cm/s: a escala sinótica de Ekman). */
export const WEATHER_LIFT = 0.02;
/** Velocidade de descida (m/s) em que a subsidência é plena (1 cm/s). */
export const WEATHER_SINK = 0.01;
/** Faixa da deformação de Okubo–Weiss (√W / f_e) em que a frente acende (calibrada em `cloudWeather.test.ts`). */
export const WEATHER_FRONT = [0.45, 0.75] as const;
/** Passos da varredura e da bisseção do vento gradiente (o mesmo teto constante da GPU). */
export const WIND_SCAN = 16;
export const WIND_BISECT = 24;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** `smoothstep` do WGSL. */
export function smoothstep(a: number, b: number, x: number): number {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
}
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** O parâmetro de Coriolis f = 2Ω sin φ (1/s) na latitude `degrees` (positivo no norte). */
export function coriolis(degrees: number): number {
    return 2 * EARTH_OMEGA * Math.sin((degrees * Math.PI) / 180);
}

/** A rotação efetiva do equilíbrio com atrito `r`: f_e = √(f² + r²) (nunca nula). */
export function effectiveRotation(f: number, r: number): number {
    return Math.hypot(f, r);
}

// ---------------------------------------------------------------------------------------------------------------------
// O padrão de sistemas (o campo de pressão padrão)

/** Parâmetros do padrão de sistemas. */
export interface PressurePattern {
    /** Espaçamento das células (m): no máximo um sistema por célula; o raio de um sistema é até esse lado. */
    readonly scale: number;
    /** Amplitude das baixas (Pa) já na latitude da cena (`patternAmplitude`). */
    readonly amplitude: number;
    /** Teto da amplitude das altas (Pa) pelo equilíbrio regular no centro (`highAmplitudeCap`). */
    readonly highCap: number;
    /** Vida de um sistema (s): do nascimento ao fim. */
    readonly lifetime: number;
    /** Semente (u32). */
    readonly seed: number;
}

/** Raio de uma baixa e de uma alta em células (as altas são mais largas e mais fracas no gradiente: o vento gradiente). */
export const PATTERN_LOW_RADIUS = 0.75;
export const PATTERN_HIGH_RADIUS = 1.0;
/** Fração das células cujo sistema é uma baixa. */
export const PATTERN_LOW_FRACTION = 0.5;

/**
 * A amplitude das baixas na latitude: a dada em 45° vezes `f_e(φ)/f_e(45°)` — a anomalia de pressão escala com a rotação
 * (Δp ~ ρ f U L): o vento característico fica o mesmo em toda latitude, e perto do equador os sistemas são fracos.
 */
export function patternAmplitude(amplitude45: number, f: number, r = FREE_DRAG): number {
    return (amplitude45 * effectiveRotation(f, r)) / effectiveRotation(coriolis(45), r);
}

/**
 * O teto da amplitude das altas (Pa): no centro de uma alta `A(1 − d²/R²)³`, |G|·κ = 6A/(ρR²), e o equilíbrio regular do
 * vento gradiente exige |G|·κ ≤ f²/4 (Holton, §3.2.5) — `A ≤ ρ f_e² R²/24`, com 20 % de folga.
 */
export function highAmplitudeCap(scale: number, f: number, r = FREE_DRAG): number {
    const R = PATTERN_HIGH_RADIUS * scale;
    const fe = effectiveRotation(f, r);
    return (0.8 * AIR_DENSITY * fe * fe * R * R) / 24;
}

/** O núcleo de suporte compacto `(1 − s)³`, s = d²/R² (C² na borda: o laplaciano é contínuo). */
export function bump(d2: number, radius: number): number {
    const s = d2 / (radius * radius);
    return s >= 1 ? 0 : (1 - s) ** 3;
}

/**
 * Um sistema da célula (i, j) no tempo `t`: centro (m), amplitude (Pa, com o envelope da vida) e raio (m). A geração
 * `floor(t/T + φ)` sorteia o centro (no miolo da célula), o sinal e a força; o envelope `sin²(π·idade)` é zero no
 * nascimento e no fim — a troca de geração acontece com o sistema extinto (sem salto).
 */
export function patternSystem(
    i: number,
    j: number,
    t: number,
    p: PressurePattern,
): { cx: number; cz: number; amplitude: number; radius: number } {
    const seed = p.seed >>> 0;
    const phase = randomUnit(hash3(i >>> 0, j >>> 0, seed));
    const s = Math.fround(Math.fround(t / p.lifetime) + phase);
    const gen = Math.floor(s);
    const age = s - gen;
    const g = (pcgHash(seed ^ (gen >>> 0)) ^ 0x51ed27) >>> 0;
    const h = hash3(i >>> 0, j >>> 0, g);
    const ux = randomUnit(pcgHash(h ^ 1));
    const uz = randomUnit(pcgHash(h ^ 2));
    const kind = randomUnit(pcgHash(h ^ 3));
    const force = 0.6 + 0.4 * randomUnit(pcgHash(h ^ 4));
    const low = kind < PATTERN_LOW_FRACTION;
    const envelope = Math.sin(Math.PI * age) ** 2;
    const a = low ? -p.amplitude : Math.min(p.amplitude, p.highCap);
    return {
        cx: (i + 0.15 + 0.7 * ux) * p.scale,
        cz: (j + 0.15 + 0.7 * uz) * p.scale,
        amplitude: a * force * envelope,
        radius: (low ? PATTERN_LOW_RADIUS : PATTERN_HIGH_RADIUS) * p.scale,
    };
}

/**
 * A anomalia de pressão padrão (Pa) em `(x, z)` (m, no referencial que anda com o vento de condução) no tempo `t`: a soma
 * dos sistemas das 3 × 3 células vizinhas (exata: o centro de uma célula a duas de distância fica a mais de um lado).
 */
export function defaultPressure(x: number, z: number, t: number, p: PressurePattern): number {
    const ci = Math.floor(x / p.scale);
    const cj = Math.floor(z / p.scale);
    let sum = 0;
    for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
            const s = patternSystem(ci + di, cj + dj, t, p);
            const d2 = (x - s.cx) ** 2 + (z - s.cz) ** 2;
            sum += s.amplitude * bump(d2, s.radius);
        }
    return sum;
}

// ---------------------------------------------------------------------------------------------------------------------
// Derivadas e vento

/** A pressão e as derivadas em (leste, norte): p, ∂p/∂E, ∂p/∂N, ∂²p/∂E², ∂²p/∂E∂N, ∂²p/∂N². */
export interface PressureDerivatives {
    readonly p: number;
    readonly pE: number;
    readonly pN: number;
    readonly pEE: number;
    readonly pEN: number;
    readonly pNN: number;
}

/**
 * As derivadas pelo estêncil de 9 pontos de lado `h` (m) em (x, z), levadas a (leste, norte) = (x, −z): diferenças
 * centradas de segunda ordem (o erro é O(h²/L²) para um campo de escala L).
 */
export function pressureStencil(
    fn: (x: number, z: number) => number,
    x: number,
    z: number,
    h: number,
): PressureDerivatives {
    const p = fn(x, z);
    const px0 = fn(x + h, z);
    const px1 = fn(x - h, z);
    const pz0 = fn(x, z + h);
    const pz1 = fn(x, z - h);
    const pa = fn(x + h, z + h);
    const pb = fn(x - h, z - h);
    const pc = fn(x + h, z - h);
    const pd = fn(x - h, z + h);
    const px = (px0 - px1) / (2 * h);
    const pz = (pz0 - pz1) / (2 * h);
    const pxx = (px0 - 2 * p + px1) / (h * h);
    const pzz = (pz0 - 2 * p + pz1) / (h * h);
    const pxz = (pa + pb - pc - pd) / (4 * h * h);
    // N = −z: ∂/∂N = −∂/∂z, ∂²/∂N² = ∂²/∂z², ∂²/∂E∂N = −∂²/∂x∂z.
    return { p, pE: px, pN: -pz, pEE: pxx, pEN: -pxz, pNN: pzz };
}

/** A curvatura das isóbaras (1/m), positiva percorrendo-as no sentido anti-horário em volta da baixa. */
export function isobarCurvature(d: PressureDerivatives): number {
    const g2 = d.pE * d.pE + d.pN * d.pN;
    if (g2 <= 0) return 0;
    return (d.pNN * d.pE * d.pE - 2 * d.pEN * d.pE * d.pN + d.pEE * d.pN * d.pN) / g2 ** 1.5;
}

/** O vento equilibrado num ponto: (leste, norte) em m/s, e as componentes ao longo das isóbaras e para a baixa. */
export interface BalancedWind {
    readonly east: number;
    readonly north: number;
    /** Ao longo das isóbaras, no sentido anti-horário em volta da baixa (negativo no sul). */
    readonly along: number;
    /** Através das isóbaras, para a pressão menor (o atrito). */
    readonly across: number;
}

/**
 * O vento equilibrado com a pressão, com a curvatura das isóbaras e com atrito linear `r` (spec 041, R18):
 *
 *   U = G / (r + i·a),  a = f + κ_e·u_t,  G = −∇p/ρ (complexo em leste + i·norte),
 *
 * onde u_t (a componente ao longo das isóbaras) resolve `u_t (r² + a²) = |G|·a`. É o equilíbrio estacionário entre a
 * força do gradiente, a de Coriolis, a centrífuga da curvatura e o atrito. Limites: κ = 0 → Guldberg–Mohn (com r → 0, o
 * geostrófico); r → 0 → o vento gradiente (Holton, Eq. 3.15); f → 0 → antitríptico (o vento desce o gradiente). A
 * curvatura vale `κ_e = κ·f²/(f² + r²)`: perto do equador o escoamento sinótico é dominado pelo atrito e não entra no
 * ramo ciclostrófico espontâneo (os ciclones não se formam a menos de ~5° do equador) — o vento é contínuo na latitude.
 *
 * No referencial f > 0 a raiz regular é a menor u ≥ 0 (φ(0) = −|G|f ≤ 0 e φ(|G|/2r) ≥ 0: há sempre raiz no intervalo);
 * para f < 0, u_t(−f) = −u_t(f) (o sentido do giro troca de hemisfério). A raiz: varredura de `WIND_SCAN` intervalos e
 * `WIND_BISECT` bisseções no primeiro que muda de sinal (teto constante, como na GPU).
 */
export function balancedWind(d: PressureDerivatives, f: number, r: number): BalancedWind {
    const grad = Math.hypot(d.pE, d.pN);
    const G = grad / AIR_DENSITY;
    if (!(G > 0)) return { east: 0, north: 0, along: 0, across: 0 };
    const kappa = isobarCurvature(d) * ((f * f) / (f * f + r * r));
    const F = Math.abs(f);
    const phi = (u: number): number => {
        const a = F + kappa * u;
        return u * (r * r + a * a) - G * a;
    };
    // O intervalo: |G|/2r sempre contém uma raiz; no ciclônico ela é ≤ |G|/F, no anticiclônico regular ≤ 2|G|/F. Sem
    // raiz regular no anticiclone (o gradiente forte demais para a curvatura), o teto do vento gradiente: a = F/2, u =
    // F/(2|κ_e|) (Holton, §3.2.5) — a outra raiz, com a ≈ 0, daria o vento antitríptico |G|/r, sem sentido físico.
    let hi = G / (2 * r);
    let capped = -1;
    if (F > 0) {
        if (kappa >= 0) hi = Math.min(hi, G / F);
        else {
            hi = Math.min(hi, (2 * G) / F);
            if (phi(hi) < 0) capped = Math.min(F / (2 * -kappa), hi);
        }
    }
    let lo = 0;
    let top = hi;
    for (let k = 1; k <= WIND_SCAN; k++) {
        const u = (hi * k) / WIND_SCAN;
        if (phi(u) >= 0) {
            top = u;
            break;
        }
        lo = u;
    }
    for (let k = 0; k < WIND_BISECT; k++) {
        const m = 0.5 * (lo + top);
        if (phi(m) >= 0) top = m;
        else lo = m;
    }
    const u = F > 0 ? (capped >= 0 ? capped : 0.5 * (lo + top)) : 0;
    const along = Math.sign(f) * u;
    const a = f + kappa * along;
    const across = (G * r) / (r * r + a * a);
    // ĝ = ∇p/|∇p| (para a pressão maior), t̂ = k × ĝ (anti-horário em volta da baixa).
    const gE = d.pE / grad;
    const gN = d.pN / grad;
    return {
        east: along * -gN - across * gE,
        north: along * gE - across * gN,
        along,
        across,
    };
}

/**
 * A velocidade vertical (m/s) no topo da camada limite (espessura `H`) pela convergência do vento com atrito `r`: a
 * divergência do vento de Guldberg–Mohn no plano f é `−r ∇²p / (ρ (r² + f²))`, e a continuidade sobe `w = −H ∇·U`
 * (Ekman: com r ≪ f, `w = (H r/f)·ζ_g`, a forma de `w = √(K/2f)·ζ_g`). Positiva (subida) nas baixas, negativa
 * (subsidência) nas altas, finita no equador.
 */
export function ekmanVelocity(d: PressureDerivatives, f: number, r: number): number {
    const lap = d.pEE + d.pNN;
    return (BOUNDARY_LAYER_DEPTH * r * lap) / (AIR_DENSITY * (r * r + f * f));
}

/**
 * O parâmetro de Okubo–Weiss W = s_n² + s_s² − ζ² (1/s²) do vento de Guldberg–Mohn com atrito `r`: positivo onde a
 * deformação domina a rotação — entre os sistemas, onde eles se encontram (Okubo 1970; Weiss 1991).
 */
export function okuboWeiss(d: PressureDerivatives, f: number, r: number): number {
    const c = 1 / (AIR_DENSITY * (r * r + f * f));
    const sn = -c * (r * (d.pEE - d.pNN) + 2 * f * d.pEN);
    const ss = -c * (2 * r * d.pEN + f * (d.pNN - d.pEE));
    const zeta = c * f * (d.pEE + d.pNN);
    return sn * sn + ss * ss - zeta * zeta;
}

/** A intensidade da frente em [0, 1]: `smoothstep` de √max(W, 0)/f_e na faixa `WEATHER_FRONT`. */
export function frontIntensity(d: PressureDerivatives, f: number, r: number): number {
    const w = okuboWeiss(d, f, r);
    return smoothstep(
        WEATHER_FRONT[0],
        WEATHER_FRONT[1],
        Math.sqrt(Math.max(w, 0)) / effectiveRotation(f, r),
    );
}

// ---------------------------------------------------------------------------------------------------------------------
// Do tempo às nuvens

/** O tempo bom (a camada sem o tempo): cobertura, tipo e a fração de altura do topo na casca. */
export interface FairWeather {
    readonly coverage: number;
    readonly type: number;
    readonly top: number;
}

/** O que o tempo dita no ponto: a cobertura pedida, o tipo e a fração de altura do topo na casca. */
export interface WeatherClouds {
    readonly coverage: number;
    readonly type: number;
    readonly top: number;
}

/**
 * O mapeamento do tempo para as nuvens (spec 041, R18): a subida `w > 0` (convergência numa baixa) leva a cobertura a
 * `max(c₀, 0,75)`, o tipo ao cúmulo-nimbo e o topo à tropopausa; a subsidência (`w < 0`, numa alta) leva a cobertura a
 * ¼, o tipo a no máximo 0,25 (estratocúmulo) e o topo a 0,6 do tempo bom (a inversão abaixa); a frente, onde o ar não
 * desce, leva a cobertura a 0,85, o topo a 0,55 da casca e o tipo a 0,3 (estratiforme espesso) onde não há subida.
 */
export function weatherClouds(w: number, front: number, fair: FairWeather): WeatherClouds {
    const lift = smoothstep(0, WEATHER_LIFT, w);
    const sink = smoothstep(0, WEATHER_SINK, -w);
    let coverage = mix(
        mix(fair.coverage, 0.25 * fair.coverage, sink),
        Math.max(fair.coverage, 0.75),
        lift,
    );
    let type = mix(mix(fair.type, Math.min(fair.type, 0.25), sink), 1, lift);
    let top = mix(mix(fair.top, 0.6 * fair.top, sink), 1, lift);
    // A frente só onde o ar não desce: a faixa frontal é de convergência (a subida frontal); no anel de subsidência em
    // volta de um vórtice intenso a deformação também domina (Okubo–Weiss > 0), mas lá não há nuvem frontal.
    const band = front * (1 - sink);
    coverage = mix(coverage, Math.max(coverage, 0.85), band);
    type = mix(type, 0.3, band * (1 - lift));
    top = mix(top, Math.max(top, 0.55), band);
    return { coverage: clamp01(coverage), type: clamp01(type), top: clamp01(top) };
}

/** O tempo completo num ponto: o vento das nuvens (m/s, mundo x e z, com o vento de condução), w e a frente. */
export interface WeatherSample {
    readonly windX: number;
    readonly windZ: number;
    readonly w: number;
    readonly front: number;
    readonly pressure: number;
}

/** Os parâmetros do tempo como o kernel os recebe. */
export interface WeatherParams {
    /** f (1/s). */
    readonly f: number;
    /** Atrito da atmosfera livre e da camada limite (1/s). */
    readonly freeDrag: number;
    readonly friction: number;
    /** Lado do estêncil (m). */
    readonly step: number;
    /** O vento de condução (m/s, x e z) e o tempo simulado (s). */
    readonly steering: readonly [number, number];
    readonly time: number;
}

/**
 * O tempo em `(x, z)` (m, mundo): a pressão `fn(x', z', t)` no referencial que anda com o vento de condução
 * (`x' = x − vento·t`), as derivadas pelo estêncil, o vento das nuvens (atrito da atmosfera livre) mais o de condução, w
 * pela camada limite (o atrito dela) e a frente.
 */
export function weatherAt(
    fn: (x: number, z: number, t: number) => number,
    x: number,
    z: number,
    q: WeatherParams,
): WeatherSample {
    const ox = q.steering[0] * q.time;
    const oz = q.steering[1] * q.time;
    const d = pressureStencil((a, b) => fn(a, b, q.time), x - ox, z - oz, q.step);
    const wind = balancedWind(d, q.f, q.freeDrag);
    return {
        windX: q.steering[0] + wind.east,
        windZ: q.steering[1] - wind.north,
        w: ekmanVelocity(d, q.f, q.friction),
        front: frontIntensity(d, q.f, q.freeDrag),
        pressure: d.p,
    };
}

/**
 * Um passo da evolução do estado do tempo (a série da 037): o valor de antes, trazido pelo vento (semi-Lagrangiano:
 * lido em `x − U·Δt`), relaxa para o que o tempo dita com o tempo de formação `τ`: `s = alvo + (antes − alvo)·e^(−Δt/τ)`.
 * Sem histórico, o alvo.
 */
export function weatherRelax(
    before: WeatherClouds | undefined,
    target: WeatherClouds,
    dt: number,
    formation: number,
): WeatherClouds {
    if (before === undefined) return target;
    const k = Math.exp(-dt / formation);
    return {
        coverage: target.coverage + (before.coverage - target.coverage) * k,
        type: target.type + (before.type - target.type) * k,
        top: target.top + (before.top - target.top) * k,
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// Solução analítica do vórtice gaussiano (os testes)

/**
 * O vento gradiente (sem atrito) de um vórtice gaussiano `p = A·e^(−d²/2σ²)` à distância `d` do centro (Holton, Eq.
 * 3.15, a raiz regular): positivo = anti-horário. Baixa (A < 0), hemisfério norte: `V = −fd/2 + √(f²d²/4 + d·∂p/∂d/ρ)`;
 * no sul, o oposto; alta: a raiz regular `V = fd/2 − √(f²d²/4 − d·|∂p/∂d|/ρ)` (com o sinal de f), ou o teto `fd/2`.
 */
export function gaussianGradientWind(
    amplitude: number,
    sigma: number,
    d: number,
    f: number,
): number {
    const dpdr = (-amplitude * d * Math.exp((-d * d) / (2 * sigma * sigma))) / (sigma * sigma);
    const G = dpdr / AIR_DENSITY; // > 0 numa baixa (a pressão sobe para fora)
    const F = Math.abs(f);
    let v: number;
    if (G >= 0) v = (-F * d) / 2 + Math.sqrt((F * F * d * d) / 4 + d * G);
    else {
        const disc = (F * F * d * d) / 4 + d * G;
        v = disc >= 0 ? (F * d) / 2 - Math.sqrt(disc) : (F * d) / 2;
        v = -v;
    }
    return Math.sign(f) * v;
}
