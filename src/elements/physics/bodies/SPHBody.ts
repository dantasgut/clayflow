import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { FlowDescriptor } from '../../../scene/descriptors/FlowDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

/**
 * Partícula SPH (WCSPH). Schema TS casa byte-a-byte com `SPHParticle` em
 * `gpu/wgsl/structs/sph_particle.wgsl` (4 vec4f = 64 bytes).
 *
 *   pos:   xyz=posição, w=density
 *   vel:   xyz=velocity, w=pressure
 *   force: xyz=force,    w=pad
 *   color: xyz=XSPH velocity correction, w=pad
 */
export class SPHBody extends PhysicsBody {
    /** StructSchema da partícula SPH (4 vec4f = 64 bytes). */
    static readonly schema = new StructSchema('SPHParticle', {
        pos: FieldType.vec4f,
        vel: FieldType.vec4f,
        force: FieldType.vec4f,
        color: FieldType.vec4f,
    });

    constructor(values: Record<string, unknown> = {}) {
        super();
        const position = (values.position ?? [0, 0, 0, 0]) as readonly number[];
        const velocity = (values.velocity ?? [0, 0, 0, 0]) as readonly number[];
        const density = (values.density ?? 1000) as number;
        this.data = SPHBody.schema.applyDefaults({
            pos: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0, density],
            vel: [velocity[0] ?? 0, velocity[1] ?? 0, velocity[2] ?? 0, 0],
            force: [0, 0, 0, 0],
            color: [0, 0, 0, 0],
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'body',
                role: 'storage-rw',
                schema: SPHBody.schema,
                storage: 'pool',
            },
        ];
    }

    getFlowDescriptors(): readonly FlowDescriptor[] {
        return [{ algorithm: 'SPH', bodyType: 'SPHParticle' }];
    }
}
