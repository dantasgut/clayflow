import type { mat4 } from 'gl-matrix';
import type { LightType } from '../lights/Light';
import type { VertexLayout } from '../data/VertexLayout';

/**
 * Pílula puramente descritiva (Data-Oriented).
 * Não possui métodos ou referências ao Grafo da Cena.
 */
export interface RenderCommand {
    /** Hash único: shaderId + '|' + topology — identifica a GPURenderPipeline a usar. */
    pipelineHashId: string;
    /** shaderId do material — chave do GPUBindGroupLayout no BindGroupManager. */
    materialLayoutId: string;
    /** ID do vertex buffer no ResourceManager. */
    geometryId: string;
    /** ID do index buffer (opcional). */
    indexBufferId?: string;
    vertexCount: number;
    instanceCount: number;
    /**
     * Layout dos atributos de vértice — necessário para criar a pipeline.
     * Omitido em comandos de partículas (vertex shader usa storage buffer interno).
     */
    vertexLayout?: VertexLayout;
    /**
     * Topologia — necessária para criar a pipeline.
     * Omitido em comandos de partículas (usa 'triangle-list' implicitamente).
     */
    topology?: GPUPrimitiveTopology;

    // IDs extras de Bindings se a geometria tiver (Texturas ou Cores)
    materialBindGroupIds: string[];

    // A matriz isolada, pronta para upload
    worldMatrix: Float32Array;  // Exatos 16 floats continuos.

    /** ID da entidade de origem — usado pelo renderer para sincronização GPU→UBO. */
    entityId?: number;

    // Para z-sorting translúcido
    distanceToCamera: number;

    /** Quando true, o renderer usa vertex pulling com buffers de wireframe em @group(3). */
    useVertexPulling?: boolean;
    /** ID do storage buffer de posições wireframe (3 floats por vértice). */
    wireframePositionsBufferId?: string;
    /** ID do storage buffer de arestas wireframe (2 u32 por aresta). */
    wireframeEdgesBufferId?: string;
}

/**
 * Pílula estrutural para luzes.
 */
export interface RenderLight {
    type: LightType;
    color: Float32Array;         // vec3
    intensity: number;
    worldPosition: Float32Array; // vec3
    direction: Float32Array;     // vec3 normalizado (DirectionalLight); zero para outros tipos
    distance: number;            // Para PointLight
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
