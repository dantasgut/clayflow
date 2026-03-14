import { Entity } from '../../core/Entity';
import type { Resource } from '../../core/Resource';
import type { Physic } from '../../core/Physic';
import { ResourceType } from '../../core/ResourceType';
import { ResourceState } from '../../core/ResourceState';
import type { ResourceManager } from '../../../core/interfaces/ResourceManager';

export interface RigidBodyOptions {
    mass?: number;
    velocity?: [number, number, number];
    isKinematic?: boolean; // Se true, o objeto não é afetado por forças, apenas move via Transform/Script
}

/**
 * Corpo Lógico/Físico (Camada 3) que atua como nó mecânico na Cena.
 * Não é um Componente Visual (Geometria), mas sim uma Entidade autônoma autossuficiente (herdando de Entity).
 */
export class RigidBody extends Entity implements Resource, Physic {
    public readonly type: string = 'RigidBody';
    public readonly layer = ResourceType.PHYSICS_MECHANIC;
    public readonly physicType = 'RigidBody';

    public state: ResourceState = ResourceState.Uninitialized;

    public mass: number;
    public velocity: Float32Array;
    public isKinematic: boolean;

    public storageBufferId?: string;

    constructor(options: RigidBodyOptions = {}) {
        super();
        this.mass = options.mass !== undefined ? options.mass : 1.0;
        this.velocity = new Float32Array(options.velocity || [0.0, 0.0, 0.0]);
        this.isKinematic = options.isKinematic || false;
    }

    public allocateResource(resourceManager: ResourceManager): void {
        this.state = ResourceState.Loading;
        // Buffer de física alocado globalmente ou em isolamento conforme Compute Shader da 엔진
        this.state = ResourceState.Ready;
    }

    public updateResource(resourceManager: ResourceManager): void {
        this.state = ResourceState.Ready;
    }

    public disposeResource(resourceManager: ResourceManager): void {
        if (this.storageBufferId) {
            resourceManager.buffers.destroyBuffer(this.storageBufferId);
        }
        this.state = ResourceState.Disposed;
    }
}
