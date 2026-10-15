import { extensionRecordSchema } from '../../../scene/descriptors/ExtensionRecord';
import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../../../scene/shaders/WgslPoint';
import materialPointTypesSource from '../../gpu/wgsl/material_point_types.wgsl?raw';
import forwardMaterialReadySource from '../../gpu/wgsl/forward_material_ready.wgsl?raw';
import forwardMaterialFnSource from '../../gpu/wgsl/forward_material_fn.wgsl?raw';
import materialFnReadySource from '../../gpu/wgsl/material_fn_ready.wgsl?raw';
import materialCheckSource from '../../gpu/wgsl/material_check.wgsl?raw';
import { StandardMaterialSchema } from '../StandardMaterialSchema';

/** Registro de parâmetros das funções do ponto `material` (spec 009). */
export const MaterialFnRecordSchema = extensionRecordSchema('MaterialFnRecord');

/** Tipos do ponto `material`: `SurfaceSample` e `SurfaceParams`. */
export const materialPointTypes = wgslModule({
    name: 'material_point_types',
    source: materialPointTypesSource,
});

/** Parâmetros de superfície prontos do forward: as constantes do material. */
export const forwardMaterialReady = wgslModule({
    name: 'forward_material_ready',
    source: forwardMaterialReadySource,
    requires: [materialPointTypes],
    structs: [StandardMaterialSchema],
});

/** Lugar dos parâmetros de superfície no forward: o pronto ou o adaptador da função da entidade. */
export const forwardMaterial: BindablePoint = {
    name: 'material_eval',
    ready: forwardMaterialReady,
};

/** Função pronta do ponto `material` (as constantes do material). */
export const materialFnReady = wgslModule({
    name: 'material_fn_ready',
    source: materialFnReadySource,
    requires: [materialPointTypes],
    structs: [StandardMaterialSchema, MaterialFnRecordSchema],
});

/** Kernel de validação das `MaterialFunction` (não é despachado). */
export const materialCheck = wgslModule({
    name: 'material_check',
    source: materialCheckSource,
    requires: [materialPointTypes, materialFnReady],
    structs: [StandardMaterialSchema, MaterialFnRecordSchema],
});

const adapters = new WeakMap<WgslModule, WgslModule>();

/** Adaptador do forward para a função `material` `fnModule` (memorizado por módulo). */
export function forwardMaterialAdapter(fnModule: WgslModule): WgslModule {
    let adapter = adapters.get(fnModule);
    if (adapter === undefined) {
        adapter = wgslModule({
            name: 'forward_material_fn',
            source: forwardMaterialFnSource,
            requires: [materialPointTypes, fnModule],
            structs: [StandardMaterialSchema, MaterialFnRecordSchema],
        });
        adapters.set(fnModule, adapter);
    }
    return adapter;
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
    },
    paramsAlias: 'MaterialFnParams',
    record: MaterialFnRecordSchema,
    ready: materialFnReady,
    hosts: () => [materialCheck],
});
