import { describe, expect, it } from 'vitest';
import { registerStages, renderScene } from './helpers/renderHarness';
import { SphereGeometry } from '../../../elements/geometry/SphereGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Transform } from '../../../elements/scene/Transform';
import { Camera } from '../../../elements/scene/Camera';
import { MaterialFunction } from '../../../elements/extension/MaterialFunction';
import { Refraction } from '../../../elements/lighting/refraction/Refraction';
import { RefractionFlow } from '../../../elements/lighting/refraction/RefractionFlow';

// Passe de transmissivos (spec 011, T061): só existe com material transmissivo; cópia com mips antes de cada camada; os
// transmissivos saem do passe principal; faces de trás com a distância (MRT) e a profundidade própria, depois as da frente.

const GLASS = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    return closure_add(closure_dielectric(1.5, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0));
}`;

async function scene(glass: boolean, refraction?: { samples: 1 | 4 }) {
    const s = await renderScene();
    registerStages(s.scene, { forward: 'scene', samples: refraction?.samples ?? 4 });
    const r = new Refraction();
    if (refraction !== undefined) {
        s.scene.world.insert(r);
        s.scene.flows.register((ctx) => new RefractionFlow(ctx), {
            type: 'refraction',
            phase: 'forward',
            priority: -65,
        });
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
    return Object.assign(s, { refraction: r });
}

describe('ForwardFlow — transmissivos (spec 011)', () => {
    it('sem transmissivo: um passe só, sem cópia da cena', async () => {
        const s = await scene(false);
        const passes = s.step();
        expect(passes.map((p) => p.label)).toEqual(['ForwardFlow']);
        expect(s.computes().some((c) => c === 'ForwardFlow.sceneCopy')).toBe(false);
    });

    it('com transmissivo: fora do passe principal; cópia + mips antes de cada camada; trás com MRT e profundidade própria', async () => {
        const s = await scene(true);
        const passes = s.step();
        expect(passes.map((p) => p.label)).toEqual([
            'ForwardFlow',
            'ForwardFlow.transmissionBack',
            'ForwardFlow.transmissionFront',
        ]);
        expect(passes[0]!.draws).toHaveLength(1);
        const back = passes[1]!;
        expect(back.target.colorAttachments).toHaveLength(2);
        expect(back.target.depthStencilAttachment).toMatchObject({
            depthClearValue: 0,
            depthLoadOp: 'clear',
        });
        expect(back.draws[0]!.pipeline.fragment?.entryPoint).toBe('fs_transmission_back');
        expect(back.draws[0]!.pipeline.primitive?.cullMode).toBe('front');
        expect(passes[2]!.draws[0]!.pipeline.fragment?.entryPoint).toBe('fs_transmission_front');
        expect(s.computes().filter((c) => c === 'ForwardFlow.sceneCopy')).toHaveLength(2);
        expect(s.computes().filter((c) => c.startsWith('copy:')).length).toBeGreaterThanOrEqual(2);
    });

    it.each([1, 4] as const)(
        'com a Refraction (spec 034, T041), %i amostra(s): pedido por pixel depois dos opacos — as duas faces, rg32uint sem amostras, profundidade própria limpa em 1; a fila compactada com despacho indireto',
        async (samples) => {
            const s = await scene(true, { samples });
            const passes = s.step();
            expect(passes.map((p) => p.label)).toEqual([
                'ForwardFlow',
                'ForwardFlow.refractionRequest',
                'ForwardFlow.transmissionBack',
                'ForwardFlow.transmissionFront',
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
});
