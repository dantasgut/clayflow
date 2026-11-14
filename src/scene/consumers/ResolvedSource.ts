import type {
    AnyBufferSpec,
    SamplerSpec,
    StagingBufferSpec,
    TextureViewSpec,
} from '../../core/contracts/index';

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
          /**
           * Fonte de canal temporal (spec 037): a fatia do atraso `lag` do anel. O bind group do grupo tem uma fase por
           * cabeça do anel, criada uma vez; a C2 escolhe a do quadro ao gravar (sem cópia, sem pipeline por paridade).
           */
          readonly kind: 'channel';
          /** O canal. */
          readonly channel: ChannelSource;
          /** Atraso da fatia ligada (0 = a atual). */
          readonly lag: number;
          /** `epoch` do canal na resolução: fatias recriadas mudam a fonte. */
          readonly epoch: number;
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

/** Fonte concreta de uma fatia de canal: buffer ou textura. */
export type SliceSource = Extract<ResolvedSource, { kind: 'buffer' } | { kind: 'textureView' }>;

/** O anel de um canal temporal visto pela ligação (spec 037). */
export interface ChannelSource {
    /** Nome para mensagens. */
    readonly name: string;
    /** Fatias no anel. */
    readonly depth: number;
    /** Índice físico da fatia do atraso 0 agora. */
    readonly head: number;
    /** Muda quando as fatias são recriadas. */
    readonly epoch: number;
    /** A fatia física `index` como fonte concreta. */
    sliceSource(index: number): SliceSource;
}
