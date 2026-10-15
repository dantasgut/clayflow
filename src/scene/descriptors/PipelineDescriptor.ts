import type {
    ColorTargetSpec,
    DepthSpec,
    MultisampleSpec,
    VertexBufferLayout,
} from '../../core/contracts/index';
import type { WgslModule } from '../shaders/WgslModule';
import type { PointImplementation } from '../shaders/WgslPoint';

/** Entrada de `consumes`: o nome do resolver, ou o nome e o struct WGSL com que o shader lê o dado. */
export type ConsumesEntry =
    | string
    | {
          /** Nome do resolver (nome do schema ou chave do pool). */
          readonly name: string;
          /** Tipo WGSL que a fonte preenche no shader, quando difere do do resolver. */
          readonly as: string;
      };

/** Nome do resolver de uma entrada de `consumes`. */
export function consumesName(entry: ConsumesEntry): string {
    return typeof entry === 'string' ? entry : entry.name;
}

/**
 * Tipo de pipeline declarado por um Resource. `compute` para kernels GPGPU,
 * `render` para vertex+fragment passes.
 */
export type PipelineDescriptorRole = 'compute' | 'render';

/**
 * Pipeline declarado por um Flow (ou pelo material que um Flow desenha). Diferente de `ComputePipelineSpec` /
 * `RenderPipelineSpec` (Camada 1, materializáveis), é declarativo: a Camada 2 monta o WGSL (`composeWgsl`), infere
 * grupos, bindings e visibilidades (`LayoutInferencer.infer`), resolve cada binding — privado do Flow pelo nome da
 * variável, ou pelo tipo do struct entre os nomes de `consumes` — e cria layouts, pipeline e bind groups.
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
    /**
     * Nomes (de schema ou chave de pool) dos dados que o pipeline lê da cena, resolvidos pelo
     * `ConsumerResolverRegistry`: um binding cujo tipo WGSL é o `typeName` do resolver recebe a fonte dele
     * (ex.: `consumes: ['Camera', 'WorldTransform']`). A forma `{ name, as }` declara que o dado de `name` é lido
     * pelo shader como o struct `as` — layouts iguais com outro nome (ex.: o pool `WireframeMaterial` lido como
     * `StandardMaterial` pelo `forward.wgsl`).
     */
    readonly consumes: readonly ConsumesEntry[];
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
    /** Vertex buffer layouts (apenas render). Default: derivado de consumes. */
    readonly vertexBuffers?: readonly VertexBufferLayout[];
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
