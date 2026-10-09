import { describe, expect, it } from 'vitest';
import { XPBDFlow } from '../flows/XPBDFlow';
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
    world.insert(new SoftBody({ algorithm: 'XPBD', position: [0, 1, 0], mass: 1 }));
    const flow = new XPBDFlow(core, world, resources, { substeps });
    return { time, flow, writes };
}

const paramWrites = (writes: ReturnType<typeof fakeResourceCore>['writes']) =>
    writes.filter((w) => (w.spec as { discriminator: string }).discriminator.includes('per_step'));

describe('XPBDFlow — avanço governado pelo Time', () => {
    it('iterações = steps × substeps, cada uma na sua região', () => {
        const { time, flow } = setup(2);
        time.advance(3 / 60);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        expect(countPasses(rec.passes, 'XPBDFlow.predict')).toBe(6);
        expect(countPasses(rec.passes, 'XPBDFlow.velocity_update')).toBe(6);
        const offsets = rec.passes
            .filter((p) => p.label === 'XPBDFlow.predict')
            .map((p) => paramsOffset(p));
        expect(offsets).toEqual([0, 256, 512, 768, 1024, 1280]);
    });

    it('dt de cada região = stepDt / substeps; uma escrita por quadro', () => {
        const { time, flow, writes } = setup(4);
        time.advance(1 / 60);
        flow.dispatch(recordingFrame().frame);
        const w = paramWrites(writes);
        expect(w).toHaveLength(1);
        const f32 = new Float32Array(
            w[0]!.bytes.buffer,
            w[0]!.bytes.byteOffset,
            w[0]!.bytes.byteLength / 4,
        );
        for (let i = 0; i < 4; i++) expect(f32[i * 64 + 3]).toBeCloseTo(1 / 240, 7);
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
