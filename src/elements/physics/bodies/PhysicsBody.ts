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
 * `TData` tipa o `data` (ver `Entity`).
 */
export abstract class PhysicsBody<TData extends object = Record<string, unknown>>
    extends Entity<TData>
    implements Resource
{
    state: ResourceState = ResourceState.Uninitialized;

    abstract getDescriptors(): readonly GPUDescriptor[];

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
