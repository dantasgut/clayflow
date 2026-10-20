/**
 * Material nos acertos dos raios como módulo comum (spec 034, R2): os kernels que traçam (sondas do mundo e de tela,
 * fótons) compõem um único `ray_hit_material` e um único `ray_hit_closure`, vindos da estrutura de raios — com o
 * pronto ou com a composição das funções da cena — e nenhum símbolo do antigo `gi_hit`.
 */
import { describe, expect, it } from 'vitest';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { giPhotonTrace, giProbeTrace, giScreenTrace } from '../../lighting/shaders';
import { composeHitMaterial, rayHitMaterialPoint } from '../hitMaterial';

const count = (source: string, needle: string): number => source.split(needle).length - 1;

describe('material nos acertos (módulo comum)', () => {
    for (const [name, kernel] of [
        ['sondas do mundo', giProbeTrace],
        ['sondas de tela', giScreenTrace],
        ['fótons', giPhotonTrace],
    ] as const) {
        it(`${name}: um ray_hit_material e um ray_hit_closure, com o pronto e com a composição`, () => {
            for (const shader of [
                kernel,
                bindPoints(kernel, new Map([[rayHitMaterialPoint, composeHitMaterial([])]])),
            ]) {
                const source = composeWgsl(shader).spec.source;
                expect(count(source, 'fn ray_hit_material(')).toBe(1);
                expect(count(source, 'fn ray_hit_closure(')).toBe(1);
                expect(source).not.toMatch(/\bgi_hit(_closure|_material)?\(/);
            }
        });
    }

    it('composição sem funções: o caso padrão é o das constantes do material', () => {
        const source = composeHitMaterial([]).source;
        expect(source).toContain('fn ray_hit_material(index: u32');
        expect(source).toContain('default: { c = closure_from_params(SurfaceParams(m.albedo');
    });
});
