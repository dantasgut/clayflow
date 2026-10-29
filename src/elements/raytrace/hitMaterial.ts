import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import { closure } from '../material/pbr/shaders';
import { materialPointTypes } from '../material/point/types/shaders';
import { StandardMaterialSchema } from '../material/StandardMaterialSchema';
import type { RayMaterialFunction } from './RayScene';

export { rayHit, rayHitMaterialPoint, rayHitMaterialReady } from './shaders';

// Material nos acertos dos raios (spec 034, R2): um módulo da estrutura de raios, comum a quem traça — a iluminação
// global, os fótons e a refração compõem o mesmo símbolo, sem que um dependa do outro.

/**
 * Composição das funções `material` nos acertos (um `switch` pelo índice da função da instância). O índice sem função (0,
 * ou fora da composição) sai antes, com o fechamento das constantes, e o `switch` escolhe só entre as funções (a última
 * no `default`): com o caminho das constantes como terceiro caso do `switch`, o compilador de GPU da Apple caía
 * (`MTLCompilerService`, falha de segmentação no backend) no kernel da emissão das cáusticas gerado pelo naga (o
 * compilador de WGSL do wgpu, no Deno) — medido no M4, Deno 2.7 e 2.9; o Tint do Chrome não passa por ali.
 */
export function composeHitMaterial(functions: readonly RayMaterialFunction[]): WgslModule {
    const calls = functions.map((f) => {
        const call = `${f.functionName}(s, m, ${f.loaderName}(fn_slot))`;
        return `c = ${f.returnsClosure ? call : `closure_from_params(${call})`};`;
    });
    const constants =
        'closure_sanitize(closure_from_params(SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0))))';
    const choice =
        calls.length === 1
            ? [`    ${calls[0]}`]
            : [
                  '    switch (index) {',
                  ...calls.slice(0, -1).map((c, k) => `        case ${k + 1}u: { ${c} }`),
                  `        default: { ${calls[calls.length - 1]} }`,
                  '    }',
              ];
    const body =
        calls.length === 0
            ? [`    return ${constants};`]
            : [
                  `    if (index == 0u || index > ${calls.length}u) { return ${constants}; }`,
                  '    var c: Closure;',
                  ...choice,
                  '    return closure_sanitize(c);',
              ];
    return wgslModule({
        name: `ray_hit_material_${functions.map((f) => f.module.name).join('_')}`,
        requires: [materialPointTypes, closure, ...functions.map((f) => f.module)],
        structs: [StandardMaterialSchema],
        source: [
            '// Funções `material` da cena nos acertos dos raios (gerado; spec 033 R3, spec 034 R2).',
            'fn ray_hit_material(index: u32, s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> Closure {',
            ...body,
            '}',
        ].join('\n'),
    });
}
