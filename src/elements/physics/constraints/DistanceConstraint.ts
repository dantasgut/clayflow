import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { ParticleBody } from '../bodies/ParticleBody';
import { Constraint } from './Constraint';

/** Partícula de um corpo: o corpo (`FluidBody`/`SoftBody` na cena) e o índice dela no corpo. */
export interface ParticleRef {
    /** Partículas por campo. */
    readonly body: ParticleBody;
    /** Índice da partícula no corpo. */
    readonly index: number;
}

/** Dado de um `DistanceConstraint` (layout de `DistanceConstraint.schema`; `i`/`j` resolvidos pela C2). */
export interface DistanceConstraintData {
    /** Primeira partícula (slot resolvido pela C2). */
    i: ParticleRef;
    /** Segunda partícula (slot resolvido pela C2). */
    j: ParticleRef;
    /** Comprimento de repouso. */
    rest_length: number;
    /** Compliance (m/N; 0 = rígida). */
    compliance: number;
    /**
     * Cor da restrição (spec 034, T061b): as da mesma cor não compartilham partícula e são resolvidas em paralelo; a
     * `XPBD_SERIAL_COLOR`, uma a uma.
     */
    color: number;
}

/**
 * Cores das restrições de distância por despacho (spec 034, T061b): de 0 a `XPBD_SERIAL_COLOR − 1` as de um corpo
 * (coloração gulosa das arestas na criação do `SoftBody`: arestas da mesma cor não compartilham nó); a
 * `XPBD_SERIAL_COLOR` (`distance_solve.wgsl`), as avulsas, resolvidas uma a uma por uma invocação.
 */
export const XPBD_SERIAL_COLOR = 15;

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
 * Restrição de distância entre duas partículas (XPBD), no struct WGSL `DistanceConstraint` (20 bytes): `i`/`j` são os
 * slots das partículas no pool, resolvidos pela C2 a partir de `{ body, index }` (spec 008: o slot de um corpo é da
 * C2) — os dois corpos precisam estar no mesmo pool e na cena antes da restrição. Restrições internas de um corpo vão
 * em `SoftBody({ edges })`.
 */
export class DistanceConstraint extends Constraint<DistanceConstraintData> {
    /** StructSchema do DistanceConstraint (20 bytes: i/j/rest_length/compliance/color). */
    static readonly schema = new StructSchema('DistanceConstraint', {
        i: FieldType.u32,
        j: FieldType.u32,
        rest_length: FieldType.f32,
        compliance: FieldType.f32,
        color: FieldType.u32,
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
            // A avulsa pode ligar partículas de qualquer cor: uma a uma.
            color: XPBD_SERIAL_COLOR,
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
