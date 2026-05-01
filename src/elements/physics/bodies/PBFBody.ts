import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { FlowDescriptor } from '../../../scene/descriptors/FlowDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

/**
 * Partícula PBF (Position-Based Fluids). Schema TS casa byte-a-byte com
 * `PBFParticle` em `gpu/wgsl/structs/pbf_particle.wgsl` (4 vec4f = 64 bytes).
 *
 *   pos:    xyz=position, w=lambda (multiplicador de constraint)
 *   vel:    xyz=velocity, w=pad
 *   posOld: posição antes do substep
 *   curl:   curl(v) para vorticity confinement, w=pad
 */
export class PBFBody extends PhysicsBody {
    static readonly schema = new StructSchema('PBFParticle', {
        pos: FieldType.vec4f,
        vel: FieldType.vec4f,
        posOld: FieldType.vec4f,
        curl: FieldType.vec4f,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        const position = (values.position ?? [0, 0, 0, 0]) as readonly number[];
        const velocity = (values.velocity ?? [0, 0, 0, 0]) as readonly number[];
        this.data = PBFBody.schema.applyDefaults({
            pos: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0, 0],
            vel: [velocity[0] ?? 0, velocity[1] ?? 0, velocity[2] ?? 0, 0],
            posOld: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0, 0],
            curl: [0, 0, 0, 0],
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'body',
                role: 'storage-rw',
                schema: PBFBody.schema,
                storage: 'pool',
            },
        ];
    }

    getFlowDescriptors(): readonly FlowDescriptor[] {
        return [{ algorithm: 'PBF', bodyType: 'PBFParticle' }];
    }
}
