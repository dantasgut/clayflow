import type { ResourceState }    from '../ResourceState';
import type { PhysicsDirtyFlag } from './PhysicsDirtyFlag';

/**
 * Contrato de ciclo de vida para componentes físicos.
 * Análogo a Resource — adiciona registro no mundo físico.
 * PhysicsBody implementa esta interface.
 */
export interface PhysicsResource {
    readonly physicType: string;
    state: ResourceState;

    /** Bitmask de PhysicsDirtyFlag — indica quais aspectos físicos mudaram. */
    dirtyFlags: number;

    /** Registra este componente no mundo físico. */
    registerInWorld?(world: unknown): void;
    /** Atualiza aspectos dirty no mundo físico. */
    updateInWorld?(world: unknown): void;
    /** Remove este componente do mundo físico. */
    unregisterFromWorld?(world: unknown): void;
}

