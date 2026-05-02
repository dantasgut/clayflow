import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { FlowDescriptor } from '../../../scene/descriptors/FlowDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

/**
 * Solver algorithms para fluid simulation:
 *   - `SPH`: Smoothed Particle Hydrodynamics — clássico, muscle-mass-spring-like.
 *   - `PBF`: Position-Based Fluids — mais estável que SPH, density constraint.
 *   - `MPM`: Material Point Method — fluido como partículas + grid Eulerian.
 */
export type FluidBodyAlgorithm = 'SPH' | 'PBF' | 'MPM';

/** Opções de criação do FluidBody. */
export interface FluidBodyOptions {
    /** Algoritmo solver. Default: 'SPH'. */
    readonly algorithm?: FluidBodyAlgorithm;
}

/**
 * FluidBody — partícula de fluido (water, smoke, gel). Pool storage com
 * estado: position, velocity, density (calculada por SPH/PBF), pressure
 * (derivada da density), mass, material_id (usado para mixing entre fluidos).
 */
export class FluidBody extends PhysicsBody {
    /** StructSchema do FluidBody (pos+vel+density+pressure+mass+material_id). */
    static readonly schema = new StructSchema('FluidBody', {
        pos: FieldType.vec4f,
        vel: FieldType.vec4f,
        density: FieldType.f32,
        pressure: FieldType.f32,
        mass: FieldType.f32,
        material_id: FieldType.u32,
    });

    /** Algoritmo solver default. */
    static readonly defaultAlgorithm: FluidBodyAlgorithm = 'SPH';

    private readonly algorithm: FluidBodyAlgorithm;

    constructor(values: Record<string, unknown> = {}, options: FluidBodyOptions = {}) {
        super();
        this.algorithm = options.algorithm ?? FluidBody.defaultAlgorithm;
        this.data = FluidBody.schema.applyDefaults({
            pos: values.position ?? [0, 0, 0, 1],
            vel: values.velocity ?? [0, 0, 0, 0],
            density: values.density ?? 1000.0,
            pressure: 0,
            mass: values.mass ?? 1.0,
            material_id: values.materialId ?? 0,
        });
    }

    /** Pool storage para coalescer N FluidBodies em 1 buffer GPU. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'body',
                role: 'storage-rw',
                schema: FluidBody.schema,
                storage: 'pool',
            },
        ];
    }

    /** Roteia para SPHFlow / PBFFlow / MPMFlow conforme algorithm. */
    getFlowDescriptors(): readonly FlowDescriptor[] {
        return [{ algorithm: this.algorithm, bodyType: 'FluidBody' }];
    }
}
