import { describe, expect, it } from 'vitest';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import { MaterialFunction } from '../../extension/MaterialFunction';
import { composeHitMaterial } from '../hitMaterial';
import { rayHit, rayHitMaterialPoint, rayHitMaterialReady } from '../shaders';

/** Nomes de todos os módulos alcançados por `requires`. */
function reached(m: WgslModule, seen = new Set<string>()): Set<string> {
    if (seen.has(m.name)) return seen;
    seen.add(m.name);
    for (const r of m.requires) reached(r, seen);
    return seen;
}

describe('material nos acertos dos raios (spec 034, R3)', () => {
    it('ray_hit_closure não depende da luz rebatida: o tempo vem de quem traça', () => {
        expect(rayHit.source).toContain('fn ray_hit_closure(hit: RayHit, time: f32) -> Closure');
        const names = reached(rayHit);
        expect([...names].some((n) => n.startsWith('gi'))).toBe(false);
        expect(names.has('ray_hit_material_ready')).toBe(true);
    });

    it('ponto ray_hit_material: pronto pelas constantes; composição da cena com o mesmo nome', () => {
        expect(rayHitMaterialPoint).toEqual({
            name: 'ray_hit_material',
            ready: rayHitMaterialReady,
        });
        const f = new MaterialFunction({
            code: 'fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n    return closure_diffuse(m.albedo.rgb, 0.0);\n}',
        });
        const composed = composeHitMaterial([
            { ...f.composite!, returnsClosure: f.returnsClosure },
        ]);
        expect(composed.source).toContain('fn ray_hit_material(index: u32, s: SurfaceSample');
        expect(composed.name.startsWith('ray_hit_material_')).toBe(true);
    });
});
