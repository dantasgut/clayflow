import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Constraint } from './Constraint';

/** Dado de um `JointConstraint` (layout de `JointConstraint.schema`). */
export interface JointConstraintData {
    /** Primeiro corpo. */
    bodyA: number;
    /** Segundo corpo. */
    bodyB: number;
    /** Tipo (código numérico do layout). */
    kind: number;
    /** Cor RGBA linear. */
    color: number;
    /** Ancoragem no primeiro corpo. */
    anchorA: number[];
    /** Ancoragem no segundo corpo. */
    anchorB: number[];
    /** Limites da junta. */
    limits: number[];
}

/**
 * Constraint articulação entre 2 bodies — kind discrimina hinge/ball/slider/etc.
 * limits codifica ângulos/extensões mín/máx específicos do kind.
 */
export class JointConstraint extends Constraint<JointConstraintData> {
    /** StructSchema do JointConstraint (bodyA/B + kind + anchors + limits). */
    static readonly schema = new StructSchema('JointConstraint', {
        bodyA: FieldType.u32,
        bodyB: FieldType.u32,
        kind: FieldType.u32,
        color: FieldType.u32,
        anchorA: FieldType.vec4f,
        anchorB: FieldType.vec4f,
        limits: FieldType.vec4f,
    });

    constructor(values: Partial<Omit<JointConstraintData, 'color'>> = {}) {
        super();
        this.data = {
            bodyA: values.bodyA ?? 0,
            bodyB: values.bodyB ?? 0,
            kind: values.kind ?? 0,
            color: 0,
            anchorA: values.anchorA ?? [0, 0, 0, 0],
            anchorB: values.anchorB ?? [0, 0, 0, 0],
            limits: values.limits ?? [0, 0, 0, 0],
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'constraint',
                role: 'storage-rw',
                schema: JointConstraint.schema,
                storage: 'pool',
            },
        ];
    }
}
