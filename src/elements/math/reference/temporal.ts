// Referência f64 das peças temporais (spec 037, R5): as mesmas contas do módulo WGSL `temporal`, para os testes.

/** Peso da amostra nova por contagem: 1/(quadros + 1), com o histórico limitado a `maxFrames`. */
export const temporalWeightCount = (frames: number, maxFrames: number): number =>
    1 / Math.min(frames + 1, maxFrames);

/** O α do A-SVGF: do peso por contagem a 1 com a mudança da cena (0–1). */
export const temporalWeightChange = (weight: number, change: number): number =>
    weight * (1 - change) + change;

/** Momentos da luminância `l` sobre o histórico, com o peso da amostra nova no mínimo `minAlpha`. */
export function temporalMoments(
    previous: readonly [number, number],
    l: number,
    alpha: number,
    minAlpha: number,
): [number, number] {
    const a = Math.max(alpha, minAlpha);
    return [previous[0] * (1 - a) + l * a, previous[1] * (1 - a) + l * l * a];
}

/** A variância das amostras a partir dos momentos. */
export const temporalVariance = (m: readonly [number, number]): number =>
    Math.max(m[1] - m[0] * m[0], 0);

/** A variância da média de `frames` quadros (SVGF: × 4/quadros com menos de 4). */
export const temporalMeanVariance = (variance: number, frames: number): number =>
    (variance * Math.max(4 / frames, 1)) / frames;

/** Peso (0–1) do histórico por plano e normal: zero além de `minCos`, caindo com a distância ao plano. */
export function temporalValidatePlane(
    previous: readonly number[],
    previousNormal: readonly number[],
    p: readonly number[],
    n: readonly number[],
    tolerance: number,
    minCos: number,
): number {
    const dot = (a: readonly number[], b: readonly number[]): number =>
        a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    if (dot(previousNormal, n) < minCos) return 0;
    const d = [p[0]! - previous[0]!, p[1]! - previous[1]!, p[2]! - previous[2]!];
    return Math.max(0, 1 - Math.abs(dot(d, n)) / tolerance);
}
