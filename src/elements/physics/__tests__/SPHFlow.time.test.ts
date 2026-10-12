import { describe, expect, it } from 'vitest';
import { SPHFlow } from '../flows/SPHFlow';
import { FluidBody } from '../bodies/FluidBody';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import { ParticleMaterial } from '../materials/ParticleMaterial';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { countPasses, recordingFrame } from './helpers/recordingFrame';

function setup(substeps: number) {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, writes } = fakeResourceCore();
    const resources = new ResourceSystem(core, events, world);
    const time = new Time(events);
    world.insert(time);
    // Passo estável bem maior que o passo da cena: substeps = o configurado (a derivação pelo material tem teste próprio).
    world.insert(new ParticleMaterial({ speedOfSound: 0.1, youngModulus: 1 }));
    world.insert(new FluidBody({ algorithm: 'SPH', position: [0, 0, 0] }));
    const flow = new SPHFlow(core, world, resources, { substeps });
    return { time, flow, writes };
}

describe('SPHFlow — avanço governado pelo Time', () => {
    it('simula já no primeiro quadro (vizinhança alocada antes dos kernels)', () => {
        const { time, flow } = setup(1);
        time.advance(1 / 60);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        expect(countPasses(rec.passes, 'SPHFlow.density')).toBe(1);
    });

    it('a vizinhança é reconstruída em cada iteração, antes da densidade', () => {
        const { time, flow } = setup(2);
        time.advance(2 / 60);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        expect(countPasses(rec.passes, 'SPHFlow.density')).toBe(4);
        expect(countPasses(rec.passes, 'NS.find')).toBe(4);
        const order = rec.passes
            .map((p) => p.label)
            .filter((l) => l === 'NS.find' || l === 'SPHFlow.density');
        expect(order).toEqual([
            'NS.find',
            'SPHFlow.density',
            'NS.find',
            'SPHFlow.density',
            'NS.find',
            'SPHFlow.density',
            'NS.find',
            'SPHFlow.density',
        ]);
        const integrate = rec.passes.filter((p) => p.label === 'SPHFlow.integrate');
        expect(integrate.map((p) => p.offsets[0]?.[0])).toEqual([0, 256, 512, 768]);
    });

    it('dt e dt_frame por região, uma escrita de parâmetros por quadro', () => {
        const { time, flow, writes } = setup(2);
        time.advance(1 / 60);
        flow.dispatch(recordingFrame().frame);
        const w = writes.filter((x) =>
            (x.spec as { discriminator: string }).discriminator.includes('sph_params:per_step'),
        );
        expect(w).toHaveLength(1);
        const f32 = new Float32Array(
            w[0]!.bytes.buffer,
            w[0]!.bytes.byteOffset,
            w[0]!.bytes.byteLength / 4,
        );
        expect(f32[3]).toBeCloseTo(1 / 120, 7);
        expect(f32[64 + 10]).toBeCloseTo(1 / 60, 7);
    });

    it('steps = 0 não grava passes', () => {
        const { time, flow } = setup(1);
        time.pausePhysics();
        time.advance(1 / 60);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        expect(rec.passes).toHaveLength(0);
    });
});
