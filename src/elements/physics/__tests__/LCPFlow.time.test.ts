import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LCPFlow } from '../flows/LCPFlow';
import { RigidBody } from '../bodies/RigidBody';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame, type RecordedPass } from './helpers/recordingFrame';

function setup(substeps = 4) {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, writes } = fakeResourceCore();
    const resources = new ResourceSystem(core, events, world);
    const time = new Time(events);
    world.insert(time);
    world.insert(new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1, position: [0, 4, 0] }));
    const flow = new LCPFlow(core, world, resources, { substeps });
    return { core, writes, world, time, flow };
}

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('LCPFlow — avanço governado pelo Time', () => {
    it('steps = 2, substeps = 4: 2 predicts, gravidade e solve por substep, 2 commits', () => {
        const { time, flow } = setup(4);
        time.advance(2 / 60);
        expect(time.steps).toBe(2);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        const count = (label: string): number => rec.passes.filter((p) => p.label === label).length;
        expect(count('LCPFlow.predict')).toBe(2);
        expect(count('LCPFlow.gravity')).toBe(8);
        expect(count('LCPFlow.buildLcp')).toBe(8);
        expect(count('LCPFlow.warmApply')).toBe(8);
        // 8 iterações Jacobi (padrão) por substep; cada uma seguida da aplicação por corpo (+1 após o warm start).
        expect(count('LCPFlow.solveContacts')).toBe(8 * 8);
        expect(count('LCPFlow.applyDelta')).toBe(8 * 9);
        expect(count('LCPFlow.warmStore')).toBe(8);
        expect(count('LCPFlow.commit')).toBe(2);
    });

    it('cada iteração liga o offset da sua região; parâmetros escritos uma vez por quadro', () => {
        const { time, flow, writes } = setup(2);
        time.advance(2 / 60);
        const before = writes.length;
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        const offsetOf = (p: RecordedPass): number => p.offsets[0]![0]!;
        const sim = rec.passes.filter((p) => p.label.startsWith('LCPFlow.'));
        // Por passo: região do passo (predict/commit) e uma região por substep — 3 regiões por passo.
        const expected = [
            ['LCPFlow.predict', 0],
            ['LCPFlow.gravity', 256],
            ['LCPFlow.warmApply', 256],
            ['LCPFlow.warmStore', 256],
            ['LCPFlow.gravity', 512],
            ['LCPFlow.warmApply', 512],
            ['LCPFlow.warmStore', 512],
            ['LCPFlow.accumulate', 0],
            ['LCPFlow.commit', 0],
            ['LCPFlow.predict', 768],
            ['LCPFlow.gravity', 1024],
            ['LCPFlow.warmApply', 1024],
            ['LCPFlow.warmStore', 1024],
            ['LCPFlow.gravity', 1280],
            ['LCPFlow.warmApply', 1280],
            ['LCPFlow.warmStore', 1280],
            ['LCPFlow.accumulate', 768],
            ['LCPFlow.commit', 768],
        ] as const;
        const inner = new Set(['LCPFlow.buildLcp', 'LCPFlow.solveContacts', 'LCPFlow.applyDelta']);
        const seen = sim
            .filter((p) => !inner.has(p.label) && !p.label.includes('narrowphase'))
            .map((p) => [p.label, offsetOf(p)]);
        expect(seen).toEqual(expected);
        // Passes internos do substep ligam a região do substep, nunca a do passo.
        const substepOffsets = new Set([256, 512, 1024, 1280]);
        for (const p of sim.filter((x) => inner.has(x.label) || x.label.includes('narrowphase'))) {
            expect(substepOffsets.has(offsetOf(p))).toBe(true);
        }
        const paramWrites = writes
            .slice(before)
            .filter((w) =>
                (w.spec as { discriminator: string }).discriminator.includes('per_step'),
            );
        expect(paramWrites).toHaveLength(1);
        expect(paramWrites[0]!.bytes.byteLength).toBe(6 * 256);
    });

    it('região de substep tem stepDt/substeps em gravity.w e stepDt em dt_frame', () => {
        const { time, flow, writes } = setup(4);
        time.advance(1 / 60);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        const w = writes.find((x) =>
            (x.spec as { discriminator: string }).discriminator.includes('per_step'),
        )!;
        const f32 = new Float32Array(w.bytes.buffer, w.bytes.byteOffset, w.bytes.byteLength / 4);
        const stepRegion = 0;
        const subRegion = 64; // região 1 (256 bytes / 4)
        expect(f32[stepRegion + 3]).toBeCloseTo(1 / 60, 6);
        expect(f32[stepRegion + 8]).toBeCloseTo(1 / 60, 6);
        expect(f32[subRegion + 3]).toBeCloseTo(1 / 240, 6);
        expect(f32[subRegion + 8]).toBeCloseTo(1 / 60, 6);
    });

    it('steps = 0 não grava passes de simulação nem readback', () => {
        const { time, flow } = setup();
        time.pausePhysics();
        time.advance(1 / 60);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        expect(rec.passes).toHaveLength(0);
        expect(rec.copies).toBe(0);
    });

    it('sem Time no World, nenhum passo', () => {
        const events = new DefaultEventBus();
        const world = new World(events);
        const { core } = fakeResourceCore();
        const resources = new ResourceSystem(core, events, world);
        world.insert(new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1 }));
        const flow = new LCPFlow(core, world, resources);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        expect(rec.passes).toHaveLength(0);
    });
});
