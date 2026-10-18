import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import { closure } from '../material/pbr/shaders';
import { materialPointTypes } from '../material/point/types/shaders';
import { StandardMaterialSchema } from '../material/StandardMaterialSchema';
import type { RayMaterialFunction } from './RayScene';

// Material nos acertos dos raios com as funções `material` da cena (spec 033, R3; spec 034, R3): o módulo que cada
// estágio que traça liga no ponto `ray_hit_material` (`bindPoints`) — a luz rebatida e a refração usam o mesmo.

/** Composição das funções `material` nos acertos (um `switch` pelo índice da função da instância). */
export function composeHitMaterial(functions: readonly RayMaterialFunction[]): WgslModule {
    const cases = functions.map((f, k) => {
        const call = `${f.functionName}(s, m, ${f.loaderName}(fn_slot))`;
        return `        case ${k + 1}u: { c = ${f.returnsClosure ? call : `closure_from_params(${call})`}; }`;
    });
    return wgslModule({
        name: `ray_hit_material_${functions.map((f) => f.module.name).join('_')}`,
        requires: [materialPointTypes, closure, ...functions.map((f) => f.module)],
        structs: [StandardMaterialSchema],
        source: [
            '// Funções `material` da cena nos acertos dos raios (gerado; spec 033, R3; spec 034, R3).',
            'fn ray_hit_material(index: u32, s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> Closure {',
            '    var c: Closure;',
            '    switch (index) {',
            ...cases,
            '        default: { c = closure_from_params(SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0))); }',
            '    }',
            '    return closure_sanitize(c);',
            '}',
        ].join('\n'),
    });
}
