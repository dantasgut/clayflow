import { describe, expect, it } from 'vitest';
import { MaterialFunction } from '../../extension/MaterialFunction';
import { forwardMaterialAdapter } from '../point/shaders';
import { ALL_LOBES, LOBES, lobeMask, PARAMS_LOBES } from '../pbr/lobes';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { WgslCompositionError } from '../../../scene/shaders/WgslCompositionError';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { StandardMaterial } from '../StandardMaterial';
import { Transform } from '../../scene/Transform';
import { Camera } from '../../scene/Camera';
import {
    registerStages,
    renderScene,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

// Ponto `material` com os dois retornos (spec 011, T027): a forma da 009 (`SurfaceParams`) passa pela base do OpenPBR,
// a de fechamento vai direto; a máscara de lobos vem do código, dos nós ou da forma, e vai ao pipeline como constante.

const PARAMS_CODE = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    return SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0));
}`;

const CLOSURE_CODE = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    return closure_add(closure_diffuse(m.albedo.rgb, 0.0), closure_sheen(vec3f(1.0), 0.5));
}`;

describe('ponto material com fechamento (spec 011, T027)', () => {
    it('SurfaceParams: adaptador pela base do OpenPBR; lobos difuso, especular e emissão', () => {
        const fn = new MaterialFunction({ code: PARAMS_CODE });
        expect(fn.returnsClosure).toBe(false);
        expect(fn.lobeMask).toBe(PARAMS_LOBES);
        const adapter = forwardMaterialAdapter(fn.module);
        const src = composeWgsl(adapter).spec.source;
        expect(src).toContain(
            'closure_sanitize(closure_from_params(material_fn(s, m, material_fn_params(fn_slot))))',
        );
    });

    it('Closure: vai direto (saneado); lobos declarados ou, sem eles, todos', () => {
        const declared = new MaterialFunction({ code: CLOSURE_CODE, lobes: ['diffuse', 'sheen'] });
        expect(declared.returnsClosure).toBe(true);
        expect(declared.lobeMask).toBe(LOBES.diffuse | LOBES.sheen);
        expect(new MaterialFunction({ code: CLOSURE_CODE }).lobeMask).toBe(ALL_LOBES);
        const src = composeWgsl(forwardMaterialAdapter(declared.module)).spec.source;
        expect(src).toContain('closure_sanitize(material_fn(s, m, material_fn_params(fn_slot)))');
        expect(src).not.toContain('closure_from_params(material_fn(');
    });

    it('lobo desconhecido e retorno de outro tipo são erros na criação', () => {
        expect(
            () => new MaterialFunction({ code: CLOSURE_CODE, lobes: ['velvet' as never] }),
        ).toThrow(/lobo desconhecido 'velvet'/);
        expect(
            () =>
                new MaterialFunction({
                    code: 'fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> vec3f { return vec3f(0.0); }',
                }),
        ).toThrow(WgslCompositionError);
        expect(lobeMask(['diffuse', 'coat'])).toBe(LOBES.diffuse | LOBES.coat);
    });

    it('o pipeline leva a máscara: o pronto com a do material, a variante da função com a dela', async () => {
        const s = await renderScene();
        registerStages(s.scene, { forward: 'scene' });
        s.scene.world.insert(new Camera().add(new Transform({ position: [0, 0, 5, 1] })));
        s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        s.scene.world.insert(
            new BoxGeometry()
                .add(new StandardMaterial())
                .add(new Transform({ position: [2, 0, 0, 1] }))
                .add(new MaterialFunction({ code: CLOSURE_CODE, lobes: ['diffuse', 'sheen'] })),
        );
        s.step();
        for (let i = 0; i < 30; i++) await Promise.resolve();
        s.step();
        const masks = new Set(
            s.draws('ForwardFlow').map((d) => d.pipeline.fragment?.constants?.CLOSURE_LOBES),
        );
        expect(masks).toEqual(new Set([PARAMS_LOBES, LOBES.diffuse | LOBES.sheen]));
    });
});
