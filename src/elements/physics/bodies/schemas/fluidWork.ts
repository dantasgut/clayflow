import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';
import type { GPUDescriptor } from '../../../../scene/descriptors/GPUDescriptor';

// O trabalho por partícula dos solvers de fluido (spec 039): pools do próprio corpo, no mesmo slot das partículas
// (um Resource com vários descritores em pool ocupa o mesmo slot em todos). Um schema por algoritmo e por vetor: cada
// pool acompanha só os corpos daquele algoritmo, então os slots ficam alinhados com os do pool das partículas.

const vec4 = (name: string): StructSchema => new StructSchema(name, { v: FieldType.vec4f });

/** Normal de superfície por partícula SPH (tensão superficial de Akinci, spec 030). */
export const SPHNormalSchema = vec4('SPHNormal');
/** Fronteira sólida por partícula SPH (Σ −B' n, Σ B; Akinci et al. 2012). */
export const SPHBoundarySchema = vec4('SPHBoundary');
/** Correção de posição por partícula PBF. */
export const PBFDeltaSchema = vec4('PBFDelta');
/** Normal de superfície por partícula PBF. */
export const PBFNormalSchema = vec4('PBFNormal');
/** Fronteira sólida por partícula PBF (spec 034). */
export const PBFBoundarySchema = vec4('PBFBoundary');

/** O trabalho por partícula de cada schema de partícula de fluido (pelo nome do schema do corpo). */
const FLUID_WORK: Readonly<Record<string, readonly (readonly [string, StructSchema])[]>> = {
    SPHSchema: [
        ['normal', SPHNormalSchema],
        ['boundary', SPHBoundarySchema],
    ],
    PBFSchema: [
        ['delta', PBFDeltaSchema],
        ['normal', PBFNormalSchema],
        ['boundary', PBFBoundarySchema],
    ],
};

/**
 * Descritores do trabalho por partícula para um corpo de `count` partículas do schema `particle`: pools só da GPU
 * (`upload: 'never'`), alocados com o corpo (todo corpo do algoritmo os usa). Vazio para os demais schemas.
 */
export function fluidWorkDescriptors(particle: StructSchema, count: number): GPUDescriptor[] {
    return (FLUID_WORK[particle.name] ?? []).map(([id, schema]) => ({
        id,
        role: 'storage-rw',
        schema,
        storage: 'pool',
        upload: 'never',
        count,
    }));
}
