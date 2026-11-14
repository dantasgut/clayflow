import { describe, expect, it } from 'vitest';
import {
    bodyEnergy,
    dampedEnergyRatio,
    det3,
    edgeElasticEnergy,
    femDampingFactor,
    lcpDampingFactor,
    neoHookeanEnergy,
    particleEnergy,
    rotateInverse,
    substepEnergyRatio,
    xpbdDampingFactor,
} from '../energy';

type Vec = [number, number, number];

// Spec 037 — referência f64 da energia dos corpos rígidos.

const still = {
    invMass: 0.5,
    position: [0, 2, 0],
    velocity: [0, 0, 0],
    omega: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    inertiaInv: [1, 1, 1],
} as const;

describe('energia dos corpos rígidos (f64)', () => {
    it('translação e potencial: ½·m·|v|² e −m·g·x', () => {
        const e = bodyEnergy({ ...still, velocity: [3, 0, 4] }, [0, -9.81, 0]);
        expect(e.kinetic).toBeCloseTo(0.5 * 2 * 25, 12);
        expect(e.potential).toBeCloseTo(2 * 9.81 * 2, 12);
    });

    it('rotação: ½·Σ I_k·ω_k² no corpo; a orientação leva ω do mundo ao corpo', () => {
        // Inércia (1, 2, 4) no corpo; o corpo girado 90° em z: o x do mundo é o −y do corpo.
        const s = Math.SQRT1_2;
        const body = {
            ...still,
            omega: [1, 0, 0],
            inertiaInv: [1, 0.5, 0.25],
            rotation: [0, 0, s, s],
        } as const;
        const wc = rotateInverse(body.rotation, body.omega);
        expect(wc[0]).toBeCloseTo(0, 12);
        expect(wc[1]).toBeCloseTo(-1, 12);
        expect(bodyEnergy(body, [0, 0, 0]).kinetic).toBeCloseTo(0.5 * 2 * 1, 12);
    });

    it('eixo travado (inverso 0) não guarda energia de rotação; cinemático vale zero', () => {
        expect(
            bodyEnergy({ ...still, omega: [5, 0, 0], inertiaInv: [0, 1, 1] }, [0, 0, 0]).kinetic,
        ).toBe(0);
        expect(bodyEnergy({ ...still, invMass: 0, velocity: [1, 0, 0] }, [0, -9.81, 0])).toEqual({
            kinetic: 0,
            potential: 0,
        });
    });

    it('amortecimento do LCP: fator max(1 − k·dt, 0) por passo; a energia cai pelo quadrado', () => {
        expect(lcpDampingFactor(0.1, 1 / 60)).toBeCloseTo(1 - 0.1 / 60, 15);
        expect(lcpDampingFactor(100, 1)).toBe(0);
        expect(dampedEnergyRatio(0.1, 1 / 60, 7)).toBeCloseTo((1 - 0.1 / 60) ** -14, 12);
    });
});

describe('referência f64 da energia dos corpos moles (spec 037)', () => {
    it('partícula: ½·m·|v|² e −m·g·x', () => {
        expect(particleEnergy(2, [0, 3, 0], [1, 2, 2], [0, -9.81, 0])).toEqual({
            kinetic: 9,
            potential: 2 * 9.81 * 3,
        });
    });

    it('aresta do XPBD: ½·C²/α; α = 0 (rígida) sem energia', () => {
        expect(edgeElasticEnergy([0, 0, 0], [1.5, 0, 0], 1, 1e-3)).toBeCloseTo(125, 9);
        expect(edgeElasticEnergy([0, 0, 0], [0, 0.5, 0], 1, 1e-3)).toBeCloseTo(125, 9);
        expect(edgeElasticEnergy([0, 0, 0], [3, 0, 0], 1, 0)).toBe(0);
    });

    it('Neo-Hookean: zero em repouso; esticamento uniforme s pela fórmula fechada; a derivada é o P do P2G', () => {
        const I: [Vec, Vec, Vec] = [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
        ];
        expect(neoHookeanEnergy(I, 1e4, 2e4, 1e-3)).toBe(0);
        const s = 1.1;
        const scaled: [Vec, Vec, Vec] = [
            [s, 0, 0],
            [0, s, 0],
            [0, 0, s],
        ];
        const mu = 1e4;
        const lambda = 2e4;
        const ln = 3 * Math.log(s);
        expect(neoHookeanEnergy(scaled, mu, lambda, 2)).toBeCloseTo(
            2 * (0.5 * mu * (3 * s * s - 3) - mu * ln + 0.5 * lambda * ln * ln),
            6,
        );
        // ∂ψ/∂F₀₁ por diferença central contra P₀₁ = μ(F − F⁻ᵀ)₀₁ + λ·ln J·(F⁻ᵀ)₀₁ num F genérico.
        const F: [Vec, Vec, Vec] = [
            [1.1, 0.05, -0.02],
            [0.1, 0.95, 0.03],
            [0.0, -0.04, 1.02],
        ];
        const h = 1e-6;
        const bump = (d: number): [Vec, Vec, Vec] => [F[0], [F[1][0] + d, F[1][1], F[1][2]], F[2]];
        const numeric =
            (neoHookeanEnergy(bump(h), mu, lambda, 1) - neoHookeanEnergy(bump(-h), mu, lambda, 1))
            / (2 * h);
        // Entrada (linha 0, coluna 1) de F⁻ᵀ = cofator(0, 1)/J; F[1][0] é a linha 0 da coluna 1.
        const J = det3(F);
        const m = (r: number, c: number): number => F[c]![r]!;
        const cof01 = -(m(1, 0) * m(2, 2) - m(1, 2) * m(2, 0));
        const finvT01 = cof01 / J;
        const analytic = mu * (m(0, 1) - finvT01) + lambda * Math.log(J) * finvT01;
        expect(numeric).toBeCloseTo(analytic, 3);
    });

    it('amortecimento: XPBD max(1 − c·dt, 0) e FEM max(1 − c, 0) por substep; a energia cai pelo quadrado', () => {
        expect(xpbdDampingFactor(0.05, 1 / 480)).toBeCloseTo(1 - 0.05 / 480, 15);
        expect(femDampingFactor(0.05)).toBeCloseTo(0.95, 15);
        expect(femDampingFactor(2)).toBe(0);
        expect(substepEnergyRatio(0.95, 2, 3)).toBeCloseTo(0.95 ** -12, 12);
    });
});
