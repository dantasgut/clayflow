import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { POINT_PARAMS, wgslPoint } from '../../../scene/shaders/WgslPoint';
import materialPointTypesSource from '../../gpu/wgsl/material_point_types.wgsl?raw';
import forwardMaterialReadySource from '../../gpu/wgsl/forward_material_ready.wgsl?raw';
import forwardMaterialFnSource from '../../gpu/wgsl/forward_material_fn.wgsl?raw';
import materialFnReadySource from '../../gpu/wgsl/material_fn_ready.wgsl?raw';
import materialCheckSource from '../../gpu/wgsl/material_check.wgsl?raw';
import { StandardMaterialSchema } from '../StandardMaterialSchema';

/** Tipos do ponto `material`: `SurfaceSample` e `SurfaceParams`. */
export const materialPointTypes = wgslModule({
    name: 'material_point_types',
    source: materialPointTypesSource,
});

/** Função pronta do ponto `material` (as constantes do material). */
export const materialFnReady = wgslModule({
    name: 'material_fn_ready',
    source: materialFnReadySource,
    requires: [materialPointTypes],
    structs: [StandardMaterialSchema],
});

/** Parâmetros de superfície prontos do forward: os da função pronta (as constantes do material). */
export const forwardMaterialReady = wgslModule({
    name: 'forward_material_ready',
    source: forwardMaterialReadySource,
    requires: [materialPointTypes, materialFnReady],
    structs: [StandardMaterialSchema],
});

/** Lugar dos parâmetros de superfície no forward: o pronto ou o adaptador da função da entidade. */
export const forwardMaterial: BindablePoint = {
    name: 'material_eval',
    ready: forwardMaterialReady,
};

/**
 * Adaptador do forward para o ponto `material`: `material_eval` chama `material_fn` com os parâmetros do registro da
 * entidade. Com a função pronta; `forwardMaterialAdapter` troca a pronta pela função do usuário.
 */
export const forwardMaterialFn = wgslModule({
    name: 'forward_material_fn',
    source: forwardMaterialFnSource,
    requires: [materialPointTypes, materialFnReady],
    structs: [StandardMaterialSchema],
});

/** Kernel de validação das `MaterialFunction` (não é despachado): o adaptador do forward com a função. */
export const materialCheck = wgslModule({
    name: 'material_check',
    source: materialCheckSource,
    requires: [
        materialPointTypes,
        forwardMaterialFn,
        wgslResource({
            name: 'material_check_materials',
            binding: { storage: 'read' },
            type: { schema: StandardMaterialSchema, array: true },
            frequency: 'stage',
            provider: 'private',
        }),
        wgslResource({
            name: 'material_check_out',
            binding: { storage: 'read_write' },
            type: { wgsl: 'vec4f', array: true },
            frequency: 'stage',
            provider: 'private',
        }),
    ],
    structs: [StandardMaterialSchema],
});

/** Adaptador do forward para a função `material` `fnModule`: o adaptador com a função no lugar da pronta. */
export function forwardMaterialAdapter(fnModule: WgslModule): WgslModule {
    return bindPoints(forwardMaterialFn, new Map([[materialPoint, fnModule]]));
}

/**
 * Ponto `material` (spec 009): `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) ->
 * SurfaceParams` — os parâmetros de superfície no fragmento (cor base, rugosidade, metalicidade, emissão) a partir da
 * amostra (posição de mundo, normal, uv, tempo) e das constantes do material. Pronta: as constantes.
 */
export const materialPoint = wgslPoint({
    name: 'material',
    required: {
        name: 'material_fn',
        params: ['SurfaceSample', 'StandardMaterial', POINT_PARAMS],
        returns: 'SurfaceParams',
        names: ['s', 'm', 'data'],
    },
    paramsAlias: 'MaterialFnParams',
    context: 'fragment',
    ready: materialFnReady,
    hosts: () => [materialCheck],
});
