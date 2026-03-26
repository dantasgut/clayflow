import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { PhysicsBody } from '../../scene/components/physics/PhysicsBody';
import { PhysicsDirtyFlag } from '../../scene/core/physics/PhysicsDirtyFlag';
import { ResourceState } from '../../scene/core/ResourceState';
import { vec3 } from 'gl-matrix';

export interface RigidBodyOptions {
    mass?: number;
    velocity?: [number, number, number];
    isKinematic?: boolean;
    restitution?: number;        // elasticidade deste corpo (default usa o global do mundo)
    friction?: number;           // coeficiente de atrito de Coulomb (default usa o global do mundo)
    linearDamping?: number;      // taxa de amortecimento linear por segundo (default 0.05)
    angularDamping?: number;     // taxa de amortecimento angular por segundo (default 0.1)
}

/**
 * Convenência pré-configurada do PhysicsBody para dinâmica rígida.
 * Define as propriedades padrão via Property Bag — qualquer solver
 * pode ler 'mass', 'velocity', 'isKinematic' sem acoplamento a esta classe.
 */
export class RigidBody extends PhysicsBody {
    public readonly type = 'RigidBody';
    public readonly physicType = 'RigidBody';

    public storageBufferId?: string;

    constructor(options: RigidBodyOptions = {}) {
        super();
        this.set('mass',        options.mass ?? 1.0);
        this.set('velocity',    vec3.fromValues(...(options.velocity ?? [0, 0, 0])));
        this.set('isKinematic', options.isKinematic ?? false);
        if (options.restitution !== undefined) this.set('restitution', options.restitution);
        if (options.friction    !== undefined) this.set('friction',    options.friction);
        this.set('linearDamping',   options.linearDamping  ?? 0.05);
        this.set('angularDamping',  options.angularDamping ?? 0.1);
        this.set('angularVelocity', vec3.fromValues(0, 0, 0));
        // inertiaTensor will be seeded by PhysicsWorld.registerEntity based on collider shape
        this.set('inertiaTensor',   vec3.fromValues(1, 1, 1));
        // rotation NÃO é inicializado aqui — registerEntity copia de Transform.rotation
    }

    // Acessores tipados para DX — delegam ao Property Bag
    public get mass(): number         { return this.get<number>('mass') ?? 1.0; }
    public set mass(v: number) {
        this.set('mass', v);
        this.dirtyFlags |= PhysicsDirtyFlag.Mass;
        if (this.state === ResourceState.Ready) this.state = ResourceState.Dirty;
    }

    public get velocity(): vec3       { return this.get<vec3>('velocity')!; }
    public get isKinematic(): boolean { return this.get<boolean>('isKinematic') ?? false; }

    protected async doAllocate(_resourceManager: ResourceManager): Promise<void> {
        // Buffer de estado GPU — aguarda integração com PhysicsSolver GPU
    }

    protected doDispose(resourceManager: ResourceManager): void {
        if (this.storageBufferId !== undefined) {
            resourceManager.buffers.destroyBuffer(this.storageBufferId);
            delete this.storageBufferId;
        }
    }
}
