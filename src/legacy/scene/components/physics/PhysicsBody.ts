import type { Resource } from '../../core/Resource';
import type { Physic } from '../../core/Physic';
import type { ResourceManager } from '../../../core/interfaces/ResourceManager';
import type { PhysicsResource } from '../../core/physics/PhysicsResource';
import { ResourceType } from '../../core/ResourceType';
import { ResourceState } from '../../core/ResourceState';
import { PhysicsDirtyFlag }          from '../../core/physics/PhysicsDirtyFlag';
import { PhysicsBodyState }          from '../../core/physics/PhysicsBodyState';
import type { BodyStateHandler }     from '../../core/physics/BodyStateHandler';
import { BodyStateHandlerRegistry }  from '../../core/physics/BodyStateHandlerRegistry';

/**
 * Base abstrata para todos os corpos físicos.
 * Combina dois padrões:
 *
 * Template Method — ciclo de vida GPU (allocate/dispose) selado na base.
 * Property Bag — propriedades físicas abertas via get/set tipados.
 *
 * O Property Bag permite que o mesmo corpo represente um RigidBody
 * convencional (mass, velocity), uma partícula carregada (charge, spin),
 * ou qualquer entidade de um espaço físico abstrato, sem subclasses
 * específicas para cada configuração.
 *
 * @example
 * // Corpo genérico para simulação eletromagnética
 * const particle = new Particle();  // subclasse mínima
 * particle.set('mass', 9.11e-31)   // massa do elétron
 *         .set('charge', -1.6e-19)  // carga
 *         .set('velocity', vec3.create());
 *
 * // Força de Lorentz lê as propriedades sem saber o tipo do corpo
 * const q = body.get<number>('charge') ?? 0;
 */
export abstract class PhysicsBody implements Resource, Physic, PhysicsResource {
    private static nextUuid: number = 0;
    public readonly uuid: string;

    public abstract readonly type: string;
    public abstract readonly physicType: string;

    public readonly layer = ResourceType.PHYSICS_MECHANIC as const;

    public state: ResourceState = ResourceState.Uninitialized;

    /** Estado de simulação do corpo no mundo físico. */
    public bodyState: PhysicsBodyState = PhysicsBodyState.Inactive;

    /** Bitmask de PhysicsDirtyFlag — indica quais aspectos físicos mudaram. */
    public dirtyFlags: number = PhysicsDirtyFlag.None;

    // ------------------------------------------------------------------
    // State pattern — handler encapsula comportamento por estado
    // ------------------------------------------------------------------

    /** Handler do estado atual — consulta de capacidades pelos stages. */
    public get currentState(): BodyStateHandler {
        return BodyStateHandlerRegistry.get(this.bodyState);
    }

    /**
     * Transita para um novo estado de simulação.
     * Em modo DEV emite warning se a transição não for válida.
     */
    public transitionTo(next: PhysicsBodyState): void {
        if (process.env.NODE_ENV !== 'production') {
            const valid = this.currentState.validTransitions();
            if (!valid.includes(next)) {
                console.warn(
                    `[PhysicsBody] Transição inválida: ` +
                    `${PhysicsBodyState[this.bodyState]} → ${PhysicsBodyState[next]} ` +
                    `(uuid=${this.uuid})`,
                );
            }
        }
        this.bodyState = next;
    }

    /**
     * Atalho de compatibilidade — equivale a `bodyState === Sleeping`.
     * Substitui `body.get<boolean>('isSleeping')` nos stages migrados.
     */
    public get isSleeping(): boolean {
        return this.bodyState === PhysicsBodyState.Sleeping;
    }

    /** Propriedades físicas abertas — não há campos fixos na base. */
    private readonly props = new Map<string, unknown>();

    constructor() {
        this.uuid = `physicsbody_${++PhysicsBody.nextUuid}`;
    }

    // ------------------------------------------------------------------
    // Property Bag — aberto para qualquer domínio físico
    // ------------------------------------------------------------------

    public set<T>(key: string, value: T): this {
        this.props.set(key, value);
        return this;
    }

    public get<T>(key: string): T | undefined {
        return this.props.get(key) as T | undefined;
    }

    public has(key: string): boolean {
        return this.props.has(key);
    }

    // ------------------------------------------------------------------
    // PhysicsResource — stubs; subclasses sobrescrevem se necessário
    // ------------------------------------------------------------------

    public registerInWorld(_world: unknown): void {}
    public updateInWorld(_world: unknown): void {}
    public unregisterFromWorld(_world: unknown): void {}

    // ------------------------------------------------------------------
    // Template Method hooks — subclasses implementam apenas estes
    // ------------------------------------------------------------------

    protected abstract doAllocate(resourceManager: ResourceManager): Promise<void>;
    protected abstract doDispose(resourceManager: ResourceManager): void;

    // ------------------------------------------------------------------
    // Ciclo de vida selado
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
