import { describe, expect, it } from 'vitest';
import { FEMFlow } from '../flows/FEMFlow';
import { SoftBody } from '../bodies/SoftBody';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { countPasses, paramsOffset, recordingFrame } from './helpers/recordingFrame';

function setup(substeps: number) {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, writes } = fakeResourceCore();
    const resources = new ResourceSystem(core, events, world);
    const time = new Time(events);
    world.insert(time);
    world.insert(new SoftBody({ algorithm: 'FEM', position: [0, 1, 0], mass: 1 }));
    const flow = new FEMFlow(core, world, resources, { substeps });
    return { time, flow, writes };
}

describe('FEMFlow — avanço governado pelo Time', () => {
    it('iterações = steps × substeps com offsets por região', () => {
        const { time, flow } = setup(2);
        time.advance(2 / 60);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        expect(countPasses(rec.passes, 'FEMFlow.predict')).toBe(4);
        expect(countPasses(rec.passes, 'FEMFlow.velocity_update')).toBe(4);
        expect(
            rec.passes.filter((p) => p.label === 'FEMFlow.velocity_update').map(paramsOffset),
        ).toEqual([0, 256, 512, 768]);
    });

    it('dt_sub e dt_frame por região, uma escrita por quadro', () => {
        const { time, flow, writes } = setup(4);
        time.advance(1 / 60);
        flow.dispatch(recordingFrame().frame);
        const w = writes.filter((x) =>
            (x.spec as { discriminator: string }).discriminator.includes('per_step'),
        );
        expect(w).toHaveLength(1);
        const f32 = new Float32Array(
            w[0]!.bytes.buffer,
            w[0]!.bytes.byteOffset,
            w[0]!.bytes.byteLength / 4,
        );
        for (let i = 0; i < 4; i++) {
            expect(f32[i * 64 + 3]).toBeCloseTo(1 / 240, 7);
            expect(f32[i * 64 + 10]).toBeCloseTo(1 / 60, 7);
        }
    });

    it('steps = 0 não grava passes', () => {
        const { time, flow } = setup(1);
        time.scale = 0;
        time.advance(1 / 60);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        expect(rec.passes).toHaveLength(0);
    });
});
