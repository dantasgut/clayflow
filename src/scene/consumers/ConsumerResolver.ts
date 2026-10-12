import type {
    AnyBufferSpec,
    SamplerSpec,
    StagingBufferSpec,
    TextureViewSpec,
} from '../../core/contracts/index';
import type { ResourceDirectory } from '../contracts/ResourceDirectory';
import type { World } from '../world/World';

/** Buffer ligável num bind group (qualquer papel exceto staging). */
export type BindableBufferSpec = Exclude<AnyBufferSpec, StagingBufferSpec>;

/**
 * Fonte de um binding: o objeto de GPU que ocupa um `@binding` do shader. O índice do binding vem do WGSL (inferido
 * pela C2), nunca da fonte. Uma fonte é identificada pelos specs que carrega: quando o objeto é recriado (pool que
 * cresce, textura do canvas redimensionada), a fonte muda e a C2 recria os bind groups que a usam.
 */
export type ResolvedSource =
    | {
          readonly kind: 'buffer';
          readonly buffer: BindableBufferSpec;
          /** Início da região ligada (bytes). Default 0. */
          readonly offset?: number;
          /** Bytes visíveis pelo shader. Default: o buffer inteiro; obrigatório com `dynamic`. */
          readonly size?: number;
          /**
           * Ligado com offset dinâmico: o desenho/despacho escolhe o registro por `setBindGroup(g, bg, [k × stride])`
           * (ex.: pool uniforme de materiais, uniforms por passo).
           */
          readonly dynamic?: { readonly stride: number };
          /** Visibilidade explícita (descritor do Resource); vence a inferida (FR-013). */
          readonly visibility?: number;
      }
    | {
          readonly kind: 'textureView';
          readonly view: TextureViewSpec;
          /** Formato da textura, para escolher `unfilterable-float` em formatos não filtráveis. */
          readonly format?: GPUTextureFormat;
          readonly visibility?: number;
      }
    | { readonly kind: 'sampler'; readonly sampler: SamplerSpec; readonly visibility?: number };

/** O que um resolver consulta: o World da cena e o que a C2 alocou. */
export interface ResolveContext {
    readonly world: World;
    readonly resources: ResourceDirectory;
}

/**
 * Estratégia que traduz um nome de `consumes` numa fonte de binding. `name` é o nome em `consumes` (nome do schema
 * ou chave do pool); `typeName` é o struct WGSL que a fonte preenche — um binding do shader cujo tipo (ou elemento de
 * `array<…>`) é `typeName` recebe a fonte deste resolver quando `name` está em `consumes`.
 */
export interface ConsumerResolver {
    readonly name: string;
    readonly typeName: string;
    /** Fonte atual, ou `undefined` se o dado ainda não existe na cena. */
    resolve(ctx: ResolveContext): ResolvedSource | undefined;
}
