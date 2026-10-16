// Referências em CPU dos nós da C3 (spec 031): a mesma regra em f64, para os testes e o smoke `nodeGraphs` compararem
// com a GPU.
import { gradientNoise3 } from './noise';

type Vec3 = readonly [number, number, number];

/** `math.add`. */
export function add(a: number, b: number): number {
    return a + b;
}

/** `math.mix`: `a + (b − a)·t` por componente. */
export function mix(a: Vec3, b: Vec3, t: number): [number, number, number] {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** `noise.gradient3`: `gradient_noise3(p · scale + offset)`. */
export function noiseGradient3(p: Vec3, scale: number, offset: Vec3): number {
    return gradientNoise3(
        p[0] * scale + offset[0],
        p[1] * scale + offset[1],
        p[2] * scale + offset[2],
    );
}

/** `color.ramp`: linear de `colorA` em `low` a `colorB` em `high`, presa nos extremos. */
export function colorRamp(
    t: number,
    colorA: Vec3,
    colorB: Vec3,
    low: number,
    high: number,
): [number, number, number] {
    const span = Math.abs(high - low) < 1e-6 ? 1e-6 : high - low;
    return mix(colorA, colorB, Math.min(1, Math.max(0, (t - low) / span)));
}

export { gradientNoise3 } from './noise';
