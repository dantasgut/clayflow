import { describe, expect, it, vi } from 'vitest';
import { SPHFlow } from '../flows/SPHFlow';
import { PBFFlow } from '../flows/PBFFlow';
import { MPMFlow } from '../flows/MPMFlow';
import { FluidBody } from '../bodies/FluidBody';
import { SoftBody } from '../bodies/SoftBody';
import { ParticlePhysics, TAIT_GAMMA } from '../ParticlePhysics';
import type { WriteCall } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { countPasses } from './helpers/recordingFrame';
import { solverScene } from './helpers/solverScene';
import { PBFSimParamsSchema, SPHSimParamsSchema } from '../schemas/simParams';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Índice f32/u32 de um campo do schema. */
const at = (schema: StructSchema, field: string): number => schema.offsetOf(field) / 4;

/** Última escrita de um buffer cujo discriminador contém `part`, como f32/u32. */
function lastWrite(writes: WriteCall[], part: string): { f32: Float32Array; u32: Uint32Array } {
    const w = [...writes]
        .reverse()
        .find((x) => (x.spec as { discriminator?: string }).discriminator?.includes(part));
    if (w === undefined) throw new Error(`sem escrita em ${part}`);
    const buf = w.bytes.buffer.slice(w.bytes.byteOffset, w.bytes.byteOffset + w.bytes.byteLength);
    return { f32: new Float32Array(buf), u32: new Uint32Array(buf) };
}

const OPTIONS = {
    restDensity: 900,
    particleSpacing: 0.04,
    speedOfSound: 12,
    viscosity: 0.02,
    restitution: 0.3,
    domainMin: [-1, -0.5, -1],
    domainMax: [1, 1.5, 1],
} as const;
/** Referência para as expectativas; cada cena recebe a sua instância (reuso de instância é proibido). */
const material = new ParticlePhysics(OPTIONS);

describe('SPHFlow — parâmetros do ParticlePhysics', () => {
    async function sph(withMaterial = true) {
        const s = await solverScene();
        s.scene.flows.register((ctx) => new SPHFlow(ctx), {
            type: 'SPHFlow',
            phase: 'physics',
            bodyType: 'SPHSchema',
        });
        if (withMaterial) s.scene.world.insert(new ParticlePhysics(OPTIONS));
        s.scene.world.insert(new FluidBody({ algorithm: 'SPH', position: [0, 0, 0] }));
        return s;
    }

    it('massa, h, rigidez de Tait, viscosidade, restituição e domínio gravados nos parâmetros', async () => {
        const s = await sph();
        s.step(1 / 60);
        const { f32 } = lastWrite(s.writes, 'sph_params:per_step');
        expect(f32[at(SPHSimParamsSchema, 'rest_density')]).toBeCloseTo(900);
        expect(f32[at(SPHSimParamsSchema, 'h')]).toBeCloseTo(material.sphSmoothingLength, 6);
        expect(f32[at(SPHSimParamsSchema, 'stiffness')]).toBeCloseTo((900 * 144) / TAIT_GAMMA, 1);
        expect(f32[at(SPHSimParamsSchema, 'gamma')]).toBe(TAIT_GAMMA);
        expect(f32[at(SPHSimParamsSchema, 'viscosity')]).toBeCloseTo(0.02);
        expect(f32[at(SPHSimParamsSchema, 'bound_min')]).toBe(-1);
        expect(f32[at(SPHSimParamsSchema, 'bound_min') + 1]).toBe(-0.5);
        expect(f32[at(SPHSimParamsSchema, 'restitution')]).toBeCloseTo(0.3);
        expect(f32[at(SPHSimParamsSchema, 'particle_mass')]).toBeCloseTo(material.particleMass, 6);
    });

    it('substeps pelo passo estável (CFL 0,4 h/c)', async () => {
        const s = await sph();
        const passes = s.step(1 / 60);
        const expected = ParticlePhysics.substepsFor(1 / 60, material.sphStableDt);
        expect(expected).toBeGreaterThan(1);
        expect(countPasses(passes, 'SPHFlow.density')).toBe(expected);
    });

    it('vizinhança com raio = 2h e grade pelo domínio', async () => {
        const s = await sph();
        s.step(1 / 60);
        const { f32, u32 } = lastWrite(s.writes, 'ns_params:sph');
        const cell = 2 * material.sphSmoothingLength;
        expect(f32[0]).toBe(-1);
        expect(f32[3]).toBeCloseTo(cell, 6);
        expect(u32[4]).toBe(Math.ceil(2 / cell - 1e-9));
        expect(u32[5]).toBe(Math.ceil(2 / cell - 1e-9));
    });

    it('grade recriada pelo material: buffers da busca com geração nova (não repetem as specs da anterior)', async () => {
        const s = await sph();
        s.step(1 / 60);
        const created = vi
            .mocked(s.core.create)
            .mock.calls.map((c) => (c[0] as { discriminator?: string }).discriminator ?? '');
        // A busca do construtor (grade padrão) e a do material: discriminadores distintos.
        expect(created.some((d) => d.includes('sph:gen0'))).toBe(true);
        expect(created.some((d) => d.includes('sph:gen1'))).toBe(true);
    });

    it('XSPH, coesão, adesão e suporte 2h do material (spec 030)', async () => {
        const s = await solverScene();
        s.scene.flows.register((ctx) => new SPHFlow(ctx), {
            type: 'SPHFlow',
            phase: 'physics',
            bodyType: 'SPHSchema',
        });
        const m = new ParticlePhysics({ ...OPTIONS, xsph: 0.1, cohesion: 0.5, adhesion: 0.25 });
        s.scene.world.insert(m);
        s.scene.world.insert(new FluidBody({ algorithm: 'SPH', position: [0, 0, 0] }));
        const passes = s.step(1 / 60);
        const { f32 } = lastWrite(s.writes, 'sph_params:per_step');
        expect(f32[at(SPHSimParamsSchema, 'xsph_c')]).toBeCloseTo(0.1);
        expect(f32[at(SPHSimParamsSchema, 'cohesion_gamma')]).toBeCloseTo(m.cohesionGamma(), 6);
        expect(f32[at(SPHSimParamsSchema, 'adhesion_accel')]).toBeCloseTo(m.adhesionAccel(), 4);
        expect(f32[at(SPHSimParamsSchema, 'adhesion_tangential')]).toBeCloseTo(
            m.adhesionTangential(),
            4,
        );
        expect(f32[at(SPHSimParamsSchema, 'support')]).toBeCloseTo(2 * m.sphSmoothingLength, 6);
        // Com coesão, o passe de normais acompanha cada iteração.
        expect(countPasses(passes, 'SPHFlow.normals')).toBe(countPasses(passes, 'SPHFlow.density'));
        // Em execução: coesão zero desliga o passe no quadro seguinte.
        m.data.cohesion = 0;
        const after = s.step(1 / 60);
        expect(countPasses(after, 'SPHFlow.normals')).toBe(0);
        expect(
            lastWrite(s.writes, 'sph_params:per_step').f32[
                at(SPHSimParamsSchema, 'cohesion_gamma')
            ],
        ).toBe(0);
    });

    it('padrões: XSPH 0,05, sem coesão nem adesão e sem passe de normais', async () => {
        const s = await sph();
        const passes = s.step(1 / 60);
        const { f32 } = lastWrite(s.writes, 'sph_params:per_step');
        expect(f32[at(SPHSimParamsSchema, 'xsph_c')]).toBeCloseTo(0.05);
        expect(f32[at(SPHSimParamsSchema, 'cohesion_gamma')]).toBe(0);
        expect(f32[at(SPHSimParamsSchema, 'adhesion_accel')]).toBe(0);
        expect(countPasses(passes, 'SPHFlow.normals')).toBe(0);
    });

    it('coesão acima do teto de substeps: grampeada e um aviso só', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const s = await solverScene();
        s.scene.flows.register((ctx) => new SPHFlow(ctx), {
            type: 'SPHFlow',
            phase: 'physics',
            bodyType: 'SPHSchema',
        });
        const m = new ParticlePhysics({ ...OPTIONS, cohesion: 1e6 });
        s.scene.world.insert(m);
        s.scene.world.insert(new FluidBody({ algorithm: 'SPH', position: [0, 0, 0] }));
        s.step(1 / 60);
        s.step(1 / 60);
        const gamma = lastWrite(s.writes, 'sph_params:per_step').f32[
            at(SPHSimParamsSchema, 'cohesion_gamma')
        ]!;
        expect(gamma).toBeLessThan(m.cohesionGamma());
        expect(gamma).toBeGreaterThan(0);
        expect(warn.mock.calls.filter((c) => String(c[0]).includes('SPHFlow')).length).toBe(1);
        warn.mockRestore();
    });

    it('sem material no World usa os padrões', async () => {
        const s = await sph(false);
        s.step(1 / 60);
        const { f32 } = lastWrite(s.writes, 'sph_params:per_step');
        expect(f32[at(SPHSimParamsSchema, 'particle_mass')]).toBeCloseTo(
            ParticlePhysics.defaults.particleMass,
            6,
        );
    });
});

describe('PBFFlow — parâmetros do ParticlePhysics', () => {
    async function pbf() {
        const s = await solverScene();
        s.scene.flows.register((ctx) => new PBFFlow(ctx), {
            type: 'PBFFlow',
            phase: 'physics',
            bodyType: 'PBFSchema',
        });
        s.scene.world.insert(new ParticlePhysics(OPTIONS));
        s.scene.world.insert(new FluidBody({ algorithm: 'PBF', position: [0, 0, 0] }));
        return s;
    }

    it('ρ₀, h = 2s, massa e m/ρ₀; s_corr escalado com s²', async () => {
        const s = await pbf();
        s.step(1 / 60);
        const { f32 } = lastWrite(s.writes, 'pbf_params:per_step');
        expect(f32[at(PBFSimParamsSchema, 'rest_density')]).toBeCloseTo(900);
        expect(f32[at(PBFSimParamsSchema, 'h')]).toBeCloseTo(0.08, 6);
        expect(f32[at(PBFSimParamsSchema, 's_corr_k')]).toBeCloseTo(1e-4 * (0.04 / 0.05) ** 2, 9);
        expect(f32[at(PBFSimParamsSchema, 'particle_mass')]).toBeCloseTo(material.particleMass, 6);
        expect(f32[at(PBFSimParamsSchema, 'mass_over_density')]).toBeCloseTo(
            material.particleMass / 900,
            9,
        );
    });

    it('XSPH, coesão, adesão e suporte h do material (spec 030)', async () => {
        const s = await solverScene();
        s.scene.flows.register((ctx) => new PBFFlow(ctx), {
            type: 'PBFFlow',
            phase: 'physics',
            bodyType: 'PBFSchema',
        });
        const m = new ParticlePhysics({ ...OPTIONS, xsph: 0.02, cohesion: 0.5, adhesion: 0.5 });
        s.scene.world.insert(m);
        s.scene.world.insert(new FluidBody({ algorithm: 'PBF', position: [0, 0, 0] }));
        s.step(1 / 60);
        const { f32 } = lastWrite(s.writes, 'pbf_params:per_step');
        expect(f32[at(PBFSimParamsSchema, 'xsph_c')]).toBeCloseTo(0.02);
        expect(f32[at(PBFSimParamsSchema, 'cohesion_gamma')]).toBeCloseTo(m.cohesionGamma(), 6);
        expect(f32[at(PBFSimParamsSchema, 'adhesion_accel')]).toBeCloseTo(m.adhesionAccel(), 4);
        expect(f32[at(PBFSimParamsSchema, 'support')]).toBeCloseTo(m.pbfSmoothingLength, 6);
    });

    it('vizinhança com raio = h', async () => {
        const s = await pbf();
        s.step(1 / 60);
        expect(lastWrite(s.writes, 'ns_params:pbf').f32[3]).toBeCloseTo(0.08, 6);
    });
});

describe('MPMFlow — parâmetros do ParticlePhysics', () => {
    async function mpm(body: () => FluidBody | SoftBody, bodyType: string) {
        const s = await solverScene();
        s.scene.flows.register((ctx) => new MPMFlow(ctx), {
            type: 'MPMFlow',
            phase: 'physics',
            bodyType,
        });
        s.scene.world.insert(new ParticlePhysics(OPTIONS));
        s.scene.world.insert(body());
        return s;
    }

    it('fluido: material_id 2, massa/volume/K do material, grade 2s pelo domínio', async () => {
        const s = await mpm(
            () => new FluidBody({ algorithm: 'MPM', position: [0, 0, 0] }),
            'MPMFluidSchema',
        );
        const passes = s.step(1 / 60);
        const { f32, u32 } = lastWrite(s.writes, 'mpm_params:per_step');
        expect(f32[7]).toBeCloseTo(material.particleMass, 6);
        expect(f32[8]).toBeCloseTo(material.particleVolume, 9);
        expect(f32[9]).toBeCloseTo(material.bulkModulus, 0);
        expect(u32[13]).toBe(Math.ceil(2 / 0.08 - 1e-9));
        expect(f32[16]).toBe(-1);
        expect(f32[19]).toBeCloseTo(0.08, 6);
        expect(u32[21]).toBe(2);
        const substeps = ParticlePhysics.substepsFor(1 / 60, material.mpmStableDt);
        expect(u32[22]).toBe(substeps);
        expect(countPasses(passes, 'MPMFlow.p2g')).toBe(substeps);
    });

    it('sólido: material_id 0 e Lamé do material', async () => {
        const s = await mpm(
            () => new SoftBody({ algorithm: 'MPM', position: [0, 0, 0] }),
            'MPMSoftSchema',
        );
        s.step(1 / 60);
        const { f32, u32 } = lastWrite(s.writes, 'mpm_params:per_step');
        expect(u32[21]).toBe(0);
        expect(f32[4]).toBeCloseTo(material.lame.mu, 0);
        expect(f32[5]).toBeCloseTo(material.lame.lambda, 0);
    });
});
