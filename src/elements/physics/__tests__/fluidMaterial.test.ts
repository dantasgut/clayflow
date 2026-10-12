import { describe, expect, it } from 'vitest';
import { SPHFlow } from '../flows/SPHFlow';
import { PBFFlow } from '../flows/PBFFlow';
import { MPMFlow } from '../flows/MPMFlow';
import { FluidBody } from '../bodies/FluidBody';
import { SoftBody } from '../bodies/SoftBody';
import { ParticleMaterial, TAIT_GAMMA } from '../materials/ParticleMaterial';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import {
    fakeResourceCore,
    type WriteCall,
} from '../../../scene/__tests__/helpers/fakeResourceCore';
import { countPasses, recordingFrame } from './helpers/recordingFrame';
import { solverScene } from './helpers/solverScene';
import type { LegacyFlow as Flow } from '../../../scene/flows/LegacyFlow';
import { PBFSimParamsSchema, SPHSimParamsSchema } from '../schemas/simParams';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Índice f32/u32 de um campo do schema. */
const at = (schema: StructSchema, field: string): number => schema.offsetOf(field) / 4;

type FlowCtor = (
    core: ReturnType<typeof fakeResourceCore>['core'],
    world: World,
    resources: ResourceSystem,
) => Flow;

function setup(body: () => FluidBody | SoftBody, make: FlowCtor, material?: ParticleMaterial) {
    const events = new DefaultEventBus();
    const world = new World(events);
    const fake = fakeResourceCore();
    const resources = new ResourceSystem(fake.core, events, world);
    const time = new Time(events);
    world.insert(time);
    if (material !== undefined) world.insert(material);
    world.insert(body());
    const flow = make(fake.core, world, resources);
    return { ...fake, world, time, flow };
}

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
const material = new ParticleMaterial(OPTIONS);

describe('SPHFlow — parâmetros do ParticleMaterial', () => {
    const make: FlowCtor = (c, w, r) => new SPHFlow(c, w, r);

    it('massa, h, rigidez de Tait, viscosidade, restituição e domínio gravados nos parâmetros', () => {
        const s = setup(
            () => new FluidBody({ algorithm: 'SPH' }),
            make,
            new ParticleMaterial(OPTIONS),
        );
        s.time.advance(1 / 60);
        s.flow.dispatch(recordingFrame().frame);
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

    it('substeps pelo passo estável (CFL 0,4 h/c)', () => {
        const s = setup(
            () => new FluidBody({ algorithm: 'SPH' }),
            make,
            new ParticleMaterial(OPTIONS),
        );
        s.time.advance(1 / 60);
        const rec = recordingFrame();
        s.flow.dispatch(rec.frame);
        const expected = ParticleMaterial.substepsFor(1 / 60, material.sphStableDt);
        expect(expected).toBeGreaterThan(1);
        expect(countPasses(rec.passes, 'SPHFlow.density')).toBe(expected);
    });

    it('vizinhança com raio = 2h e grade pelo domínio', () => {
        const s = setup(
            () => new FluidBody({ algorithm: 'SPH' }),
            make,
            new ParticleMaterial(OPTIONS),
        );
        s.time.advance(1 / 60);
        s.flow.dispatch(recordingFrame().frame);
        const { f32, u32 } = lastWrite(s.writes, 'ns_params:sph');
        const cell = 2 * material.sphSmoothingLength;
        expect(f32[0]).toBe(-1);
        expect(f32[3]).toBeCloseTo(cell, 6);
        expect(u32[4]).toBe(Math.ceil(2 / cell - 1e-9));
        expect(u32[5]).toBe(Math.ceil(2 / cell - 1e-9));
    });

    it('sem material no World usa os padrões', () => {
        const s = setup(() => new FluidBody({ algorithm: 'SPH' }), make);
        s.time.advance(1 / 60);
        s.flow.dispatch(recordingFrame().frame);
        const { f32 } = lastWrite(s.writes, 'sph_params:per_step');
        expect(f32[at(SPHSimParamsSchema, 'particle_mass')]).toBeCloseTo(
            ParticleMaterial.defaults.particleMass,
            6,
        );
    });
});

describe('PBFFlow — parâmetros do ParticleMaterial', () => {
    const make: FlowCtor = (c, w, r) => new PBFFlow(c, w, r);

    it('ρ₀, h = 2s, massa e m/ρ₀; s_corr escalado com s²', () => {
        const s = setup(
            () => new FluidBody({ algorithm: 'PBF' }),
            make,
            new ParticleMaterial(OPTIONS),
        );
        s.time.advance(1 / 60);
        s.flow.dispatch(recordingFrame().frame);
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

    it('vizinhança com raio = h', () => {
        const s = setup(
            () => new FluidBody({ algorithm: 'PBF' }),
            make,
            new ParticleMaterial(OPTIONS),
        );
        s.time.advance(1 / 60);
        s.flow.dispatch(recordingFrame().frame);
        expect(lastWrite(s.writes, 'ns_params:pbf').f32[3]).toBeCloseTo(0.08, 6);
    });
});

describe('MPMFlow — parâmetros do ParticleMaterial', () => {
    async function mpm(body: () => FluidBody | SoftBody, bodyType: string) {
        const s = await solverScene();
        s.scene.flows.register((ctx) => new MPMFlow(ctx), {
            type: 'MPMFlow',
            phase: 'physics',
            bodyType,
        });
        s.scene.world.insert(new ParticleMaterial(OPTIONS));
        s.scene.world.insert(body());
        return s;
    }

    it('fluido: material_id 2, massa/volume/K do material, grade 2s pelo domínio', async () => {
        const s = await mpm(() => new FluidBody({ algorithm: 'MPM' }), 'MPMFluidSchema');
        const passes = s.step(1 / 60);
        const { f32, u32 } = lastWrite(s.writes, 'mpm_params:per_step');
        expect(f32[7]).toBeCloseTo(material.particleMass, 6);
        expect(f32[8]).toBeCloseTo(material.particleVolume, 9);
        expect(f32[9]).toBeCloseTo(material.bulkModulus, 0);
        expect(u32[13]).toBe(Math.ceil(2 / 0.08 - 1e-9));
        expect(f32[16]).toBe(-1);
        expect(f32[19]).toBeCloseTo(0.08, 6);
        expect(u32[21]).toBe(2);
        const substeps = ParticleMaterial.substepsFor(1 / 60, material.mpmStableDt);
        expect(u32[22]).toBe(substeps);
        expect(countPasses(passes, 'MPMFlow.p2g')).toBe(substeps);
    });

    it('sólido: material_id 0 e Lamé do material', async () => {
        const s = await mpm(() => new SoftBody({ algorithm: 'MPM' }), 'MPMSoftSchema');
        s.step(1 / 60);
        const { f32, u32 } = lastWrite(s.writes, 'mpm_params:per_step');
        expect(u32[21]).toBe(0);
        expect(f32[4]).toBeCloseTo(material.lame.mu, 0);
        expect(f32[5]).toBeCloseTo(material.lame.lambda, 0);
    });
});
