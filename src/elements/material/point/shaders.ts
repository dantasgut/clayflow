import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { POINT_PARAMS, wgslPoint } from '../../../scene/shaders/WgslPoint';
import forwardMaterialReadySource from '../../gpu/wgsl/forward_material_ready.wgsl?raw';
import forwardMaterialFnSource from '../../gpu/wgsl/forward_material_fn.wgsl?raw';
import forwardMaterialFnClosureSource from '../../gpu/wgsl/forward_material_fn_closure.wgsl?raw';
import materialFnReadySource from '../../gpu/wgsl/material_fn_ready.wgsl?raw';
import materialCheckSource from '../../gpu/wgsl/material_check.wgsl?raw';
import { parseWgslFunctions } from '../../../scene/shaders/WgslPoint';
import { StandardMaterialSchema } from '../StandardMaterialSchema';
import { closure } from '../pbr/shaders';
import { materialPointTypes } from './types/shaders';

export { materialPointTypes } from './types/shaders';

/** Função pronta do ponto `material` (as constantes do material). */
export const materialFnReady = wgslModule({
    name: 'material_fn_ready',
    source: materialFnReadySource,
    requires: [materialPointTypes],
    structs: [StandardMaterialSchema],
});

/** Fechamento pronto do forward: o das constantes do material, pela função pronta (spec 011). */
export const forwardMaterialReady = wgslModule({
    name: 'forward_material_ready',
    source: forwardMaterialReadySource,
    requires: [materialPointTypes, materialFnReady, closure],
    structs: [StandardMaterialSchema],
});

/** Lugar do fechamento no forward (`material_eval`): o pronto ou o adaptador da função da entidade. */
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
    requires: [materialPointTypes, materialFnReady, closure],
    structs: [StandardMaterialSchema],
});

/** Adaptador do forward para uma função `material` de fechamento (`-> Closure`, spec 011). */
const forwardMaterialFnClosure = wgslModule({
    name: 'forward_material_fn_closure',
    source: forwardMaterialFnClosureSource,
    requires: [materialPointTypes, materialFnReady, closure],
    structs: [StandardMaterialSchema],
});

/** Recursos do kernel de validação (privados, nunca ligados: o kernel não é despachado). */
const materialCheckResources = [
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
];

/** Kernel de validação das `MaterialFunction` de fechamento (spec 011; não é despachado). */
const materialCheckClosure = wgslModule({
    name: 'material_check_closure',
    source: materialCheckSource,
    requires: [materialPointTypes, forwardMaterialFnClosure, ...materialCheckResources],
    structs: [StandardMaterialSchema],
});

/** Kernel de validação das `MaterialFunction` (não é despachado): o adaptador do forward com a função. */
export const materialCheck = wgslModule({
    name: 'material_check',
    source: materialCheckSource,
    requires: [materialPointTypes, forwardMaterialFn, ...materialCheckResources],
    structs: [StandardMaterialSchema],
});

/**
 * Adaptador do forward para a função `material` `fnModule`, pelo retorno dela (spec 011): `-> Closure` vai direto,
 * `-> SurfaceParams` passa pela base do OpenPBR; com a função no lugar da pronta.
 */
export function forwardMaterialAdapter(fnModule: WgslModule): WgslModule {
    const closureFn = parseWgslFunctions(fnModule.source).get('material_fn')?.returns === 'Closure';
    return bindPoints(
        closureFn ? forwardMaterialFnClosure : forwardMaterialFn,
        new Map([[materialPoint, fnModule]]),
    );
}

/**
 * Ponto `material` (spec 009, 011): `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) ->
 * Closure` (o fechamento de espalhamento) ou `-> SurfaceParams` (cor base, rugosidade, metalicidade, emissão — a forma
 * da 009, adaptada à base do OpenPBR) a partir da amostra (posição de mundo, normal, uv, tempo, geometria diferencial)
 * e das constantes do material. Pronta: as constantes.
 */
export const materialPoint = wgslPoint({
    name: 'material',
    required: {
        name: 'material_fn',
        params: ['SurfaceSample', 'StandardMaterial', POINT_PARAMS],
        returns: 'SurfaceParams',
        alternatives: ['Closure'],
        names: ['s', 'm', 'data'],
    },
    paramsAlias: 'MaterialFnParams',
    context: 'fragment',
    ready: materialFnReady,
    hosts: () => [materialCheck, materialCheckClosure],
});
