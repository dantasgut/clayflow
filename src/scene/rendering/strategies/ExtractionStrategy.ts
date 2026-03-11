import { Entity } from '../../core/Entity';
import { RenderExtractor } from '../RenderExtractor';
import { vec3 } from 'gl-matrix';

/**
 * Padrão Strategy: Interface base para extração de entidades da Cena (Camada 2).
 * Permite que novos componentes sejam renderizados/processados sem modificar a classe RenderExtractor.
 */
export interface ExtractionStrategy {
    extract(entity: Entity, extractor: RenderExtractor, cameraWorldPos?: vec3): void;
}
