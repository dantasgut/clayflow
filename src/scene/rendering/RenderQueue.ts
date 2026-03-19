import type { mat4 } from 'gl-matrix';
import type { LightType } from '../lights/Light';

/**
 * Pílula puramente descritiva (Data-Oriented).
 * Não possui métodos ou referências ao Grafo da Cena.
 */
export interface RenderCommand {
    pipelineHashId: string;     // Qual Shader usar (OpaqueLine, TransparentFill)
    geometryId: string;         // Qual ID apontar pro ResourceManager
    vertexCount: number;
    instanceCount: number;
    
    // IDs extras de Bindings se a geometria tiver (Texturas ou Cores)
    materialBindGroupIds: string[]; 

    // A matriz isolada, pronta para upload
    worldMatrix: Float32Array;  // Exatos 16 floats continuos.
    
    // Para z-sorting translúcido
    distanceToCamera: number;
}

/**
 * Pílula estrutural para luzes.
 */
export interface RenderLight {
    type: LightType;
    color: Float32Array;      // vec3
    intensity: number;
    worldPosition: Float32Array; // vec3
    distance: number;         // Para PointLight
    decay: number;
}

/**
 * Interface Oficial que a Camada 3 consumirá.
 * Arrays Lineares 100% blindados e livres de orientação a objetos gordos.
 */
export interface RenderQueue {
    // PipelineHashID -> Lista de Comandos Lineares
    readonly opaqueGroups: Map<string, RenderCommand[]>;
    
    // Lista ordenada back-to-front
    readonly transparentList: RenderCommand[];

    // Lista de luzes extraídas no frame
    readonly lights: RenderLight[];
    
    clear(): void;

    /** Obtém um Float32Array do pool interno — evita alocações GC por frame. */
    acquireFloat32(size: number): Float32Array;
}
