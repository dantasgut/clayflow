import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { LayoutInferencer } from '../../../scene/systems/LayoutInferencer';
import { SurfaceCollider, surfaceShadowPyramid } from '../colliders/SurfaceCollider';
import { surfaceColliderBuild } from '../shaders/surfaceCollider';
import {
    SURFACE_COLLIDER_CELL_POOL,
    surfaceShadow,
    surfaceShadowTransmission,
} from '../shaders/surfaceShadow';
import { lightTransmissionPoint } from '../../scene/points/lighting';

// A sombra pelo campo de alturas (spec 041, rodada 13): a pirâmide de máximos depois das cópias, a contribuição ao ponto
// `light_transmission` pelo slot do campo e a marcha com teto constante de passos.

describe('SurfaceCollider com a sombra pelo campo', () => {
    it('a pirâmide: lado potência de dois ≥ as células, níveis até 1 × 1, (P² − 1)/3 floats', () => {
        expect(surfaceShadowPyramid(4096, 4096)).toEqual({
            side: 4096,
            levels: 12,
            floats: (4096 * 4096 - 1) / 3,
        });
        expect(surfaceShadowPyramid(129, 65)).toEqual({ side: 128, levels: 7, floats: 5461 });
        expect(surfaceShadowPyramid(2, 2)).toEqual({ side: 2, levels: 1, floats: 1 });
    });

    it('o campo ganha a pirâmide depois das cópias; sem a sombra, nada muda', () => {
        const plain = new SurfaceCollider({ resolution: 129, steps: 1 });
        const shadow = new SurfaceCollider({ resolution: 129, steps: 1, castsShadow: true });
        expect(plain.castsShadow).toBe(false);
        expect(shadow.castsShadow).toBe(true);
        expect(plain.getDescriptors()[1]!.count).toBe(plain.data.copy_stride);
        expect(shadow.getDescriptors()[1]!.count).toBe(shadow.data.copy_stride + 5461);
        expect(() => new SurfaceCollider({ mode: 'distance', castsShadow: true })).toThrow(
            RangeError,
        );
    });

    it('contribui ao light_transmission pelo slot do campo, só com a sombra', () => {
        const shadow = new SurfaceCollider({ castsShadow: true });
        const plain = new SurfaceCollider();
        const [c] = shadow.getSceneContributions();
        expect(c!.point).toBe(lightTransmissionPoint);
        expect(c!.pools).toEqual([SurfaceCollider.cellSchema]);
        expect(SURFACE_COLLIDER_CELL_POOL).toBe(SurfaceCollider.cellSchema.name);
        expect(c!.build(() => 1234)).toBe(surfaceShadowTransmission(1234));
        expect(c!.build(() => undefined)).toBeUndefined();
        expect(plain.getSceneContributions()[0]!.build(() => 7)).toBeUndefined();
        const source = composeWgsl(surfaceShadowTransmission(1234)).spec.source;
        expect(source).toContain('fn light_transmission(light: u32, p: vec3f) -> vec3f');
        expect(source).toContain('surface_shadow_visibility(1234u,');
    });

    it('a marcha tem um laço só, de teto constante', () => {
        const source = composeWgsl(surfaceShadow).spec.source;
        expect(source).toContain('for (var i = 0u; i < SURFACE_SHADOW_STEPS; i++)');
        expect(source.match(/\bfor \(/g)).toHaveLength(1);
        expect(source).not.toMatch(/\bwhile\b|\bloop\b/);
    });

    it('a construção da pirâmide monta e o layout é inferido', () => {
        const composed = composeWgsl(surfaceColliderBuild);
        expect(new LayoutInferencer().infer(composed, ['scb_pyramid_main'])).toBeDefined();
        expect(composed.spec.source).toContain('bake.pyramid_side');
    });
});
