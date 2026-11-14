import { poolArenaSlotOf } from '../../../scene/shaders/poolArena';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
/**
 * Topologia e sombra do material (spec 008, US5): `topology` vem do descritor de pipeline; `castsShadow` é verdadeiro
 * só para triângulos, salvo atribuição.
 */
import { describe, expect, it } from 'vitest';
import { StandardMaterial } from '../StandardMaterial';
import { WireframeMaterial } from '../WireframeMaterial';
import { PointSpriteMaterial } from '../PointSpriteMaterial';

describe('topologia do material (spec 008)', () => {
    it('topologia do descritor de pipeline', () => {
        expect(new StandardMaterial().topology).toBe('triangle-list');
        expect(new WireframeMaterial().topology).toBe('line-list');
        expect(new PointSpriteMaterial().topology).toBe('point-list');
    });

    it('castsShadow: só triângulos por padrão; atribuição vale', () => {
        expect(new StandardMaterial().castsShadow).toBe(true);
        expect(new WireframeMaterial().castsShadow).toBe(false);
        const sprites = new PointSpriteMaterial();
        expect(sprites.castsShadow).toBe(false);
        sprites.castsShadow = true;
        expect(sprites.castsShadow).toBe(true);
        const standard = new StandardMaterial();
        standard.castsShadow = false;
        expect(standard.castsShadow).toBe(false);
    });

    it('dois lados (spec 034, T061a): o descritor sem descarte de faces, num pipeline próprio; a face de trás com a normal voltada para quem vê', () => {
        const one = new StandardMaterial().getPipelineDescriptors()[0]!;
        const two = new StandardMaterial({ doubleSided: true });
        const desc = two.getPipelineDescriptors()[0]!;
        expect(new StandardMaterial().doubleSided).toBe(false);
        expect(two.doubleSided).toBe(true);
        expect(one.cullMode).toBe('back');
        expect(desc.cullMode).toBe('none');
        expect(desc.id).not.toBe(one.id);
        const source = composeWgsl(desc.shader).spec.source;
        expect(source).toContain('@builtin(front_facing) front: bool');
        expect(source).toContain('normalize(in.world_normal) * select(-1.0, 1.0, front)');
    });

    it('PointSpriteMaterial tem struct próprio (sem alias de StandardMaterial)', () => {
        const desc = new PointSpriteMaterial().getPipelineDescriptors()[0]!;
        // O pool dele pela arena (T060i): o acessor monta o struct próprio da região do pool `PointSpriteMaterial`.
        const k = poolArenaSlotOf('pool:PointSpriteMaterial')!;
        const source = composeWgsl(desc.shader).spec.source;
        expect(source).toContain('fn materials_at(i: u32) -> PointSpriteMaterial {');
        expect(source).toContain(`let b = pool_arena[${k}u] + i * `);
        expect(desc.pools).toBeUndefined();
    });
});
