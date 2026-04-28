import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { FlowDescriptor } from '../../../scene/descriptors/FlowDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

export type RigidBodyAlgorithm = 'LCP' | 'XPBD';

export interface RigidBodyOptions {
    readonly algorithm?: RigidBodyAlgorithm;
}

export class RigidBody extends PhysicsBody {
    static readonly schema = new StructSchema('RigidBody', {
        pos: FieldType.vec4f,
        vel: FieldType.vec4f,
        omega: FieldType.vec4f,
        rot: FieldType.vec4f,
        I_inv: FieldType.vec4f,
        pos_pred: FieldType.vec4f,
        rot_pred: FieldType.vec4f,
        mat_props: FieldType.vec4f,
        body_shape: FieldType.vec4f,
        _rb_pad: FieldType.vec4f,
    });

    static readonly defaultAlgorithm: RigidBodyAlgorithm = 'LCP';

    private readonly algorithm: RigidBodyAlgorithm;

    constructor(values: Record<string, unknown> = {}, options: RigidBodyOptions = {}) {
        super();
        this.algorithm = options.algorithm ?? RigidBody.defaultAlgorithm;
        const position = (values['position'] ?? [0, 0, 0, 1]) as readonly number[];
        const rotation = (values['rotation'] ?? [0, 0, 0, 1]) as readonly number[];
        const mass = (values['mass'] ?? 1) as number;
        const invMass = mass > 0 ? 1 / mass : 0;
        const matProps = values['material'] as readonly number[] | undefined;
        // Legacy contract: pos.w = inv_mass; vel.w = sleep_flag (0=awake);
        // mat_props = (restitution, friction, lin_damping, ang_damping).
        this.data = RigidBody.schema.applyDefaults({
            pos: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0, invMass],
            vel: values['velocity'] ?? [0, 0, 0, 0],
            omega: values['angularVelocity'] ?? [0, 0, 0, 0],
            rot: rotation,
            I_inv: values['inverseInertia'] ?? [invMass, invMass, invMass, 0],
            pos_pred: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0, invMass],
            rot_pred: rotation,
            mat_props: matProps ?? [
                (values['restitution'] ?? 0.2) as number,
                (values['friction'] ?? 0.5) as number,
                (values['linearDamping'] ?? 0) as number,
                (values['angularDamping'] ?? 0) as number,
            ],
            body_shape: values['shape'] ?? [0, 1, 0, 0],
            _rb_pad: [0, 0, 0, 0],
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{
            id: 'body',
            role: 'storage-rw',
            schema: RigidBody.schema,
            storage: 'pool',
        }];
    }

    getFlowDescriptors(): readonly FlowDescriptor[] {
        return [{ algorithm: this.algorithm, bodyType: 'RigidBody' }];
    }

    setPosition(p: readonly [number, number, number, number]): void {
        this.data['pos'] = p;
        this.data['pos_pred'] = p;
    }

    getPosition(): readonly number[] {
        return this.data['pos'] as readonly number[];
    }
}
