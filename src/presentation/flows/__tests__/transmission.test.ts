import { describe, expect, it } from 'vitest';
import { registerStages, renderScene } from './helpers/renderHarness';
import { SphereGeometry } from '../../../elements/geometry/SphereGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Transform } from '../../../elements/scene/Transform';
import { Camera } from '../../../elements/scene/Camera';
import { MaterialFunction } from '../../../elements/extension/MaterialFunction';
import { Refraction } from '../../../elements/lighting/refraction/Refraction';
import { RefractionFlow } from '../../../elements/lighting/refraction/RefractionFlow';
import { RefractionCompositeFlow } from '../RefractionCompositeFlow';
import { RefractionDenoiseFlow } from '../RefractionDenoiseFlow';
import { TracedDenoiser } from '../../../elements/lighting/denoise/TracedDenoiser';
import { RefractionMotionFlow } from '../RefractionMotionFlow';
import {
    TemporalAntialiasing,
    type AntialiasingMode,
} from '../../../elements/scene/TemporalAntialiasing';

// Transmissivos (spec 011; spec 034, T041/T045): saem do passe principal; com a `Refraction`, marcam o pedido por pixel
// (a cor deles vem do traçado e da composição); nenhuma cópia da tela.

const GLASS = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    return closure_add(closure_dielectric(1.5, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0));
}`;

async function scene(
    glass: boolean,
    refraction?: { samples: 1 | 4; composite?: boolean; motion?: AntialiasingMode },
) {
    const s = await renderScene();
    const stages = registerStages(s.scene, {
        forward: 'scene',
        samples: refraction?.samples ?? 4,
    });
    const r = new Refraction();
    if (refraction !== undefined) {
        s.scene.world.insert(r);
        s.scene.flows.register((ctx) => new RefractionFlow(ctx), {
            type: 'refraction',
            phase: 'forward',
            priority: -65,
        });
        if (refraction.composite === true)
            s.scene.flows.register((ctx) => new RefractionCompositeFlow(ctx), {
                type: 'refractionComposite',
                phase: 'forward',
                priority: -67,
            });
        if (refraction.motion !== undefined) {
            s.scene.world.insert(new TemporalAntialiasing({ mode: refraction.motion }));
            s.scene.flows.register((ctx) => new RefractionMotionFlow(ctx), {
                type: 'refractionMotion',
                phase: 'forward',
                priority: -68,
            });
        }
    }
    s.scene.world.insert(new Camera().add(new Transform({ position: [0, 0, 5, 1] })));
    s.scene.world.insert(new SphereGeometry().add(new StandardMaterial()).add(new Transform()));
    if (glass)
        s.scene.world.insert(
            new SphereGeometry()
                .add(new StandardMaterial())
                .add(new Transform({ position: [2, 0, 0, 1] }))
                .add(new MaterialFunction({ code: GLASS, lobes: ['specular', 'transmission'] })),
        );
    s.step();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    return Object.assign(s, { refraction: r, targets: stages.frameTargets });
}

describe('ForwardFlow — transmissivos (spec 011)', () => {
    it('sem transmissivo: um passe só, sem cópia da cena', async () => {
        const s = await scene(false);
        const passes = s.step();
        expect(passes.map((p) => p.label)).toEqual(['ForwardFlow']);
        expect(s.computes().filter((c) => c !== 'CameraFlow')).toEqual([]);
    });

    it('com transmissivo e sem a Refraction: fora do passe principal e não desenhado; nenhuma cópia da cena', async () => {
        const s = await scene(true);
        const passes = s.step();
        expect(passes.map((p) => p.label)).toEqual(['ForwardFlow']);
        expect(passes[0]!.draws).toHaveLength(1);
        // Nem compute nem cópia de textura (as cópias também vão a `computes`).
        expect(s.computes().filter((c) => c !== 'CameraFlow')).toEqual([]);
    });

    it.each([1, 4] as const)(
        'com a Refraction (spec 034, T041), %i amostra(s): pedido por pixel depois dos opacos — as duas faces, rg32uint sem amostras, profundidade própria limpa em 1; a fila compactada com despacho indireto',
        async (samples) => {
            const s = await scene(true, { samples });
            const passes = s.step();
            expect(passes.map((p) => p.label)).toEqual([
                'ForwardFlow',
                'ForwardFlow.refractionRequest',
            ]);
            const request = passes[1]!;
            const refraction = s.refraction;
            const rs = s.scene.resourceSystem;
            expect(request.target.colorAttachments).toEqual([
                {
                    view: rs.textureViewOf(refraction, 'request'),
                    loadOp: 'clear',
                    clearValue: [0, 0, 0, 0],
                    storeOp: 'store',
                },
            ]);
            expect(request.target.depthStencilAttachment).toMatchObject({
                view: rs.textureViewOf(refraction, 'requestDepth'),
                depthClearValue: 1,
                depthLoadOp: 'clear',
            });
            // Só o vidro (o opaco fica no passe principal), com as duas faces.
            expect(request.draws).toHaveLength(1);
            const pipeline = request.draws[0]!.pipeline;
            expect(pipeline.fragment?.entryPoint).toBe('fs_refraction_request');
            expect(pipeline.fragment?.targets).toEqual([{ format: 'rg32uint' }]);
            expect(pipeline.primitive?.cullMode).toBe('none');
            expect(pipeline.multisample?.count ?? 1).toBe(1);
            expect(pipeline.depthStencil).toMatchObject({
                depthCompare: 'less',
                depthWriteEnabled: true,
            });
            expect(s.computes()).toEqual(
                expect.arrayContaining(['RefractionFlow.queue', 'CountToArgs']),
            );
            expect(s.computes().indexOf('RefractionFlow.queue')).toBeLessThan(
                s.computes().indexOf('CountToArgs'),
            );
        },
    );

    it('com a Refraction e sem transmissivo: nem pedido nem fila (os alvos não são alocados)', async () => {
        const s = await scene(false, { samples: 1 });
        const passes = s.step();
        expect(passes.map((p) => p.label)).toEqual(['ForwardFlow']);
        expect(s.computes()).not.toContain('RefractionFlow.queue');
        expect(s.scene.resourceSystem.textureOf(s.refraction, 'request')).toBeUndefined();
    });

    it.each([1, 4] as const)(
        'composição (T045), %i amostra(s): sobre a cor e a profundidade da cena, só no quadro em que o traçado produziu as radiâncias',
        async (samples) => {
            const s = await scene(true, { samples, composite: true });
            const rs = s.scene.resourceSystem;
            // Sem a estrutura de raios, o traçado não produz: nada a compor.
            expect(s.step().map((p) => p.label)).not.toContain('RefractionCompositeFlow');
            expect(rs.isProduced(s.refraction, 'radiance')).toBe(false);
            // As radiâncias marcadas por outro produtor (o traçado não roda sem a estrutura de raios; um `false` de quem
            // não é o produtor é ignorado).
            rs.ensureAllocated(s.refraction, 'radiance');
            rs.markProduced(s, s.refraction, 'radiance', true);
            s.step();
            for (let i = 0; i < 30; i++) await Promise.resolve();
            const passes = s.step();
            const labels = passes.map((p) => p.label);
            expect(labels).toContain('RefractionCompositeFlow');
            const composite = passes.find((p) => p.label === 'RefractionCompositeFlow')!;
            expect(labels.indexOf('ForwardFlow.refractionRequest')).toBeLessThan(
                labels.indexOf('RefractionCompositeFlow'),
            );
            expect(composite.target.colorAttachments[0]).toMatchObject({ loadOp: 'load' });
            expect(composite.target.depthStencilAttachment).toMatchObject({
                depthLoadOp: 'load',
                depthStoreOp: 'store',
            });
            const pipeline = composite.vertexDraws[0]!.pipeline;
            expect(pipeline.fragment?.entryPoint).toBe('refraction_composite_fs');
            expect(pipeline.depthStencil).toMatchObject({
                depthCompare: 'always',
                depthWriteEnabled: true,
            });
            expect(pipeline.multisample?.count ?? 1).toBe(samples);
        },
    );

    it.each([
        [1, 'temporal', true],
        [1, 'accumulate', false],
        [4, 'temporal', false],
    ] as const)(
        'movimento do que a refração mostra (T044a), %i amostra(s), %s: só o ba do alvo de movimento, depois da composição, no quadro em que o traçado produziu (%s)',
        async (samples, mode, drawn) => {
            const s = await scene(true, { samples, composite: true, motion: mode });
            const rs = s.scene.resourceSystem;
            // Sem o traçado (sem a estrutura de raios), no temporal só a limpeza da máscara reativa.
            expect(s.step().map((p) => p.label)).toEqual(
                expect.not.arrayContaining(['RefractionMotionFlow']),
            );
            for (const id of ['radiance', 'hit']) rs.ensureAllocated(s.refraction, id);
            rs.markProduced(s, s.refraction, 'radiance', true);
            s.step();
            for (let i = 0; i < 30; i++) await Promise.resolve();
            const passes = s.step();
            const labels = passes.map((p) => p.label);
            expect(labels.includes('RefractionMotionFlow')).toBe(drawn);
            if (!drawn) return;
            expect(labels.indexOf('RefractionCompositeFlow')).toBeLessThan(
                labels.indexOf('RefractionMotionFlow'),
            );
            const motion = passes.find((p) => p.label === 'RefractionMotionFlow')!;
            expect(motion.target.colorAttachments).toEqual([
                { view: rs.textureViewOf(s.targets!, 'motion'), loadOp: 'load', storeOp: 'store' },
                // A máscara reativa, limpa a cada quadro.
                {
                    view: rs.textureViewOf(s.targets!, 'reactive'),
                    loadOp: 'clear',
                    clearValue: [0, 0, 0, 0],
                    storeOp: 'store',
                },
            ]);
            expect(motion.target.depthStencilAttachment).toBeUndefined();
            const pipeline = motion.vertexDraws[0]!.pipeline;
            expect(pipeline.fragment?.entryPoint).toBe('refraction_motion_fs');
            // Só azul e alfa (o rg é o movimento da superfície do vidro).
            expect(pipeline.fragment?.targets).toEqual([
                { format: 'rgba16float', writeMask: 0xc },
                { format: 'r8unorm' },
            ]);
        },
    );

    it.each([
        [4, 'temporal'],
        [4, 'msaa'],
        [1, 'off'],
    ] as const)(
        'sem o alvo de movimento (%i amostra(s), %s): o movimento e o filtro da refração não deixam o motor pendente',
        async (samples, mode) => {
            const s = await scene(true, { samples, composite: true, motion: mode });
            s.scene.world.insert(new TracedDenoiser());
            s.scene.flows.register((ctx) => new RefractionDenoiseFlow(ctx), {
                type: 'refractionDenoise',
                phase: 'forward',
                priority: -66,
            });
            for (let k = 0; k < 3; k++) {
                s.step();
                for (let i = 0; i < 30; i++) await Promise.resolve();
            }
            const pending = s.scene.resourceSystem.readiness.pending.map((p) => p.flow);
            expect(pending).not.toContain('RefractionMotionFlow');
            expect(pending).not.toContain('RefractionDenoiseFlow');
            expect(s.computes()).not.toContain('RefractionDenoiseFlow.temporal');
        },
    );

    it.each([
        ['temporal', true],
        ['accumulate', false],
    ] as const)(
        'filtro do traçado (T044a), %s: entre o traçado e a composição, que lê a cor filtrada (%s)',
        async (mode, filtered) => {
            const s = await scene(true, { samples: 1, composite: true, motion: mode });
            const denoiser = new TracedDenoiser();
            s.scene.world.insert(denoiser);
            s.scene.flows.register((ctx) => new RefractionDenoiseFlow(ctx), {
                type: 'refractionDenoise',
                phase: 'forward',
                priority: -66,
            });
            const rs = s.scene.resourceSystem;
            s.step();
            // Sem o traçado (sem a estrutura de raios), nada a filtrar.
            expect(s.computes()).not.toContain('RefractionDenoiseFlow.temporal');
            expect(rs.isProduced(denoiser, 'output')).toBe(false);
            for (const id of ['radiance', 'hit']) rs.ensureAllocated(s.refraction, id);
            rs.markProduced(s, s.refraction, 'radiance', true);
            s.step();
            for (let i = 0; i < 30; i++) await Promise.resolve();
            const passes = s.step();
            expect(rs.isProduced(denoiser, 'output')).toBe(filtered);
            expect(s.computes().includes('RefractionDenoiseFlow.temporal')).toBe(filtered);
            // Os alvos do filtro e o gradiente temporal da refração só existem com o temporal (quem filtra os aloca).
            expect(rs.textureOf(denoiser, 'output') !== undefined).toBe(filtered);
            expect(rs.textureOf(s.refraction, 'gradient') !== undefined).toBe(filtered);
            const composite = passes.find((p) => p.label === 'RefractionCompositeFlow')!;
            expect(composite.vertexDraws[0]!.pipeline.fragment?.entryPoint).toBe(
                filtered ? 'refraction_composite_denoised_fs' : 'refraction_composite_fs',
            );
        },
    );
});
