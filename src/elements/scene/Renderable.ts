import type { EntityRecordDeclaration } from '../../scene/flows/slots';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Material } from '../material/Material';
import { MaterialFunction } from '../extension/MaterialFunction';
import { Transform } from './Transform';

/**
 * Registro de desenho por entidade com Geometry + Material + Transform (pool `Renderable`): o slot da matriz de mundo
 * (`WorldTransform`) e o do material no pool do seu schema. O slot do registro é o `firstInstance` do desenho; o
 * shader lê `renderables[instance_index]` e, por ele, a matriz e o material — nenhum bind group muda entre desenhos.
 */
export const RenderableSchema = new StructSchema('Renderable', {
    transformSlot: FieldType.u32,
    materialSlot: FieldType.u32,
    /** Slot do registro da `MaterialFunction` da entidade (spec 009); `RECORD_NONE` sem função. */
    fnSlot: FieldType.u32,
});

/**
 * Lista de instâncias do render principal (spec 007): por instância de um grupo (geometria, pipeline), o slot do
 * registro `Renderable` da entidade. O desenho de um grupo usa `firstInstance` = início do segmento do grupo e o shader
 * lê `renderables[instances[instance_index].renderable]`.
 */
export const RenderInstanceSchema = new StructSchema('RenderInstance', {
    renderable: FieldType.u32,
});

/**
 * Declaração do registro `Renderable` para `slot.entities({ all: [Geometry, Material, Transform], record })`: a C2
 * preenche `transformSlot` com o slot do descritor `world` do `Transform` e `materialSlot` com o do descritor
 * `material` do `Material` da entidade.
 */
export const renderableRecord: EntityRecordDeclaration = {
    schema: RenderableSchema,
    fields: {
        transformSlot: [Transform, 'world'],
        materialSlot: [Material, 'material'],
        fnSlot: [MaterialFunction, 'params', { optional: true }],
    },
};
