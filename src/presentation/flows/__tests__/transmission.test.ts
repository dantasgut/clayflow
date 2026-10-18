import { describe, expect, it } from 'vitest';
import { registerStages, renderScene } from './helpers/renderHarness';
import { SphereGeometry } from '../../../elements/geometry/SphereGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Transform } from '../../../elements/scene/Transform';
import { Camera } from '../../../elements/scene/Camera';
import { MaterialFunction } from '../../../elements/extension/MaterialFunction';
import { RayScene } from '../../../elements/raytrace/RayScene';
import { Refraction } from '../../../elements/material/Refraction';

// Passe de transmissivos (spec 011, T061; spec 034, T019): só existe com material transmissivo; os transmissivos saem do
// passe principal; cópia com mips, pedidos de refração (MRT sem amostras, profundidade própria), o traçado pela estrutura
// de raios e a composição das faces da frente.

const GLASS = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    return closure_add(closure_dielectric(1.5, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0));
}`;

async function scene(glass: boolean, rays = false) {
    const s = await renderScene();
    registerStages(s.scene, { forward: 'scene' });
    if (rays) {
        s.scene.world.insert(new RayScene());
        s.scene.world.insert(new Refraction());
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
    return s;
}

describe('ForwardFlow — transmissivos (spec 011)', () => {
    it('sem transmissivo: um passe só, sem cópia da cena', async () => {
        const s = await scene(false);
        const passes = s.step();
        expect(passes.map((p) => p.label)).toEqual(['ForwardFlow']);
        expect(s.computes().some((c) => c === 'ForwardFlow.sceneCopy')).toBe(false);
    });

    it('com transmissivo, sem a estrutura de raios: pedidos limpos e vazios, sem traçado; a composição desenha', async () => {
        const s = await scene(true);
        const passes = s.step();
        expect(passes.map((p) => p.label)).toEqual([
            'ForwardFlow',
            'ForwardFlow.refractionRequest',
            'ForwardFlow.transmissionFront',
        ]);
        expect(passes[0]!.draws).toHaveLength(1);
        expect(passes[1]!.draws).toHaveLength(0);
        expect(passes[1]!.target.colorAttachments.map((a) => a.loadOp)).toEqual(['clear', 'clear']);
        expect(passes[2]!.draws[0]!.pipeline.fragment?.entryPoint).toBe('fs_transmission_front');
        expect(s.computes()).not.toContain('ForwardFlow.refraction');
        expect(s.computes().filter((c) => c === 'ForwardFlow.sceneCopy')).toHaveLength(1);
    });

    it('com a estrutura de raios: pedidos sem amostras com profundidade própria, o traçado e a composição', async () => {
        const s = await scene(true, true);
        s.step();
        for (let i = 0; i < 30; i++) await Promise.resolve();
        const passes = s.step();
        expect(passes.map((p) => p.label)).toEqual([
            'ForwardFlow',
            'ForwardFlow.refractionRequest',
            'ForwardFlow.transmissionFront',
        ]);
        const request = passes[1]!;
        expect(request.target.colorAttachments).toHaveLength(2);
        expect(request.target.depthStencilAttachment).toMatchObject({
            depthClearValue: 1,
            depthLoadOp: 'clear',
        });
        expect(request.draws[0]!.pipeline.fragment?.entryPoint).toBe('fs_transmission_request');
        expect(request.draws[0]!.pipeline.multisample?.count ?? 1).toBe(1);
        expect(request.draws[0]!.pipeline.primitive?.cullMode).toBe('back');
        expect(s.computes()).toContain('ForwardFlow.refraction');
    });
});
