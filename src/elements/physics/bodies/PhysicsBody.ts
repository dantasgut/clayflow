import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';

/**
 * Base abstrata dos physics bodies. Data class pura: armazena estado em
 * `data` governado pelo schema escolhido na instanciação. O algoritmo
 * integrador vive no Flow (importa o WGSL kernel); o body apenas declara
 * descriptors de buffer/pool. Roteamento body→flow é por `schema.name`
 * (pool key) que casa com `Flow.bodyType` registrado no FlowRegistry.
 */
export abstract class PhysicsBody extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    abstract getDescriptors(): readonly GPUDescriptor[];

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
