import type { ResourceManager }   from '../../core/interfaces/ResourceManager';
import { PhysicsBody }            from '../../scene/components/physics/PhysicsBody';
import { PhysicsDirtyFlag }       from '../../scene/core/physics/PhysicsDirtyFlag';
import { ResourceState }          from '../../scene/core/ResourceState';
import type { RigidBodyMaterial } from './RigidBodyMaterial';
import type { RigidBodySimState } from './RigidBodySimState';
import { vec3, quat }             from 'gl-matrix';

export interface RigidBodyOptions {
    mass?:           number;
    velocity?:       [number, number, number];
    isKinematic?:    boolean;
    restitution?:    number;
    friction?:       number;
    linearDamping?:  number;
    angularDamping?: number;
}

/**
 * Corpo rígido GPU-only.
 *
 * `material`  — propriedades de material (massa, atrito, etc.) definidas na construção.
 * `simState`  — estado de simulação (posição, velocidade, etc.) inicializado em registerEntity.
 * `gpuRbIndex`— índice no buffer global `gpu_rb_bodies`, atribuído pelo `PhysicsResourceLoader`.
 */
export class RigidBody extends PhysicsBody {
    public readonly type        = 'RigidBody';
    public readonly physicType  = 'RigidBody';

    public readonly acceptedAlgorithms: readonly string[] = ['XPBD', 'LCP'];

    /** Propriedades de material — estáticas após construção. */
    public readonly material: RigidBodyMaterial;

    /**
     * Estado de simulação — inicializado por GpuPhysicsOrchestrator.registerEntity()
     * a partir do Transform e do tensor de inércia do collider.
     */
    public simState?: RigidBodySimState;

    /** Índice do corpo no buffer global `gpu_rb_bodies`. Atribuído pelo alocador. */
    public gpuRbIndex?: number;

    /** Sinaliza se o corpo deve ser tratado como kinematic na inicialização. */
    public readonly isKinematic: boolean;

    constructor(options: RigidBodyOptions = {}) {
        super();
        this.material = {
            mass:           options.mass          ?? 1.0,
            restitution:    options.restitution   ?? 0.0,
            friction:       options.friction      ?? 0.3,
            linearDamping:  options.linearDamping  ?? 0.05,
            angularDamping: options.angularDamping ?? 0.1,
        };
        this.isKinematic = options.isKinematic ?? false;
        // Velocity inicial armazenada temporariamente para uso em initSimState()
        this._initialVelocity = options.velocity
            ? vec3.fromValues(...options.velocity)
            : vec3.create();
    }

    private readonly _initialVelocity: import('gl-matrix').vec3;

    /**
     * Inicializa simState a partir da posição/rotação do Transform.
     * Chamado por GpuPhysicsOrchestrator.registerEntity().
     */
    public initSimState(
        position: ArrayLike<number>,
        rotation: ArrayLike<number>,
    ): void {
        this.simState = {
            position:        vec3.fromValues(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0),
            velocity:        vec3.clone(this._initialVelocity),
            angularVelocity: vec3.create(),
            rotation:        quat.fromValues(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0, rotation[3] ?? 1),
            inertiaTensor:   vec3.fromValues(1, 1, 1),
        };
    }

    // ── Acessores de compatibilidade (delegam ao material/simState) ────────────

    public get mass(): number {
        return this.material.mass;
    }

    public set mass(v: number) {
        (this.material as { mass: number }).mass = v;
        this.dirtyFlags |= PhysicsDirtyFlag.Mass;
        if (this.state === ResourceState.Ready) this.state = ResourceState.Dirty;
    }

    public get velocity(): import('gl-matrix').vec3 | undefined {
        return this.simState?.velocity;
    }

    protected async doAllocate(_resourceManager: ResourceManager): Promise<void> {
        // Buffer global é alocado pelo PhysicsResourceLoader (sistema ECS) — no-op aqui.
    }

    protected doDispose(_resourceManager: ResourceManager): void {
        delete this.simState;
        delete this.gpuRbIndex;
    }
}
