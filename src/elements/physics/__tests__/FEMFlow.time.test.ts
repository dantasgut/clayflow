import { describe, expect, it } from 'vitest';
import { FEMFlow } from '../flows/FEMFlow';
import { SoftBody } from '../bodies/SoftBody';
import { FEMSchema } from '../bodies/schemas/FEMSchema';
import { countPasses, paramsOffset } from './helpers/recordingFrame';
import { solverScene } from './helpers/solverScene';

async function setup(substeps: number) {
    const s = await solverScene();
    s.scene.flows.register((ctx) => new FEMFlow(ctx, { substeps }), {
        type: 'FEMFlow',
        phase: 'physics',
        bodyType: FEMSchema.name,
    });
    s.scene.world.insert(new SoftBody({ algorithm: 'FEM', position: [0, 1, 0], mass: 1 }));
    return s;
}

describe('FEMFlow — avanço governado pelo Time (slots)', () => {
    it('iterações = steps × substeps com offsets por região', async () => {
        const { step } = await setup(2);
        const passes = step(2 / 60);
        expect(countPasses(passes, 'FEMFlow.predict')).toBe(4);
        expect(countPasses(passes, 'FEMFlow.velocity_update')).toBe(4);
        expect(
            passes.filter((p) => p.label === 'FEMFlow.velocity_update').map(paramsOffset),
        ).toEqual([0, 256, 512, 768]);
    });

    it('dt_sub e dt_frame por região, uma escrita por quadro', async () => {
        const { step, writes } = await setup(4);
        writes.length = 0;
        step(1 / 60);
        const w = writes.filter((x) =>
            (x.spec as { discriminator: string }).discriminator.includes('fem_sim_params'),
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

    it('steps = 0 não grava passes; nada criado na gravação', async () => {
        const s = await setup(1);
        s.scene.time.scale = 0;
        expect(s.step(1 / 60)).toHaveLength(0);
        s.scene.time.scale = 1;
        expect(countPasses(s.step(3 / 60), 'FEMFlow.predict')).toBe(3);
        expect(s.createdWhileRecording).toBe(0);
    });
});
