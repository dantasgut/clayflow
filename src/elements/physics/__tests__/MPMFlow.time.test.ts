import { describe, expect, it } from 'vitest';
import { MPMFlow } from '../flows/MPMFlow';
import { FluidBody } from '../bodies/FluidBody';
import { RigidBody } from '../bodies/RigidBody';
import { ParticlePhysics } from '../ParticlePhysics';
import { countPasses } from './helpers/recordingFrame';
import { solverScene } from './helpers/solverScene';

async function setup(substeps: number) {
    const s = await solverScene();
    s.scene.flows.register((ctx) => new MPMFlow(ctx, { substeps }), {
        type: 'MPMFlow',
        phase: 'physics',
        bodyType: 'MPMFluidSchema',
    });
    // Passo estável bem maior que o passo da cena: substeps = o configurado (a derivação pelo material tem teste próprio).
    s.scene.world.insert(new ParticlePhysics({ speedOfSound: 0.1, youngModulus: 1 }));
    s.scene.world.insert(new FluidBody({ algorithm: 'MPM', position: [0, 0, 0] }));
    return s;
}

describe('MPMFlow — avanço governado pelo Time (slots)', () => {
    it('cada iteração executa as etapas com a região própria só no grupo dos parâmetros', async () => {
        const { step } = await setup(2);
        const passes = step(2 / 60);
        for (const label of [
            'MPMFlow.clear_grid',
            'MPMFlow.p2g',
            'MPMFlow.grid_update',
            'MPMFlow.g2p',
            'MPMFlow.collision',
        ]) {
            expect(countPasses(passes, label)).toBe(4);
        }
        const g2p = passes.filter((p) => p.label === 'MPMFlow.g2p');
        // G2P: grade, partículas e vivos em `stage` (grupo 0); parâmetros da iteração em `draw` (grupo 1).
        expect(g2p.map((p) => p.offsets[1]?.[0])).toEqual([0, 256, 512, 768]);
        expect(g2p.every((p) => p.offsets.length === 2 && p.offsets[0] === undefined)).toBe(true);
        // Atualização da grade: campos em `frame` (0), grade e colliders em `stage` (1), parâmetros em `draw` (2).
        const update = passes.filter((p) => p.label === 'MPMFlow.grid_update');
        expect(update.map((p) => p.offsets[2]?.[0])).toEqual([0, 256, 512, 768]);
        expect(update.every((p) => p.offsets.slice(0, 2).every((o) => o === undefined))).toBe(true);
    });

    it('dt e dt_frame por região, uma escrita por quadro', async () => {
        const { step, writes } = await setup(2);
        writes.length = 0;
        step(1 / 60);
        const w = writes.filter((x) =>
            (x.spec as { discriminator: string }).discriminator.includes('mpm_params:'),
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
        s.step(2 / 60);
        expect(s.createdWhileRecording()).toBe(0);
    });

    it('collider inserido depois: mapas de dono reconstruídos em transição e grupo de colliders religado', async () => {
        const s = await setup(1);
        s.step();
        const replaced: string[] = [];
        s.scene.events.on('bindGroupReplaced', (e) => replaced.push(e.pipeline));
        s.scene.world.insert(new RigidBody({ shape: 'box', mass: 0, halfExtents: [2, 0.1, 2] }));
        s.step();
        expect(replaced).toContain('mpm_grid_update');
        expect(replaced).toContain('mpm_particle_collision');
        expect(s.createdWhileRecording()).toBe(0);
    });

    it('material com outra grade: grade recriada e religada antes da gravação', async () => {
        const s = await setup(1);
        s.step();
        const mat = s.scene.world.rootOf(
            s.scene.world.queryBySchemaName('ParticlePhysics')[0]!,
        ) as ParticlePhysics;
        mat.data.particleSpacing = 0.08;
        const replaced: string[] = [];
        s.scene.events.on('bindGroupReplaced', (e) => replaced.push(e.pipeline));
        s.step();
        expect(replaced).toContain('mpm_clear_grid');
        expect(s.createdWhileRecording()).toBe(0);
    });
});
