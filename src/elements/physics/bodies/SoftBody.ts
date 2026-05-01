import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { FlowDescriptor } from '../../../scene/descriptors/FlowDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

export type SoftBodyAlgorithm = 'XPBD' | 'FEM' | 'MPM';

export interface SoftBodyOptions {
    readonly algorithm?: SoftBodyAlgorithm;
}

/**
 * SoftBody segue contrato `Particle` WGSL legacy (48B = 3 vec4f).
 *   pos:  xyz=posição,        w=invMass (0=fixada)
 *   pred: xyz=posição prev.,  w=reservado
 *   vel:  xyz=velocidade,     w=reservado
 */
export class SoftBody extends PhysicsBody {
    static readonly schema = new StructSchema('SoftBody', {
        pos: FieldType.vec4f,
        pred: FieldType.vec4f,
        vel: FieldType.vec4f,
    });

    static readonly defaultAlgorithm: SoftBodyAlgorithm = 'XPBD';

    private readonly algorithm: SoftBodyAlgorithm;

    constructor(values: Record<string, unknown> = {}, options: SoftBodyOptions = {}) {
        super();
        this.algorithm = options.algorithm ?? SoftBody.defaultAlgorithm;
        const position = (values.position ?? [0, 0, 0, 1]) as readonly number[];
        const velocity = (values.velocity ?? [0, 0, 0, 0]) as readonly number[];
        const mass = (values.mass ?? 1) as number;
        const invMass = mass > 0 ? 1 / mass : 0;
        this.data = SoftBody.schema.applyDefaults({
            pos: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0, invMass],
            pred: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0, 0],
            vel: [velocity[0] ?? 0, velocity[1] ?? 0, velocity[2] ?? 0, 0],
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'body',
                role: 'storage-rw',
                schema: SoftBody.schema,
                storage: 'pool',
            },
        ];
    }

    getFlowDescriptors(): readonly FlowDescriptor[] {
        return [{ algorithm: this.algorithm, bodyType: 'SoftBody' }];
    }
}
