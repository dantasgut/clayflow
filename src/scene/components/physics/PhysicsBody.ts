import type { Resource } from '../../core/Resource';
import type { Physic } from '../../core/Physic';
import type { ResourceManager } from '../../../core/interfaces/ResourceManager';
import { ResourceType } from '../../core/ResourceType';
import { ResourceState } from '../../core/ResourceState';

/**
 * Base abstrata para todos os corpos físicos (Template Method — GoF).
 *
 * Define o esqueleto do ciclo de vida de alocação/dispose na GPU e delega
 * apenas os detalhes de buffer para as subclasses via hooks protegidos.
 * Garante que o estado nunca regride (ex: Destroyed permanece Destroyed).
 *
 * @example
 * class RigidBody extends PhysicsBody {
 *     protected async doAllocate(rm: ResourceManager): Promise<void> { ... }
 *     protected doDispose(rm: ResourceManager): void { ... }
 * }
 */
export abstract class PhysicsBody implements Resource, Physic {
    private static _nextUuid: number = 0;
    public readonly uuid: string;

    public abstract readonly type: string;
    public abstract readonly physicType: string;

    public readonly layer = ResourceType.PHYSICS_MECHANIC as const;

    public state: ResourceState = ResourceState.Uninitialized;

    constructor() {
        this.uuid = `physicsbody_${++PhysicsBody._nextUuid}`;
    }

    // ------------------------------------------------------------------
    // Template Method hooks — subclasses implementam apenas estes
    // ------------------------------------------------------------------

    /** Aloca buffers GPU específicos do corpo. Chamado uma única vez. */
    protected abstract doAllocate(resourceManager: ResourceManager): Promise<void>;

    /** Libera buffers GPU específicos do corpo. */
    protected abstract doDispose(resourceManager: ResourceManager): void;

    // ------------------------------------------------------------------
    // Ciclo de vida selado (Template Method)
    // ------------------------------------------------------------------

    public async allocateResource(resourceManager: ResourceManager): Promise<void> {
        if (this.state !== ResourceState.Uninitialized) return;
        this.state = ResourceState.Loading;
        await this.doAllocate(resourceManager);
        this.state = ResourceState.Ready;
    }

    public updateResource(_resourceManager: ResourceManager): void {
        if (this.state === ResourceState.Ready) return;
        this.state = ResourceState.Ready;
    }

    public disposeResource(resourceManager: ResourceManager): void {
        if (this.state === ResourceState.Destroyed) return;
        this.doDispose(resourceManager);
        this.state = ResourceState.Destroyed;
    }
}
