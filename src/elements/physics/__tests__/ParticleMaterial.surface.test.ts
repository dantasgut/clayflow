/**
 * Spec 010: coesão e adesão físicas — tensão superficial e ângulo de contato na escala do espaçamento.
 */
import { describe, expect, it } from 'vitest';
import { ParticleMaterial } from '../materials/ParticleMaterial';

describe('ParticleMaterial — água física (spec 010)', () => {
    it('coesão γ/(ρ s² g), adesão por Young–Dupré, arrasto viscoso μ/(ρ s²)', () => {
        const s = 0.025;
        const m = new ParticleMaterial({ ...ParticleMaterial.WATER, particleSpacing: s });
        const cohesion = 0.072 / (1000 * s * s * 9.81);
        expect(m.cohesion).toBeCloseTo(cohesion, 10);
        expect(m.adhesion).toBeCloseTo(cohesion * (1 + Math.cos(Math.PI / 6)), 10);
        expect(m.adhesionTangential()).toBeCloseTo(0.001 / (1000 * s * s), 12);
        // A 2,5 cm a tensão superficial é ~1 % de g; a 1 mm, ~7 g.
        expect(m.cohesion).toBeLessThan(0.02);
        expect(
            new ParticleMaterial({ ...ParticleMaterial.WATER, particleSpacing: 0.001 }).cohesion,
        ).toBeGreaterThan(5);
    });

    it('ângulo de 180° não adere; exclusiva com os valores adimensionais', () => {
        const m = new ParticleMaterial({ surfaceTension: 0.072, contactAngle: 180 });
        expect(m.adhesion).toBeCloseTo(0, 12);
        expect(() => new ParticleMaterial({ surfaceTension: 0.072, cohesion: 1 })).toThrow(
            /exclusivas/,
        );
        expect(() => new ParticleMaterial({ contactAngle: 30 })).toThrow(/surfaceTension/);
        expect(() => new ParticleMaterial({ surfaceTension: 0.072, contactAngle: 200 })).toThrow(
            /contactAngle/,
        );
    });
});
