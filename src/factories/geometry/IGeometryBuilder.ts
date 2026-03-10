import { Geometry } from '../../scene/components/Geometry';
import type { IResourceManager } from '../../core/interfaces/IResourceManager';

/**
 * Interface OCP para geradores de geometria genérica (Camada 3).
 * Qualquer formato matemático complexo pode herdar isso e injetar na Camada 2
 * sem modificar a arquitetura principal.
 */
export interface IGeometryBuilder {
    /**
     * Calcula os vértices na CPU e registra na Memória da GPU (Camada 1),
     * retornando o Componente ECS "limpo" (Camada 2).
     */
    build(resourceManager: IResourceManager): Geometry;
}
