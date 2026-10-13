import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { EntityRecordDeclaration } from '../../../scene/flows/slots';
import { Transform } from '../../scene/Transform';
import { RigidBody } from '../bodies/RigidBody';

/**
 * Registro de publicação da pose (spec 007): por corpo rígido com `Transform`, o slot do corpo no pool e o do
 * `Transform`. O LCP copia, na GPU, posição e rotação do corpo para o `Transform` — sem leitura de volta.
 */
export const RigidPoseSchema = new StructSchema('RigidPose', {
    bodySlot: FieldType.u32,
    transformSlot: FieldType.u32,
});

/** Lista dos registros vivos (um grupo único da C2): a publicação percorre só entidades presentes. */
export const RigidPoseInstanceSchema = new StructSchema('RigidPoseInstance', {
    pose: FieldType.u32,
});

/** Parâmetros da publicação: início e tamanho da lista de registros vivos. */
export const PosePublishParamsSchema = new StructSchema(
    'PosePublishParams',
    { first: FieldType.u32, count: FieldType.u32, _pad0: FieldType.u32, _pad1: FieldType.u32 },
    { addressSpace: 'uniform' },
);

/** Declaração do registro `RigidPose` (a C2 preenche os slots do descritor `body` e do `transform`). */
export const rigidPoseRecord: EntityRecordDeclaration = {
    schema: RigidPoseSchema,
    fields: {
        bodySlot: [RigidBody, 'body'],
        transformSlot: [Transform, 'transform'],
    },
};
