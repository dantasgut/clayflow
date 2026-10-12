import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RigidBody } from '../bodies/RigidBody';
import type { RecordedPass } from './helpers/recordingFrame';
import { lcpScene } from './helpers/lcpScene';

async function setup(substeps = 4) {
    const s = await lcpScene({ substeps });
    s.scene.world.insert(
        new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1, position: [0, 4, 0] }),
    );
    return s;
}

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('LCPFlow — avanço governado pelo Time (slots)', () => {
    it('steps = 2, substeps = 4: 2 predicts, gravidade e solve por substep, 2 commits', async () => {
        const { step, scene } = await setup(4);
        const passes = step(2 / 60);
        expect(scene.time.steps).toBe(2);
        const count = (label: string): number => passes.filter((p) => p.label === label).length;
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

    it('cada iteração liga o offset da sua região; parâmetros escritos uma vez por quadro', async () => {
        const { step, writes } = await setup(2);
        writes.length = 0;
        const passes = step(2 / 60);
        const offsetOf = (p: RecordedPass): number => p.offsets[0]![0]!;
        const sim = passes.filter((p) => p.label.startsWith('LCPFlow.'));
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
        const paramWrites = writes.filter((w) =>
            (w.spec as { discriminator: string }).discriminator.includes('lcp_sim_params:per_step'),
        );
        expect(paramWrites).toHaveLength(1);
        expect(paramWrites[0]!.bytes.byteLength).toBe(6 * 256);
    });

    it('região de substep tem stepDt/substeps em gravity.w e stepDt em dt_frame', async () => {
        const { step, writes } = await setup(4);
        writes.length = 0;
        step(1 / 60);
        const w = writes.find((x) =>
            (x.spec as { discriminator: string }).discriminator.includes('lcp_sim_params:per_step'),
        )!;
        const f32 = new Float32Array(w.bytes.buffer, w.bytes.byteOffset, w.bytes.byteLength / 4);
        expect(f32[3]).toBeCloseTo(1 / 60, 6);
        expect(f32[8]).toBeCloseTo(1 / 60, 6);
        expect(f32[64 + 3]).toBeCloseTo(1 / 240, 6);
        expect(f32[64 + 8]).toBeCloseTo(1 / 60, 6);
    });

    it('steps = 0 não grava passes de simulação nem readback', async () => {
        const s = await setup();
        s.scene.time.pausePhysics();
        expect(s.step(1 / 60)).toHaveLength(0);
        expect(s.copies()).toBe(0);
    });

    it('sem corpos, o LCP não é instanciado', async () => {
        const s = await lcpScene();
        expect(s.flow).toBeDefined();
        expect(s.scene.flows.resolve('LCPSchema')?.flow).toBeUndefined();
        expect(s.step()).toHaveLength(0);
    });
});
