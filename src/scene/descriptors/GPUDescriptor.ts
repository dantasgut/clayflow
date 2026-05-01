import type { SamplerShape } from './SamplerShape';
import type { Schema } from './Schema';
import type { TextureShape } from './TextureShape';

/**
 * Papel de um GPUDescriptor — controla o tipo de buffer/textura criado
 * e como ele é bound no shader.
 *   - `uniform` / `storage-rw` / `storage-ro`: buffers tipados.
 *   - `vertex` / `index` / `indirect`: buffers de geometria/indireção.
 *   - `staging`: buffer mappable para readback CPU.
 *   - `texture` / `storage-texture` / `sampler`: recursos de texturização.
 */
export type GPUDescriptorRole =
    | 'uniform'
    | 'storage-rw'
    | 'storage-ro'
    | 'vertex'
    | 'index'
    | 'indirect'
    | 'staging'
    | 'texture'
    | 'storage-texture'
    | 'sampler';

/**
 * GPUDescriptor declara um binding GPU que um Resource expõe ao
 * ResourceSystem. Comparado com `ResourceSpec` (Camada 1, materializável),
 * o GPUDescriptor é declarativo: schema + role + storage strategy. O
 * ResourceSystem materializa via `core.create` no momento certo.
 *
 * Exemplo: Camera declara um GPUDescriptor `uniform` com `Camera.schema`,
 * e o ResourceSystem aloca um UniformBuffer + cria bindgroup automaticamente.
 */
export interface GPUDescriptor {
    /** Identificador local do descriptor dentro do Resource (e.g. 'view', 'mass'). */
    readonly id: string;
    readonly role: GPUDescriptorRole;
    /**
     * Schema do field (StructSchema ou TensorSchema). Define stride,
     * alinhamento e WGSL type para gerar struct definition no shader.
     * Obrigatório para roles tipados (uniform/storage/vertex).
     */
    readonly schema?: Schema;
    /**
     * Número de elementos em buffers de array (e.g. `count: 1024` para
     * pool de partículas). Default: 1 (single-element).
     */
    readonly count?: number;
    /**
     * Estratégia de alocação:
     *   - `individual` (default): 1 buffer por Resource.
     *   - `pool`: coalesce N members do mesmo schema em 1 buffer compartilhado
     *     (eficiente para muitos RigidBodies, partículas, etc.).
     */
    readonly storage?: 'individual' | 'pool';
    /** Forma da textura (dimensões, format, usage) — apenas para role 'texture'. */
    readonly textureShape?: TextureShape;
    /** Configuração do sampler — apenas para role 'sampler'. */
    readonly samplerShape?: SamplerShape;
    /** Slot do binding no bindgroup (`@binding(N)`). Default: derivado por LayoutInferencer. */
    readonly binding?: number;
    /** Slot do bindgroup (`@group(N)`). Default: 0. */
    readonly group?: number;
    /** Bitmask `GPUShaderStage.*` indicando onde o binding é visível. */
    readonly visibility?: number;
}
