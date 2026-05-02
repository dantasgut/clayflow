import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { FlowDescriptor } from '../../../scene/descriptors/FlowDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

/**
 * Solver algorithm para o RigidBody.
 *   - `LCP`: Linear Complementarity Problem — exacto mas mais lento.
 *   - `XPBD`: Extended Position-Based Dynamics — rápido, estável,
 *     aproximação para constraints.
 */
export type RigidBodyAlgorithm = 'LCP' | 'XPBD';

/**
 * Opções de criação do RigidBody. Apenas algorithm; restante via `values`
 * (position, mass, etc.) no constructor.
 */
export interface RigidBodyOptions {
    /** Algoritmo solver. Default: 'LCP'. */
    readonly algorithm?: RigidBodyAlgorithm;
}

/**
 * RigidBody — corpo rígido 6-DOF (3 translation + 3 rotation). Estado
 * persistente em pool buffer GPU; integrado pelo LCPFlow ou XPBDFlow
 * conforme `algorithm`.
 *
 * Layout do struct (160 bytes alinhado): pos (vec4) + vel + omega + rot
 * (quaternion) + I_inv (inverse inertia diagonal) + pos_pred + rot_pred
 * + mat_props (restitution, friction, lin/ang damping) + body_shape
 * (encode do shape primitive: sphere/box/etc.) + padding.
 */
export class RigidBody extends PhysicsBody {
    /** StructSchema do RigidBody (160 bytes alinhado, 10 vec4 fields). */
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

    /** Algoritmo solver default. */
    static readonly defaultAlgorithm: RigidBodyAlgorithm = 'LCP';

    private readonly algorithm: RigidBodyAlgorithm;

    constructor(values: Record<string, unknown> = {}, options: RigidBodyOptions = {}) {
        super();
        this.algorithm = options.algorithm ?? RigidBody.defaultAlgorithm;
        const position = (values.position ?? [0, 0, 0, 1]) as readonly number[];
        const rotation = (values.rotation ?? [0, 0, 0, 1]) as readonly number[];
        const mass = (values.mass ?? 1) as number;
        const invMass = mass > 0 ? 1 / mass : 0;
        const matProps = values.material as readonly number[] | undefined;
        // Legacy contract: pos.w = inv_mass; vel.w = sleep_flag (0=awake);
        // mat_props = (restitution, friction, lin_damping, ang_damping).
        this.data = RigidBody.schema.applyDefaults({
            pos: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0, invMass],
            vel: values.velocity ?? [0, 0, 0, 0],
            omega: values.angularVelocity ?? [0, 0, 0, 0],
            rot: rotation,
            I_inv: values.inverseInertia ?? [invMass, invMass, invMass, 0],
            pos_pred: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0, invMass],
            rot_pred: rotation,
            mat_props: matProps ?? [
                (values.restitution ?? 0.2) as number,
                (values.friction ?? 0.5) as number,
                (values.linearDamping ?? 0) as number,
                (values.angularDamping ?? 0) as number,
            ],
            body_shape: values.shape ?? [0, 1, 0, 0],
            _rb_pad: [0, 0, 0, 0],
        });
    }

    /**
     * Declara o body como member do pool storage `RigidBody`. ResourceSystem
     * coalesce todos os RigidBodies em 1 buffer GPU (eficiente para muitos
     * corpos — típico em physics scenes).
     */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'body',
                role: 'storage-rw',
                schema: RigidBody.schema,
                storage: 'pool',
            },
        ];
    }

    /**
     * Declara qual flow integra este body. O FlowRegistry usa para rotear
     * — bodyType='RigidBody' resolve para LCPFlow ou XPBDFlow conforme algorithm.
     */
    getFlowDescriptors(): readonly FlowDescriptor[] {
        return [{ algorithm: this.algorithm, bodyType: 'RigidBody' }];
    }

    /** Setter conveniente — atualiza `pos` e `pos_pred` (predicted). Marca dirty implícito. */
    setPosition(p: readonly [number, number, number, number]): void {
        this.data.pos = p;
        this.data.pos_pred = p;
    }

    /** Retorna a posição atual (read-only). */
    getPosition(): readonly number[] {
        return this.data.pos as readonly number[];
    }
}
