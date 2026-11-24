// Referência f64 do espalhamento sob a superfície (spec 011, T113): o perfil de difusão normalizado de Christensen e
// Burley 2015 ("Approximate Reflectance Profiles for Efficient Subsurface Scattering") — o que o desenho amostra — e um
// Monte Carlo de passeio aleatório (espalhamento isotrópico, sem diferença de índice na superfície, a configuração do
// artigo) num meio semi-infinito e numa placa, a verdade contra a qual o perfil e a transmissão pela espessura são
// conferidos. Comprimentos na unidade do caminho livre médio dado (`mfp` = 1/σ_t; na autoria, mm por canal).

import { randomNext, randomUnit } from '../../math/reference/random';

const PI = Math.PI;

/**
 * Fator de forma `s` do perfil para a luz que entra difusa pela superfície (Christensen e Burley 2015, eq. 6), em função
 * do albedo da superfície `albedo` (a refletância difusa total, a "cor" do material): `s = 1,9 − A + 3,5 (A − 0,8)²`.
 */
export function burleyShape(albedo: number): number {
    const a = Math.min(Math.max(albedo, 0), 1);
    return 1.9 - a + 3.5 * (a - 0.8) * (a - 0.8);
}

/**
 * Fator de forma para o feixe perpendicular à superfície (o "searchlight", eq. 5 do artigo):
 * `s = 1,85 − A + 7 |A − 0,8|³`.
 */
export function burleyShapeSearchlight(albedo: number): number {
    const a = Math.min(Math.max(albedo, 0), 1);
    return 1.85 - a + 7 * Math.abs(a - 0.8) ** 3;
}

/**
 * Comprimento do perfil `d = mfp / s`: as duas exponenciais decaem em `d` e `3d`. `mfp` é o caminho livre médio (na
 * unidade que se queira para o raio).
 */
export function burleyLength(albedo: number, mfp: number, shape = burleyShape(albedo)): number {
    return mfp / shape;
}

/**
 * Perfil radial de refletância difusa `R(r)` (por unidade de área, para fluxo unitário entrando em r = 0):
 * `A (e^(−r/d) + e^(−r/3d)) / (8 π d r)`. A integral no plano é o albedo `A`.
 */
export function burleyProfile(r: number, albedo: number, d: number): number {
    const x = Math.max(r, 1e-12);
    return (albedo * (Math.exp(-x / d) + Math.exp(-x / (3 * d)))) / (8 * PI * d * x);
}

/** Fração da energia do perfil que sai a menos de `r` do ponto de entrada: `1 − ¼ e^(−r/d) − ¾ e^(−r/3d)`. */
export function burleyCdf(r: number, d: number): number {
    return 1 - 0.25 * Math.exp(-r / d) - 0.75 * Math.exp(-r / (3 * d));
}

/** Densidade radial normalizada `2π r R(r) / A` (a derivada de `burleyCdf`): a pdf da amostragem por importância. */
export function burleyRadialPdf(r: number, d: number): number {
    return (Math.exp(-r / d) + Math.exp(-r / (3 * d))) / (4 * d);
}

/**
 * Raio de fração acumulada `u` em [0, 1) (a inversa exata de `burleyCdf`): com `y = e^(−r/3d)`, `¼ y³ + ¾ y = 1 − u` é a
 * cúbica reduzida `y³ + 3y − 4(1 − u) = 0`, de raiz real `y = c − 1/c`, `c = ∛(2(1 − u) + √(4(1 − u)² + 1))`.
 */
export function burleySample(u: number, d: number): number {
    const v = Math.min(Math.max(1 - u, 1e-12), 1);
    const c = Math.cbrt(2 * v + Math.sqrt(4 * v * v + 1));
    const y = c - 1 / c;
    return -3 * d * Math.log(Math.min(Math.max(y, 1e-300), 1));
}

/** Raio médio de saída do perfil: `2,5 d`. */
export function burleyMeanRadius(d: number): number {
    return 2.5 * d;
}

/**
 * Transmissão difusa por uma espessura `t`: a parte do perfil além de `t` — a integral de `R(√(ρ² + t²))` no plano da
 * face oposta, por unidade de fluxo que entra: `¼ e^(−t/d) + ¾ e^(−t/3d)` (sem o albedo, que multiplica a saída como
 * na difusão). É 1 em `t = 0` e decai com as mesmas exponenciais do perfil: a luz por trás e a difusão na tela usam a
 * mesma curva.
 */
export function burleyTransmission(t: number, d: number): number {
    const x = Math.max(t, 0);
    return 0.25 * Math.exp(-x / d) + 0.75 * Math.exp(-x / (3 * d));
}

/** Como a luz entra no meio do passeio aleatório: perpendicular à superfície ou difusa (cosseno). */
export type WalkIncidence = 'normal' | 'diffuse';

/** Opções do passeio aleatório. */
export interface RandomWalkOptions {
    /** Albedo de espalhamento simples do volume `α = σ_s / σ_t`, em [0, 1]. */
    readonly alpha: number;
    /** Caminho livre médio `1/σ_t`. Padrão 1. */
    readonly mfp?: number;
    /** Espessura da placa (a mesma unidade de `mfp`); sem ela, meio semi-infinito. */
    readonly thickness?: number;
    /** Entrada da luz. Padrão `'diffuse'`. */
    readonly incidence?: WalkIncidence;
    /** Caminhos. */
    readonly paths: number;
    /** Semente. */
    readonly seed?: number;
    /** Raio máximo do histograma radial da face de entrada. Padrão 16 `mfp`. */
    readonly maxRadius?: number;
    /** Faixas do histograma. Padrão 64. */
    readonly bins?: number;
}

/** Resultado do passeio aleatório. */
export interface RandomWalkResult {
    /** Fração da energia que volta pela face de entrada (o albedo da superfície `A`, no meio semi-infinito). */
    readonly reflectance: number;
    /** Fração que sai pela face oposta (placa); 0 no meio semi-infinito. */
    readonly transmittance: number;
    /** Raio médio de saída pela face de entrada, pesado pela energia. */
    readonly meanRadius: number;
    /** Energia que sai pela face de entrada em cada faixa radial `[k, k + 1) · maxRadius / bins`. */
    readonly histogram: Float64Array;
    /** Largura de uma faixa. */
    readonly binWidth: number;
}

/** Teto de eventos por caminho (o peso já foi a zero pela roleta muito antes). */
const WALK_MAX_EVENTS = 100_000;

/**
 * Monte Carlo de passeio aleatório num meio homogêneo de espalhamento isotrópico, com a superfície em z = 0 sem
 * diferença de índice (a luz que chega a ela sai): a entrada em r = 0, passos de comprimento exponencial, a absorção
 * pelo peso (× α a cada evento) e roleta russa abaixo de 1 % do peso. Devolve a energia que volta pela face de entrada
 * (total, raio médio e histograma radial) e a que sai pela face oposta da placa.
 */
export function randomWalk(options: RandomWalkOptions): RandomWalkResult {
    const mfp = options.mfp ?? 1;
    const alpha = Math.min(Math.max(options.alpha, 0), 1);
    const thickness = options.thickness ?? Infinity;
    const incidence = options.incidence ?? 'diffuse';
    const bins = options.bins ?? 64;
    const maxRadius = options.maxRadius ?? 16 * mfp;
    const binWidth = maxRadius / bins;
    const histogram = new Float64Array(bins);
    const state = { value: (options.seed ?? 1) >>> 0 };
    const next = (): number => randomUnit(randomNext(state));
    let reflected = 0;
    let transmitted = 0;
    let radiusSum = 0;
    for (let path = 0; path < options.paths; path++) {
        let x = 0;
        let y = 0;
        let z = 0;
        let dx = 0;
        let dy = 0;
        let dz = 1;
        if (incidence === 'diffuse') {
            const cosT = Math.sqrt(1 - next());
            const sinT = Math.sqrt(1 - cosT * cosT);
            const phi = 2 * PI * next();
            dx = sinT * Math.cos(phi);
            dy = sinT * Math.sin(phi);
            dz = cosT;
        }
        let weight = 1;
        for (let event = 0; event < WALK_MAX_EVENTS; event++) {
            const step = -Math.log(1 - next()) * mfp;
            const nz = z + dz * step;
            if (nz <= 0) {
                // Sai pela face de entrada: o ponto em que cruza z = 0.
                const t = -z / dz;
                const r = Math.hypot(x + dx * t, y + dy * t);
                reflected += weight;
                radiusSum += weight * r;
                const k = Math.floor(r / binWidth);
                if (k < bins) histogram[k]! += weight;
                break;
            }
            if (nz >= thickness) {
                transmitted += weight;
                break;
            }
            x += dx * step;
            y += dy * step;
            z = nz;
            weight *= alpha;
            if (weight < 0.01) {
                if (next() >= 0.5) break;
                weight *= 2;
            }
            const cosT = 1 - 2 * next();
            const sinT = Math.sqrt(Math.max(1 - cosT * cosT, 0));
            const phi = 2 * PI * next();
            dx = sinT * Math.cos(phi);
            dy = sinT * Math.sin(phi);
            dz = cosT;
        }
    }
    const n = options.paths;
    for (let k = 0; k < bins; k++) histogram[k]! /= n;
    return {
        reflectance: reflected / n,
        transmittance: transmitted / n,
        meanRadius: reflected > 0 ? radiusSum / reflected : 0,
        histogram,
        binWidth,
    };
}
