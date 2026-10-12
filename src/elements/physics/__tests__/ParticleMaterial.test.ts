import { describe, expect, it } from 'vitest';
import { ParticleMaterial, TAIT_GAMMA } from '../materials/ParticleMaterial';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { World } from '../../../scene/world/World';

describe('ParticleMaterial — padrões e validação', () => {
    it('padrões de água com espaçamento de 5 cm e domínio ±2 m', () => {
        const m = new ParticleMaterial();
        expect(m.restDensity).toBe(1000);
        expect(m.particleSpacing).toBe(0.05);
        expect(m.viscosity).toBe(0.01);
        expect(m.speedOfSound).toBe(10);
        expect(m.restitution).toBeCloseTo(0.2);
        expect(m.domainMin).toEqual([-2, -2, -2]);
        expect(m.domainMax).toEqual([2, 2, 2]);
    });

    it.each([
        [{ restDensity: 0 }, /restDensity/],
        [{ particleSpacing: -0.1 }, /particleSpacing/],
        [{ speedOfSound: 0 }, /speedOfSound/],
        [{ youngModulus: 0 }, /youngModulus/],
        [{ poissonRatio: 0.5 }, /poissonRatio/],
        [{ poissonRatio: -0.1 }, /poissonRatio/],
        [{ restitution: 1.5 }, /restitution/],
        [{ viscosity: -1 }, /viscosity/],
        [{ domainMin: [0, 0, 0] as const, domainMax: [1, 0, 1] as const }, /domainMin/],
    ])('rejeita %o', (options, message) => {
        expect(() => new ParticleMaterial(options)).toThrow(message);
    });
});

describe('ParticleMaterial — grandezas derivadas', () => {
    const m = new ParticleMaterial({
        restDensity: 1000,
        particleSpacing: 0.02,
        speedOfSound: 20,
        youngModulus: 1e5,
        poissonRatio: 0.25,
    });

    it('massa ρ₀s³ e volume s³', () => {
        expect(m.particleVolume).toBeCloseTo(8e-6, 12);
        expect(m.particleMass).toBeCloseTo(8e-3, 9);
    });

    it('suavização e grade a partir do espaçamento', () => {
        expect(m.sphSmoothingLength).toBeCloseTo(0.026);
        expect(m.pbfSmoothingLength).toBeCloseTo(0.04);
        expect(m.mpmCellSize).toBeCloseTo(0.04);
    });

    it('K = ρ₀c², Tait k₀ = K/γ, Lamé de E e ν', () => {
        expect(m.bulkModulus).toBeCloseTo(4e5);
        expect(m.taitStiffness).toBeCloseTo(4e5 / TAIT_GAMMA);
        expect(m.lame.mu).toBeCloseTo(1e5 / 2.5);
        expect(m.lame.lambda).toBeCloseTo((1e5 * 0.25) / (1.25 * 0.5));
    });

    it('passos estáveis e substeps', () => {
        expect(m.sphStableDt).toBeCloseTo((0.4 * 0.026) / 20);
        const elastic = Math.sqrt((m.lame.lambda + 2 * m.lame.mu) / 1000);
        expect(m.mpmStableDt).toBeCloseTo((0.3 * 0.04) / Math.max(20, elastic));
        expect(ParticleMaterial.substepsFor(1 / 60, 1 / 240)).toBe(4);
        expect(ParticleMaterial.substepsFor(1 / 60, 1 / 200)).toBe(4);
        expect(ParticleMaterial.substepsFor(1 / 60, 1)).toBe(1);
        expect(ParticleMaterial.substepsFor(1 / 60, 1, 3)).toBe(3);
    });
});

describe('ParticleMaterial.of', () => {
    it('devolve o material do World, ou o padrão', () => {
        const world = new World(new DefaultEventBus());
        expect(ParticleMaterial.of(world)).toBe(ParticleMaterial.defaults);
        const custom = new ParticleMaterial({ particleSpacing: 0.03 });
        world.insert(custom);
        expect(ParticleMaterial.of(world)).toBe(custom);
    });
});
