import { describe, expect, it } from 'vitest';
import { MPMFlow } from '../flows/MPMFlow';
import { FluidBody } from '../bodies/FluidBody';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { countPasses, recordingFrame } from './helpers/recordingFrame';

function setup(substeps: number) {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, writes } = fakeResourceCore();
    const resources = new ResourceSystem(core, events, world);
    const time = new Time(events);
    world.insert(time);
    world.insert(new FluidBody({ algorithm: 'MPM', position: [0, 0, 0] }));
    const flow = new MPMFlow(core, world, resources, { substeps });
    return { time, flow, writes };
}

describe('MPMFlow — avanço governado pelo Time', () => {
    it('cada iteração executa as 4 etapas com a região própria no grupo 0', () => {
        const { time, flow } = setup(2);
        time.advance(2 / 60);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        for (const label of [
            'MPMFlow.clear_grid',
            'MPMFlow.p2g',
            'MPMFlow.grid_update',
            'MPMFlow.g2p',
        ]) {
            expect(countPasses(rec.passes, label)).toBe(4);
        }
        const g2p = rec.passes.filter((p) => p.label === 'MPMFlow.g2p');
        expect(g2p.map((p) => p.offsets[0]?.[0])).toEqual([0, 256, 512, 768]);
        // grupos 1+ (grade, partículas) sem offset dinâmico
        expect(g2p[0]!.offsets.slice(1).every((o) => o === undefined)).toBe(true);
    });

    it('dt e dt_frame por região, uma escrita por quadro', () => {
        const { time, flow, writes } = setup(2);
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
        expect(f32[3]).toBeCloseTo(1 / 120, 7);
        expect(f32[64 + 11]).toBeCloseTo(1 / 60, 7);
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
