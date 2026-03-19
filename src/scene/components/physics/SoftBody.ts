import type { ResourceManager } from '../../../core/interfaces/ResourceManager';
import type { Geometry } from '../Geometry';
import { PhysicsBody } from './PhysicsBody';

export interface SoftBodyOptions {
    mass?: number;
    stiffness?: number;
    damping?: number;
    targetGeometry?: Geometry;
}

/**
 * Corpo deformável (spring-mass / PBD) simulado via Compute Shader.
 * Estende PhysicsBody (Template Method): só precisa implementar doAllocate/doDispose.
 */
export class SoftBody extends PhysicsBody {
    public readonly type = 'SoftBody';
    public readonly physicType = 'SoftBody';

    public mass: number;
    public stiffness: number;
    public damping: number;
    public targetGeometry: Geometry | null;

    public positionsBufferId?: string;
    public velocitiesBufferId?: string;

    constructor(options: SoftBodyOptions = {}) {
        super();
        this.mass = options.mass ?? 1.0;
        this.stiffness = options.stiffness ?? 0.5;
        this.damping = options.damping ?? 0.1;
        this.targetGeometry = options.targetGeometry ?? null;
    }

    protected async doAllocate(resourceManager: ResourceManager): Promise<void> {
        if (!this.targetGeometry?.rawVertices) return;

        const rawPos = this.targetGeometry.rawVertices;

        const posBuffer = resourceManager.buffers.createStorageBuffer(`sb_pos_${this.uuid}`, rawPos.byteLength);
        this.positionsBufferId = posBuffer.id;
        await resourceManager.buffers.uploadStagedAsync(posBuffer.id, rawPos);

        const velBuffer = resourceManager.buffers.createStorageBuffer(`sb_vel_${this.uuid}`, rawPos.byteLength);
        this.velocitiesBufferId = velBuffer.id;
        await resourceManager.buffers.uploadStagedAsync(velBuffer.id, new Float32Array(rawPos.length));
    }

    protected doDispose(resourceManager: ResourceManager): void {
        if (this.positionsBufferId !== undefined) {
            resourceManager.buffers.destroyBuffer(this.positionsBufferId);
            delete this.positionsBufferId;
        }
        if (this.velocitiesBufferId !== undefined) {
            resourceManager.buffers.destroyBuffer(this.velocitiesBufferId);
            delete this.velocitiesBufferId;
        }
    }
}
