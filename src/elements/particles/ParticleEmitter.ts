import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { EmitterShape } from './shapes/EmitterShape';

export interface ParticleEmitterOptions {
    readonly maxParticles?: number;
    readonly rate?: number;
    readonly lifetime?: number;
    readonly shape?: EmitterShape;
}

export abstract class ParticleEmitter extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(options: ParticleEmitterOptions = {}) {
        super();
        this.data = {
            maxParticles: options.maxParticles ?? 1024,
            rate: options.rate ?? 100,
            lifetime: options.lifetime ?? 2.0,
            shape: options.shape,
        };
    }

    abstract getDescriptors(): readonly GPUDescriptor[];

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
