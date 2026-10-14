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

    it('PointSpriteMaterial tem struct próprio (sem alias de StandardMaterial)', () => {
        const desc = new PointSpriteMaterial().getPipelineDescriptors()[0]!;
        expect(desc.consumes).toContain('PointSpriteMaterial');
        expect(desc.consumes.some((c) => typeof c !== 'string')).toBe(false);
    });
});
