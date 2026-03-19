import type { ResourceManager } from '../../../core/interfaces/ResourceManager';
import { PhysicsBody } from './PhysicsBody';

export interface RigidBodyOptions {
    mass?: number;
    velocity?: [number, number, number];
    isKinematic?: boolean;
}

/**
 * Corpo rígido — não deformável, simulado por integradores numéricos.
 * Estende PhysicsBody (Template Method): só precisa implementar doAllocate/doDispose.
 */
export class RigidBody extends PhysicsBody {
    public readonly type = 'RigidBody';
    public readonly physicType = 'RigidBody';

    public mass: number;
    public velocity: Float32Array;
    public isKinematic: boolean;

    public storageBufferId?: string;

    constructor(options: RigidBodyOptions = {}) {
        super();
        this.mass = options.mass ?? 1.0;
        this.velocity = new Float32Array(options.velocity ?? [0, 0, 0]);
        this.isKinematic = options.isKinematic ?? false;
    }

    protected async doAllocate(_resourceManager: ResourceManager): Promise<void> {
        // Buffer de estado (posição, velocidade, massa) para o solver
        // Implementação completa aguarda integração com o PhysicsSolver
    }

    protected doDispose(resourceManager: ResourceManager): void {
        if (this.storageBufferId !== undefined) {
            resourceManager.buffers.destroyBuffer(this.storageBufferId);
            delete this.storageBufferId;
        }
    }
}
