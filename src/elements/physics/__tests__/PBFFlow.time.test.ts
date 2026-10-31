import { describe, expect, it } from 'vitest';
import { PBFFlow } from '../flows/PBFFlow';
import { FluidBody } from '../bodies/FluidBody';
import { countPasses } from './helpers/recordingFrame';
import { solverScene } from './helpers/solverScene';

async function setup(substeps: number) {
    const s = await solverScene();
    s.scene.flows.register((ctx) => new PBFFlow(ctx, { substeps, solverIters: 3 }), {
        type: 'PBFFlow',
        phase: 'physics',
        bodyType: 'PBFSchema',
    });
    s.scene.world.insert(new FluidBody({ algorithm: 'PBF', position: [0, 0, 0] }));
    return s;
}

describe('PBFFlow — avanço governado pelo Time (slots)', () => {
    it('simula já no primeiro quadro (vizinhança preparada em framePrepare)', async () => {
        const { step } = await setup(1);
        expect(countPasses(step(1 / 60), 'PBFFlow.predict')).toBe(1);
    });

    it('steps × substeps iterações, vizinhança reconstruída antes de cada predict', async () => {
        const { step } = await setup(2);
        const passes = step(2 / 60);
        expect(countPasses(passes, 'PBFFlow.predict')).toBe(4);
        expect(countPasses(passes, 'PBFFlow.density_lambda')).toBe(12);
        const order = passes
            .map((p) => p.label)
            .filter((l) => l === 'NS.find' || l === 'PBFFlow.predict');
        expect(order).toEqual(
            Array.from({ length: 4 }, () => ['NS.find', 'PBFFlow.predict']).flat(),
        );
        const xsph = passes.filter((p) => p.label === 'PBFFlow.xsph');
        // Grupos por frequência (spec 031): `stage` (pool, vizinhança) e `draw` (parâmetros, único dinâmico).
        expect(xsph.map((p) => p.offsets[1]?.[0])).toEqual([0, 256, 512, 768]);
        expect(xsph.every((p) => p.offsets.length === 2 && p.offsets[0] === undefined)).toBe(true);
    });

    it('dt e dt_frame por região, uma escrita de parâmetros por quadro', async () => {
        const { step, writes } = await setup(2);
        writes.length = 0;
        step(1 / 60);
        const w = writes.filter((x) =>
            (x.spec as { discriminator: string }).discriminator.includes('pbf_params:'),
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

    it('steps = 0 não grava passes; nada criado na gravação', async () => {
        const s = await setup(1);
        s.scene.time.pausePhysics();
        expect(s.step(1 / 60)).toHaveLength(0);
        s.scene.time.resumePhysics();
        expect(countPasses(s.step(3 / 60), 'PBFFlow.predict')).toBe(3);
        expect(s.createdWhileRecording()).toBe(0);
    });
});
