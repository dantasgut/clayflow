import type { Entity } from '../../core/Entity';
import type { RenderQueue } from '../RenderQueue';
import type { vec3 } from 'gl-matrix';

/**
 * Padrão Strategy: Interface base para extração de entidades da Cena (Camada 2).
 * Permite que novos componentes sejam renderizados/processados sem modificar o RenderExtractor.
 */
export interface ExtractionStrategy {
    extract(entity: Entity, queue: RenderQueue, cameraWorldPos?: vec3): void;
}
