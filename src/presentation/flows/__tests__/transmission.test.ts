import { describe, expect, it } from 'vitest';
import { registerStages, renderScene } from './helpers/renderHarness';
import { SphereGeometry } from '../../../elements/geometry/SphereGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Transform } from '../../../elements/scene/Transform';
import { Camera } from '../../../elements/scene/Camera';
import { MaterialFunction } from '../../../elements/extension/MaterialFunction';
import { forwardTransmission } from '../../../elements/material/shaders';
import { giRefraction } from '../../../elements/lighting/shaders';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';

// Passe de transmissivos (spec 011, T061): só existe com material transmissivo; cópia com mips antes de cada camada; os
// transmissivos saem do passe principal; faces de trás com a distância (MRT) e a profundidade própria, depois as da frente.

const GLASS = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    return closure_add(closure_dielectric(1.5, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0));
}`;

async function scene(glass: boolean) {
    const s = await renderScene();
    registerStages(s.scene, { forward: 'scene' });
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

    it('a luz que atravessa o vidro é a refração traçada, nunca a cópia da tela (spec 034, US7)', () => {
        for (const module of [forwardTransmission.single, forwardTransmission.multisampled]) {
            const source = composeWgsl(module).spec.source;
            // A transmissão soma o `scene_refraction` do pixel; a cópia só fica na parede fina e na opacidade.
            expect(source).toContain('out = out + c.transmission_weight * traced.rgb;');
            expect(source).toContain('scene_refraction(pixel)');
            expect(source).not.toContain('transmission_screen_uv');
            expect(source).not.toMatch(/refract\(/);
        }
        // O kernel percorre as interfaces pela estrutura de raios e não lê a cópia da cena.
        const kernel = composeWgsl(giRefraction).spec.source;
        expect(kernel).toContain('ray_scene_hit(o, d, max_dist)');
        expect(kernel).not.toContain('scene_copy');
    });
});
