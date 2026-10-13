import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { ParticleBody } from '../bodies/ParticleBody';
import { Constraint } from './Constraint';

/** Partícula de um corpo: o corpo (`FluidBody`/`SoftBody` na cena) e o índice dela no corpo. */
export interface ParticleRef {
    readonly body: ParticleBody;
    readonly index: number;
}

/** Dado de um `DistanceConstraint` (layout de `DistanceConstraint.schema`; `i`/`j` resolvidos pela C2). */
export interface DistanceConstraintData {
    i: ParticleRef;
    j: ParticleRef;
    rest_length: number;
    compliance: number;
}

/** Valores do construtor do `DistanceConstraint`. */
export interface DistanceConstraintValues {
    /** Primeira partícula. */
    readonly a: ParticleRef;
    /** Segunda partícula. */
    readonly b: ParticleRef;
    /** Comprimento de repouso (m). Default 1. */
    readonly restLength?: number;
    /** Compliance (m/N; 0 = rígida). Default 0. */
    readonly compliance?: number;
}

/**
 * Restrição de distância entre duas partículas (XPBD), no struct WGSL `DistanceConstraint` (16 bytes): `i`/`j` são os
 * slots das partículas no pool, resolvidos pela C2 a partir de `{ body, index }` (spec 008: o slot de um corpo é da
 * C2) — os dois corpos precisam estar no mesmo pool e na cena antes da restrição. Restrições internas de um corpo vão
 * em `SoftBody({ edges })`.
 */
export class DistanceConstraint extends Constraint<DistanceConstraintData> {
    /** StructSchema do DistanceConstraint (16 bytes: i/j/rest_length/compliance). */
    static readonly schema = new StructSchema('DistanceConstraint', {
        i: FieldType.u32,
        j: FieldType.u32,
        rest_length: FieldType.f32,
        compliance: FieldType.f32,
    });

    constructor(values: DistanceConstraintValues) {
        super();
        if (values.a.body.particleSchema !== values.b.body.particleSchema) {
            throw new Error(
                `DistanceConstraint: as partículas estão em pools diferentes ('${values.a.body.particleSchema.name}' e `
                    + `'${values.b.body.particleSchema.name}'); a restrição liga partículas do mesmo algoritmo.`,
            );
        }
        this.data = {
            i: values.a,
            j: values.b,
            rest_length: values.restLength ?? 1,
            compliance: values.compliance ?? 0,
        };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'constraint',
                role: 'storage-rw',
                schema: DistanceConstraint.schema,
                storage: 'pool',
                slotRefs: { i: 'ref:body', j: 'ref:body' },
            },
        ];
    }
}
