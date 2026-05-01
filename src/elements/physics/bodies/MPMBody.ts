import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { FlowDescriptor } from '../../../scene/descriptors/FlowDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

/**
 * Partícula MPM. Schema TS casa byte-a-byte com `MPMParticle` em
 * `gpu/wgsl/structs/mpm_particle.wgsl` (8 vec4f = 128 bytes).
 *
 *   pos:    xyz=posição, w=mass
 *   vel:    xyz=velocidade, w=V0_p (volume de repouso)
 *   F_col0: coluna 0 de F (gradiente de deformação), w=det(F) cacheado
 *   F_col1: coluna 1, w=material_id override
 *   F_col2: coluna 2, w=padding
 *   C_col*: coluna 0/1/2 de C (APIC affine momentum matrix)
 */
export class MPMBody extends PhysicsBody {
    static readonly schema = new StructSchema('MPMParticle', {
        pos: FieldType.vec4f,
        vel: FieldType.vec4f,
        F_col0: FieldType.vec4f,
        F_col1: FieldType.vec4f,
        F_col2: FieldType.vec4f,
        C_col0: FieldType.vec4f,
        C_col1: FieldType.vec4f,
        C_col2: FieldType.vec4f,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        const position = (values.position ?? [0, 0, 0, 1]) as readonly number[];
        const velocity = (values.velocity ?? [0, 0, 0, 0]) as readonly number[];
        const mass = (values.mass ?? 0.02) as number;
        const volume = (values.volume ?? 1e-3) as number;
        // F inicial = identidade; C inicial = zero.
        this.data = MPMBody.schema.applyDefaults({
            pos: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0, mass],
            vel: [velocity[0] ?? 0, velocity[1] ?? 0, velocity[2] ?? 0, volume],
            F_col0: [1, 0, 0, 1], // x=1, w=det(F)=1
            F_col1: [0, 1, 0, 0], // y=1, w=material_id=0
            F_col2: [0, 0, 1, 0], // z=1, w=pad
            C_col0: [0, 0, 0, 0],
            C_col1: [0, 0, 0, 0],
            C_col2: [0, 0, 0, 0],
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'body',
                role: 'storage-rw',
                schema: MPMBody.schema,
                storage: 'pool',
            },
        ];
    }

    getFlowDescriptors(): readonly FlowDescriptor[] {
        return [{ algorithm: 'MPM', bodyType: 'MPMParticle' }];
    }
}
