import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import { closure } from '../material/pbr/shaders';
import { materialPointTypes } from '../material/point/types/shaders';
import { StandardMaterialSchema } from '../material/StandardMaterialSchema';
import type { RayMaterialFunction } from './RayScene';
import {
    RayWaveEntrySchema,
    RayWaveHitSchema,
    rayWaveRead,
    rayWaveResources as W,
} from './wave/shaders';

// O material nos acertos fora do traçado (spec 039, R4): um kernel por função `material` da estrutura de raios — gerado
// do mesmo módulo `composite` que o desenho usa, uma só função por kernel — e o das constantes do `StandardMaterial`.

/** Constante `override` da classe de um kernel de material (o mesmo kernel serve a qualquer classe). */
export const RAY_WAVE_CLASS = 'RAY_WAVE_CLASS';

/** Entrada dos kernels de material. */
export const HIT_SHADE_ENTRY = 'hit_shade_main';

/**
 * O kernel de material nos acertos de uma classe: para cada registro da faixa da classe (`RAY_WAVE_CLASS`), o fechamento
 * de `evaluate` (uma expressão WGSL sobre `s: SurfaceSample`, `m: StandardMaterial` e `h: RayWaveHit`) gravado no índice
 * do registro — os grupos do despacho percorrem a faixa em passo de grade (o laço sobre os registros, limitado pela
 * capacidade da onda; nenhum traçado).
 */
function hitShadeKernel(
    name: string,
    evaluate: string,
    requires: readonly WgslModule[],
): WgslModule {
    return wgslModule({
        name,
        requires: [
            WORKGROUP_SIZE.module,
            materialPointTypes,
            closure,
            rayWaveRead,
            W.entries,
            W.ranges,
            W.order,
            ...requires,
        ],
        structs: [StandardMaterialSchema, RayWaveHitSchema, RayWaveEntrySchema],
        source: [
            `// Material nos acertos de uma classe da onda (gerado; spec 039, R4).`,
            `override ${RAY_WAVE_CLASS}: u32 = 0u;`,
            '',
            '@compute @workgroup_size(WORKGROUP_SIZE)',
            `fn ${HIT_SHADE_ENTRY}(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {`,
            `    let range = ray_wave_ranges[${RAY_WAVE_CLASS}];`,
            '    // Passo de grade: os grupos do despacho percorrem a faixa (até a capacidade da onda).',
            '    for (var k = gid.x; k < range.y; k += nwg.x * WORKGROUP_SIZE) {',
            '        let i = ray_wave_order[range.x + k];',
            '        let h = ray_wave_entries[i].hit;',
            '        let s = ray_wave_sample(h);',
            '        let m = ray_wave_standard(h);',
            `        ray_wave_entries[i].closure = closure_sanitize(${evaluate});`,
            '    }',
            '}',
        ].join('\n'),
    });
}

/** O kernel de material da função `f` (uma só função `material` no kernel). */
export function hitShade(f: RayMaterialFunction): WgslModule {
    const call = `${f.functionName}(s, m, ${f.loaderName}(h.slot))`;
    return hitShadeKernel(
        `hit_shade_${f.module.name}`,
        f.returnsClosure ? call : `closure_from_params(${call})`,
        [f.module],
    );
}

/**
 * O kernel das constantes do `StandardMaterial` sobre a faixa de uma classe: o substituto da classe cujo kernel ainda
 * compila (o objeto aparece com as constantes até ele ficar pronto).
 */
export const hitShadeConstants = hitShadeKernel(
    'hit_shade_constants',
    'closure_from_params(SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0)))',
    [],
);
