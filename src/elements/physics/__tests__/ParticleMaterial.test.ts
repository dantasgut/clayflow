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
        expect(m.cohesion).toBe(0);
        expect(m.adhesion).toBe(0);
        expect(m.xsph).toBe(0.05);
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
        [{ cohesion: -0.1 }, /cohesion/],
        [{ cohesion: Number.NaN }, /cohesion/],
        [{ adhesion: -1 }, /adhesion/],
        [{ adhesion: Number.POSITIVE_INFINITY }, /adhesion/],
        [{ xsph: -0.05 }, /xsph/],
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

    it('passo estável do PBF: a calibração de 5 cm a 60 Hz (1 substep) escalada por h² (spec 017)', () => {
        const at = (s: number) => new ParticleMaterial({ particleSpacing: s });
        expect(at(0.05).pbfStableDt).toBeCloseTo(1 / 60, 12);
        expect(ParticleMaterial.substepsFor(1 / 60, at(0.05).pbfStableDt)).toBe(1);
        expect(ParticleMaterial.substepsFor(1 / 60, at(0.025).pbfStableDt)).toBe(4);
        expect(ParticleMaterial.substepsFor(1 / 60, at(0.1).pbfStableDt)).toBe(1);
        expect(ParticleMaterial.substepsFor(1 / 30, at(0.05).pbfStableDt)).toBe(2);
    });
});

describe('ParticleMaterial — coesão, adesão e viscosidade (spec 030)', () => {
    it('γ de Akinci: a partícula na borda de um meio-espaço sente coesão · g (∫ C cos θ dV ≈ soma dos vizinhos)', () => {
        const m = new ParticleMaterial({ cohesion: 1 });
        const H = 2 * m.sphSmoothingLength;
        const gamma = m.cohesionGamma();
        // Meio-espaço discretizado numa grade fina: aceleração normal γ ρ₀ Σ C(r) cos θ dV.
        const C = (r: number): number => {
            if (r <= 0 || r > H) return 0;
            const a = (H - r) ** 3 * r ** 3;
            return (32 / (Math.PI * H ** 9)) * (2 * r > H ? a : 2 * a - H ** 6 / 64);
        };
        const n = 48;
        const d = H / n;
        let sum = 0;
        for (let i = -n; i <= n; i++)
            for (let j = -n; j <= n; j++)
                for (let k = 1; k <= n; k++) {
                    const x = (i + 0.5) * d;
                    const y = (k - 0.5) * d;
                    const z = (j + 0.5) * d;
                    const r = Math.hypot(x, y, z);
                    sum += C(r) * (y / r) * d ** 3;
                }
        expect(gamma * m.restDensity * sum).toBeCloseTo(9.81, 1);
        expect(m.cohesionGamma(0)).toBe(0);
    });

    it('adesão: escala linear no valor; arrasto tangencial √(g/s)', () => {
        const m = new ParticleMaterial({ adhesion: 2, particleSpacing: 0.04 });
        expect(m.adhesionAccel()).toBeCloseTo(2 * m.adhesionAccel(1), 9);
        expect(m.adhesionAccel(0)).toBe(0);
        expect(m.adhesionTangential()).toBeCloseTo(2 * Math.sqrt(9.81 / 0.04), 9);
    });

    it('surfaceStep: com coesão e adesão zero, exatamente os substeps do solver', () => {
        const m = new ParticleMaterial({ particleSpacing: 0.025 });
        for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
            const step = m.surfaceStep(dt, m.sphStableDt, 2);
            expect(step).toEqual({
                substeps: ParticleMaterial.substepsFor(dt, m.sphStableDt, 2),
                cohesion: 0,
                adhesion: 0,
                clamped: false,
            });
        }
    });

    it('surfaceStep: coesão moderada não muda os substeps; forte pede mais, até 4× com grampeamento', () => {
        const base = ParticleMaterial.substepsFor(1 / 60, 1);
        const mild = new ParticleMaterial({ cohesion: 1 }).surfaceStep(1 / 60, 1);
        expect(mild).toEqual({ substeps: base, cohesion: 1, adhesion: 0, clamped: false });
        const strong = new ParticleMaterial({ cohesion: 20 }).surfaceStep(1 / 60, 1);
        expect(strong.substeps).toBeGreaterThan(base);
        expect(strong.substeps).toBeLessThanOrEqual(4 * base);
        expect(strong.clamped).toBe(false);
        const extreme = new ParticleMaterial({ cohesion: 1e4, adhesion: 1e4 }).surfaceStep(
            1 / 60,
            1,
        );
        expect(extreme.substeps).toBe(4 * base);
        expect(extreme.clamped).toBe(true);
        expect(extreme.cohesion).toBeLessThan(1e4);
        expect(extreme.adhesion).toBe(extreme.cohesion);
        // O valor grampeado cabe exatamente no teto.
        const refit = new ParticleMaterial({ cohesion: extreme.cohesion }).surfaceStep(1 / 60, 1);
        expect(refit.substeps).toBeLessThanOrEqual(4 * base);
    });

    it('MPM: a viscosidade só limita o passo quando a difusão é mais restritiva que a onda', () => {
        const water = new ParticleMaterial();
        const inviscid = new ParticleMaterial({ viscosity: 0 });
        expect(water.mpmStableDt).toBe(inviscid.mpmStableDt);
        const honey = new ParticleMaterial({ viscosity: 1e3 });
        expect(honey.mpmStableDt).toBeCloseTo((honey.mpmCellSize ** 2 * 1000) / (6 * 1e3), 12);
        expect(honey.mpmStableDt).toBeLessThan(inviscid.mpmStableDt);
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
