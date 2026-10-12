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
          /** Fonte de buffer. */
          readonly kind: 'buffer';
          /** O buffer ligado. */
          readonly buffer: BindableBufferSpec;
          /** Início da região ligada (bytes). Default 0. */
          readonly offset?: number;
          /** Bytes visíveis pelo shader. Default: o buffer inteiro; obrigatório com `dynamic`. */
          readonly size?: number;
          /**
           * Ligado com offset dinâmico: o desenho/despacho escolhe o registro por `setBindGroup(g, bg, [k × stride])`
           * (ex.: pool uniforme de materiais, uniforms por passo).
           */
          readonly dynamic?: {
              /** Distância em bytes entre registros (alinhada a `minUniformBufferOffsetAlignment`). */
              readonly stride: number;
          };
          /** Visibilidade explícita (descritor do Resource); vence a inferida (FR-013). */
          readonly visibility?: number;
      }
    | {
          /** Fonte de textura. */
          readonly kind: 'textureView';
          /** A view ligada. */
          readonly view: TextureViewSpec;
          /** Formato da textura, para escolher `unfilterable-float` em formatos não filtráveis. */
          readonly format?: GPUTextureFormat;
          /** Visibilidade explícita; vence a inferida. */
          readonly visibility?: number;
      }
    | {
          /** Fonte de sampler. */
          readonly kind: 'sampler';
          /** O sampler ligado. */
          readonly sampler: SamplerSpec;
          /** Visibilidade explícita; vence a inferida. */
          readonly visibility?: number;
      };

/** O que um resolver consulta: o World da cena e o que a C2 alocou. */
export interface ResolveContext {
    /** World da cena. */
    readonly world: World;
    /** Objetos de GPU alocados pela C2 (buffers, texturas, pools). */
    readonly resources: ResourceDirectory;
}

/**
 * Estratégia que traduz um nome de `consumes` numa fonte de binding. `name` é o nome em `consumes` (nome do schema
 * ou chave do pool); `typeName` é o struct WGSL que a fonte preenche — um binding do shader cujo tipo (ou elemento de
 * `array<…>`) é `typeName` recebe a fonte deste resolver quando `name` está em `consumes`.
 */
export interface ConsumerResolver {
    /** Nome em `consumes` (nome do schema ou chave do pool). */
    readonly name: string;
    /** Struct WGSL que a fonte preenche (tipo do binding, ou do elemento de `array<…>`). */
    readonly typeName: string;
    /** Fonte atual, ou `undefined` se o dado ainda não existe na cena. */
    resolve(ctx: ResolveContext): ResolvedSource | undefined;
}
