import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { EmitterShape } from './shapes/EmitterShape';

/**
 * Opções comuns a todos os particle emitters. Subclasses concretas
 * (ComputeParticleEmitter, ScriptedParticleEmitter) podem adicionar opções
 * específicas via cast em `data`.
 */
export interface ParticleEmitterOptions {
    /** Capacidade máxima do pool de partículas. Default: 1024. */
    readonly maxParticles?: number;
    /** Taxa de emissão (partículas por segundo). Default: 100. */
    readonly rate?: number;
    /** Lifetime de cada partícula em segundos antes de morrer. Default: 2.0. */
    readonly lifetime?: number;
    /** Shape de emissão (sphere, cone, box, point). Default: ponto na origem. */
    readonly shape?: EmitterShape;
}

/**
 * ParticleEmitter é a base de emissores de partículas. Subclasses concretas:
 *   - `ComputeParticleEmitter`: emissão e simulação inteiramente em compute shaders.
 *   - `ScriptedParticleEmitter`: emissão CPU-driven (callback custom por partícula).
 */
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

    /** Subclasses declaram pool de partículas + buffers auxiliares (life, velocity). */
    abstract getDescriptors(): readonly GPUDescriptor[];

    /** Sem pipelines próprios — flow consumidor cria. */
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
