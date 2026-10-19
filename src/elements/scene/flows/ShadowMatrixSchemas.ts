import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { EntityRecordDeclaration } from '../../../scene/flows/slots';
import { DirectionalLight } from '../DirectionalLight';
import { ShadowMap } from '../ShadowMap';

/** Registro de cada luz direcional que projeta sombra (spec 007): slot da luz e slot do mapa de sombra. */
export const ShadowRecordSchema = new StructSchema('ShadowRecord', {
    lightSlot: FieldType.u32,
    shadowSlot: FieldType.u32,
});

/** Lista dos mapas vivos (grupo único da C2): o estágio percorre só luzes que projetam. */
export const ShadowMatrixInstanceSchema = new StructSchema('ShadowMatrixInstance', {
    record: FieldType.u32,
});

/** Parâmetros do estágio: início e tamanho da lista das luzes; grupos e instâncias das geometrias da cena. */
export const ShadowMatrixParamsSchema = new StructSchema(
    'ShadowMatrixParams',
    {
        first: FieldType.u32,
        count: FieldType.u32,
        sceneGroups: FieldType.u32,
        sceneCount: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Lista das entidades com geometria, por grupo de geometria (spec 034): o slot da matriz de mundo de cada uma. */
export const ShadowBoundsInstanceSchema = new StructSchema('ShadowBoundsInstance', {
    world: FieldType.u32,
});

/**
 * Um grupo de geometria (spec 034), escrito pela CPU quando a composição muda: a caixa de objeto comum às instâncias
 * (`w` do mínimo 1 quando desconhecida) e o segmento delas na lista.
 */
export const ShadowBoundsGroupSchema = new StructSchema('ShadowBoundsGroup', {
    boundsMin: FieldType.vec4f,
    boundsMax: FieldType.vec4f,
    first: FieldType.u32,
    count: FieldType.u32,
    _pad0: FieldType.u32,
    _pad1: FieldType.u32,
});

/** Declaração do registro `ShadowRecord` (slots dos descritores `light` e `shadowmap`). */
export const shadowRecord: EntityRecordDeclaration = {
    schema: ShadowRecordSchema,
    fields: {
        lightSlot: [DirectionalLight, 'light'],
        shadowSlot: [ShadowMap, 'shadowmap'],
    },
};
