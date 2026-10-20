import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import { closure } from '../material/pbr/shaders';
import { materialPointTypes } from '../material/point/types/shaders';
import { StandardMaterialSchema } from '../material/StandardMaterialSchema';
import type { RayMaterialFunction } from './RayScene';

export { rayHit, rayHitMaterialPoint, rayHitMaterialReady } from './shaders';

// Material nos acertos dos raios (spec 034, R2): um módulo da estrutura de raios, comum a quem traça — a iluminação
// global, os fótons e a refração compõem o mesmo símbolo, sem que um dependa do outro.

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
            '// Funções `material` da cena nos acertos dos raios (gerado; spec 033 R3, spec 034 R2).',
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
