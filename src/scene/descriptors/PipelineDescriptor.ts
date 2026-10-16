import type {
    ColorTargetSpec,
    DepthSpec,
    MultisampleSpec,
    VertexBufferLayout,
} from '../../core/contracts/index';
import type { WgslModule } from '../shaders/WgslModule';
import type { WgslResource } from '../shaders/WgslResource';
import type { PointImplementation } from '../shaders/WgslPoint';

/**
 * Tipo de pipeline declarado por um Resource. `compute` para kernels GPGPU,
 * `render` para vertex+fragment passes.
 */
export type PipelineDescriptorRole = 'compute' | 'render';

/**
 * Pipeline declarado por um Flow (ou pelo material que um Flow desenha). Diferente de `ComputePipelineSpec` /
 * `RenderPipelineSpec` (Camada 1, materializáveis), é declarativo: a Camada 2 monta o WGSL (`composeWgsl`, que emite
 * as ligações dos recursos declarados pelos módulos — spec 031), infere as visibilidades, resolve a fonte de cada
 * recurso pelo fornecedor declarado (pool, resolver da cena, slot do Flow, ponto de cena, ou privado do Flow) e cria
 * layouts, pipeline e bind groups.
 *
 * Compute: uma entrada (`entryPoints[0]`). Render: a entrada `@vertex` e, opcional, a `@fragment`.
 */
export interface PipelineDescriptor {
    /** Identificador único do pipeline (e.g. 'pipeline_standard', 'pipeline_lcp_predict'). */
    readonly id: string;
    /** Tipo do pipeline ('compute' para GPGPU, 'render' para vertex+fragment). */
    readonly role: PipelineDescriptorRole;
    /** Módulo WGSL de entrada (montado por `composeWgsl`) que define todos os entry points listados. */
    readonly shader: WgslModule;
    /** Nomes das funções `@compute`/`@vertex`/`@fragment` no source. */
    readonly entryPoints: readonly string[];
    /** Topologia da primitive (apenas render pipelines). Default: triangle-list. */
    readonly topology?: GPUPrimitiveTopology;
    /** Cull mode (apenas render). Default: 'none'. */
    readonly cullMode?: GPUCullMode;
    /** Front-face winding (apenas render). Default: 'ccw'. */
    readonly frontFace?: GPUFrontFace;
    /** Depth-stencil config (apenas render). Default: nenhum depth attachment. */
    readonly depth?: DepthSpec;
    /** Multisample config (apenas render). Default: count=1. */
    readonly multisample?: MultisampleSpec;
    /** Color targets (apenas render). Default: 1 target com canvas format. */
    readonly colorTargets?: readonly ColorTargetSpec[];
    /** Vertex buffer layouts (apenas render). Default: nenhum (vértices lidos como storage). */
    readonly vertexBuffers?: readonly VertexBufferLayout[];
    /**
     * Pool de cada recurso neste pipeline, quando difere do fornecedor declarado (spec 031): ex. um material com pool
     * próprio que usa o shader do forward liga o seu pool no recurso `materials` do shader. Substitui `{ name, as }`.
     */
    readonly pools?: ReadonlyMap<WgslResource, string>;
    /** Constantes `override` do shader (spec 031): variantes sem remendo de texto. */
    readonly constants?: Readonly<Record<string, number>>;
    /**
     * Família de desenho (spec 031): como as entidades com este pipeline são desenhadas (`surface`, `points`, `wire`,
     * `particle-sprite`, `fluid-surface`) — os estágios selecionam por ela, não pelo tipo de outros Resources.
     */
    readonly family?: string;
    /** Quando true, usa `core.createAsync` (compilação não-bloqueante). */
    readonly preferAsync?: boolean;
    /**
     * Shader com código de fora (funções de ponto de extensão, spec 009): o compilador confere o fonte antes de criar
     * o módulo (`core.shaderMessages`) e o pipeline compila em segundo plano. Rejeitado, o pipeline não fica pronto,
     * o Flow recebe `pipelineRejected` e a cena anuncia `extensionRejected` — nenhum erro chega ao device.
     */
    readonly verify?: boolean;
    /** Funções de ponto compostas no shader (para traduzir a linha do erro e anunciar a rejeição de cada uma). */
    readonly extensions?: readonly PointImplementation[];
    /**
     * Ajustes explícitos por variável WGSL; vencem a inferência (FR-013). Ex.: `{ params: { visibility:
     * GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT } }`.
     */
    readonly bindings?: Readonly<
        Record<
            string,
            {
                /** Estágios que veem o binding (`GPUShaderStage`), no lugar dos inferidos. */
                readonly visibility?: number;
            }
        >
    >;
}
