import type { Entity } from '../../core/Entity';
import type { RenderQueue, RenderCommand } from '../RenderQueue';
import type { ExtractionStrategy } from './ExtractionStrategy';
import { ParticleEmitter } from '../../components/particles/ParticleEmitter';
import { NULL_TRANSFORM } from '../../math/NullTransform';
import type { Transform } from '../../math/Transform';

/**
 * Estratégia de extração de emissores de partículas. (Camada 2)
 *
 * Gera um RenderCommand instanciado — sem Geometry convencional.
 * O vertex shader reconstrói o billboard de cada partícula usando
 * `@builtin(instance_index)` + storage buffer de partículas.
 *
 * Cada comando emite:
 *   vertexCount   = 6  (quad de 2 triângulos)
 *   instanceCount = emitter.aliveCount
 */
export class ParticleExtractionStrategy implements ExtractionStrategy {
    public extract(entity: Entity, queue: RenderQueue): void {
        const emitter = entity.getComponent<ParticleEmitter>('ParticleEmitter');
        if (!emitter || !emitter.currentResourceState.canRender() || emitter.aliveCount <= 0) return;

        const transform  = entity.getComponent<Transform>('Transform') ?? NULL_TRANSFORM;
        const worldMatrix = queue.acquireFloat32(16);
        worldMatrix.set(transform.worldMatrix);

        const command: RenderCommand = {
            pipelineHashId:       emitter.shaderId,
            materialLayoutId:     emitter.shaderId,
            geometryId:           '',   // sem vertex buffer — vertex shader usa storage buffer
            vertexCount:          6,    // billboard quad (2 triângulos)
            instanceCount:        emitter.aliveCount,
            materialBindGroupIds: emitter.bindGroupIds.slice(),
            worldMatrix,
            distanceToCamera:     0,
        };

        // Partículas geralmente são transparentes; usa lista opaca por padrão —
        // subclasse pode sobrescrever para transparência com z-sort.
        let group = queue.opaqueGroups.get(emitter.shaderId);
        if (!group) {
            group = [];
            queue.opaqueGroups.set(emitter.shaderId, group);
        }
        group.push(command);
    }
}
