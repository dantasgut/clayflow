import { describe, expect, it } from 'vitest';
import { XPBDFlow } from '../flows/XPBDFlow';
import { SoftBody } from '../bodies/SoftBody';
import { DistanceConstraint } from '../constraints/DistanceConstraint';
import { XPBDSoftSchema } from '../bodies/schemas/XPBDSoftSchema';
import { countPasses, paramsOffset } from './helpers/recordingFrame';
import { solverScene } from './helpers/solverScene';

async function setup(substeps: number) {
    const s = await solverScene();
    const reg = s.scene.flows.register((ctx) => new XPBDFlow(ctx, { substeps }), {
        type: 'XPBDFlow',
        phase: 'physics',
        bodyType: XPBDSoftSchema.name,
    });
    s.scene.world.insert(new SoftBody({ algorithm: 'XPBD', position: [0, 1, 0], mass: 1 }));
    return { ...s, flow: () => reg.flow! };
}

const paramWrites = (writes: Awaited<ReturnType<typeof solverScene>>['writes']) =>
    writes.filter((w) =>
        (w.spec as { discriminator: string }).discriminator.includes('xpbd_sim_params'),
    );

describe('XPBDFlow — avanço governado pelo Time (slots)', () => {
    it('instanciado pela C2 no primeiro corpo; iterações = steps × substeps, cada uma na sua região', async () => {
        const { step, flow } = await setup(2);
        expect(flow().lifecycle).toBe('ready');
        const passes = step(3 / 60);
        expect(countPasses(passes, 'XPBDFlow.predict')).toBe(6);
        expect(countPasses(passes, 'XPBDFlow.velocity_update')).toBe(6);
        expect(
            passes.filter((p) => p.label === 'XPBDFlow.predict').map((p) => paramsOffset(p)),
        ).toEqual([0, 256, 512, 768, 1024, 1280]);
    });

    it('dt de cada região = stepDt / substeps; uma escrita por quadro (framePrepare)', async () => {
        const { step, writes } = await setup(4);
        writes.length = 0;
        step(1 / 60);
        const w = paramWrites(writes);
        expect(w).toHaveLength(1);
        const f32 = new Float32Array(
            w[0]!.bytes.buffer,
            w[0]!.bytes.byteOffset,
            w[0]!.bytes.byteLength / 4,
        );
        for (let i = 0; i < 4; i++) expect(f32[i * 64 + 3]).toBeCloseTo(1 / 240, 7);
    });

    it('steps = 0 não grava passes', async () => {
        const { step, scene } = await setup(1);
        scene.time.pausePhysics();
        expect(step(1 / 60)).toHaveLength(0);
    });

    it('mais passos no quadro: o uniform cresce em framePrepare e é religado; nada é criado na gravação', async () => {
        const s = await setup(8);
        s.step(1 / 60);
        const passes = s.step(4 / 60);
        expect(countPasses(passes, 'XPBDFlow.predict')).toBe(32);
        expect(s.createdWhileRecording).toBe(0);
    });

    it('restrições: o pipeline de distância é preparado quando o pool de restrições aparece (slotChanged)', async () => {
        const s = await setup(1);
        expect(countPasses(s.step(), 'XPBDFlow.distance_solve')).toBe(0);
        s.scene.world.insert(new SoftBody({ algorithm: 'XPBD', position: [0.1, 1, 0], mass: 1 }));
        s.scene.world.insert(
            new DistanceConstraint({ i: 0, j: 1, restLength: 0.1, compliance: 0 }),
        );
        expect(countPasses(s.step(), 'XPBDFlow.distance_solve')).toBe(1);
        expect(s.flow().lifecycle).toBe('ready');
    });
});
