import { describe, expect, it } from 'vitest';
import { SPHFlow } from '../flows/SPHFlow';
import { FluidBody } from '../bodies/FluidBody';
import { ParticleMaterial } from '../materials/ParticleMaterial';
import { countPasses } from './helpers/recordingFrame';
import { solverScene } from './helpers/solverScene';

async function setup(substeps: number) {
    const s = await solverScene();
    s.scene.flows.register((ctx) => new SPHFlow(ctx, { substeps }), {
        type: 'SPHFlow',
        phase: 'physics',
        bodyType: 'SPHSchema',
    });
    // Passo estável bem maior que o passo da cena: substeps = o configurado (a derivação pelo material tem teste próprio).
    s.scene.world.insert(new ParticleMaterial({ speedOfSound: 0.1, youngModulus: 1 }));
    s.scene.world.insert(new FluidBody({ algorithm: 'SPH', position: [0, 0, 0] }));
    return s;
}

describe('SPHFlow — avanço governado pelo Time (slots)', () => {
    it('simula já no primeiro quadro (vizinhança preparada em framePrepare)', async () => {
        const { step } = await setup(1);
        expect(countPasses(step(1 / 60), 'SPHFlow.density')).toBe(1);
    });

    it('a vizinhança é reconstruída em cada iteração, antes da densidade', async () => {
        const { step } = await setup(2);
        const passes = step(2 / 60);
        expect(countPasses(passes, 'SPHFlow.density')).toBe(4);
        expect(countPasses(passes, 'NS.find')).toBe(4);
        const order = passes
            .map((p) => p.label)
            .filter((l) => l === 'NS.find' || l === 'SPHFlow.density');
        expect(order).toEqual(
            Array.from({ length: 4 }, () => ['NS.find', 'SPHFlow.density']).flat(),
        );
        const integrate = passes.filter((p) => p.label === 'SPHFlow.integrate');
        // Grupos por frequência (spec 031): `stage` (pool, vizinhança) e `draw` (parâmetros, único dinâmico).
        expect(integrate.map((p) => p.offsets[1]?.[0])).toEqual([0, 256, 512, 768]);
        expect(integrate.every((p) => p.offsets.length === 2 && p.offsets[0] === undefined)).toBe(
            true,
        );
    });

    it('dt e dt_frame por região, uma escrita de parâmetros por quadro', async () => {
        const { step, writes } = await setup(2);
        writes.length = 0;
        step(1 / 60);
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

    it('steps = 0 não grava passes; mais passos no quadro não criam nada na gravação', async () => {
        const s = await setup(1);
        s.scene.time.pausePhysics();
        expect(s.step(1 / 60)).toHaveLength(0);
        s.scene.time.resumePhysics();
        expect(countPasses(s.step(4 / 60), 'NS.find')).toBe(4);
        expect(s.createdWhileRecording()).toBe(0);
    });

    it('material com outra suavização: vizinhança recriada e religada antes da gravação', async () => {
        const s = await setup(1);
        s.step();
        const mat = s.scene.world.rootOf(
            s.scene.world.queryBySchemaName('ParticleMaterial')[0]!,
        ) as ParticleMaterial;
        mat.data.particleSpacing = 0.08;
        const replaced: string[] = [];
        s.scene.events.on('bindGroupReplaced', (e) => replaced.push(e.pipeline));
        s.step();
        expect(replaced).toContain('sph_density');
        expect(s.createdWhileRecording()).toBe(0);
    });
});
