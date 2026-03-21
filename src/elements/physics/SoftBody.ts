import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import type { Geometry } from '../../scene/components/Geometry';
import { PhysicsBody } from '../../scene/components/physics/PhysicsBody';

export interface SoftBodyOptions {
    mass?: number;
    stiffness?: number;
    damping?: number;
    targetGeometry?: Geometry;
}

/**
 * Convenência pré-configurada do PhysicsBody para dinâmica deformável.
 */
export class SoftBody extends PhysicsBody {
    public readonly type = 'SoftBody';
    public readonly physicType = 'SoftBody';

    constructor(options: SoftBodyOptions = {}) {
        super();
        this.set('mass',           options.mass ?? 1.0);
        this.set('stiffness',      options.stiffness ?? 0.5);
        this.set('damping',        options.damping ?? 0.1);
        this.set('targetGeometry', options.targetGeometry ?? null);
    }

    public get stiffness(): number { return this.get<number>('stiffness') ?? 0.5; }
    public get damping(): number   { return this.get<number>('damping') ?? 0.1; }

    protected async doAllocate(resourceManager: ResourceManager): Promise<void> {
        const geometry = this.get<Geometry>('targetGeometry');
        if (!geometry?.rawVertices) return;

        const rawPos = geometry.rawVertices;
        const posBuffer = resourceManager.buffers.createStorageBuffer(`sb_pos_${this.uuid}`, rawPos.byteLength);
        this.set('positionsBufferId', posBuffer.id);
        await resourceManager.buffers.uploadStagedAsync(posBuffer.id, rawPos);

        const velBuffer = resourceManager.buffers.createStorageBuffer(`sb_vel_${this.uuid}`, rawPos.byteLength);
        this.set('velocitiesBufferId', velBuffer.id);
        await resourceManager.buffers.uploadStagedAsync(velBuffer.id, new Float32Array(rawPos.length));
    }

    protected doDispose(resourceManager: ResourceManager): void {
        const posId = this.get<string>('positionsBufferId');
        const velId = this.get<string>('velocitiesBufferId');
        if (posId) resourceManager.buffers.destroyBuffer(posId);
        if (velId) resourceManager.buffers.destroyBuffer(velId);
    }
}
