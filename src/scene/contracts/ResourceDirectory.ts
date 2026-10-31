import type {
    AnyBufferSpec,
    SamplerSpec,
    TextureSpec,
    TextureViewSpec,
} from '../../core/contracts/index';
import type { Schema } from '../descriptors/Schema';
import type { PoolDirectory } from './PoolDirectory';
import type { Resource } from './Resource';

/** Carimbo de uma fatia de canal temporal: o quadro gravado (contagem da C2) e o tempo da cena nele. */
export interface ChannelStamp {
    readonly frame: number;
    readonly elapsed: number;
}

/**
 * Canal temporal de um descritor com `history` (spec 037): o anel de fatias mantido pela C2. A fatia do atraso 0 é a
 * que o produtor grava no quadro; o atraso `k` vale quando `frames ≥ k`. Contrato:
 * `specs/037-padronizacao-matematica/contracts/temporal-channel.md`.
 */
export interface ChannelInfo {
    /** Fatias no anel. */
    readonly depth: number;
    /** As fatias existem? (o canal de um descritor sob demanda existe desde a inserção; as fatias, desde o pedido) */
    readonly allocated: boolean;
    /** Índice físico da fatia do atraso 0. */
    readonly head: number;
    /** Quadros gravados seguidos desde a última invalidação. */
    readonly frames: number;
    /** Muda quando as fatias são recriadas (redimensionamento, crescimento do pool, `redescribe`). */
    readonly epoch: number;
    /** Formato resolvido (texturas; com a precisão e o recuo sem `float32-filterable`). */
    readonly format: GPUTextureFormat | undefined;
    texture(lag: number): TextureSpec | undefined;
    view(lag: number): TextureViewSpec | undefined;
    buffer(lag: number): AnyBufferSpec | undefined;
    /** Carimbo da fatia do atraso `lag`, ou `undefined` se ela não vale. */
    stamp(lag: number): ChannelStamp | undefined;
    /**
     * Quadros desde que a fatia do atraso `lag` foi gravada (0 = no quadro corrente; 1 = a anterior gravada no quadro
     * imediatamente anterior), ou `undefined` se ela não vale. Quem reprojeta pela câmera do quadro anterior exige 1.
     */
    age(lag: number): number | undefined;
}

/**
 * Localização do que a C2 alocou para cada descritor de cada recurso (`ResourceSystem`): buffers de qualquer
 * papel (uniform, storage, vértice, índice, indireto, staging), texturas, views e samplers. Estende
 * `PoolDirectory` (pools coalescidos).
 *
 * É o contrato pelo qual os estágios (Flows) de C3/C4 passam a consumir os objetos que a C2 aloca, em vez de
 * criar cópias próprias — a migração dos estágios para esse consumo é a spec 006.
 */
export interface ResourceDirectory extends PoolDirectory {
    /**
     * Buffer alocado para o descritor `descId` de `resource` (individual; para descritores em pool use
     * `poolBufferSpec`). `undefined` se o recurso não está alocado ou o descritor não é de buffer.
     */
    bufferOf(resource: Resource, descId: string): AnyBufferSpec | undefined;
    /** Textura alocada para o descritor (`texture`/`storage-texture`), ou `undefined`. */
    textureOf(resource: Resource, descId: string): TextureSpec | undefined;
    /** View da textura alocada para o descritor (`texture`/`storage-texture`), ou `undefined`. */
    textureViewOf(resource: Resource, descId: string): TextureViewSpec | undefined;
    /** Sampler alocado para o descritor `sampler`, ou `undefined`. */
    samplerOf(resource: Resource, descId: string): SamplerSpec | undefined;
    /**
     * Distância em bytes entre as regiões do uniforme por região `descId` de `resource` (o stride do schema alinhado ao
     * `minUniformBufferOffsetAlignment` do adaptador; spec 039), ou `undefined` se o descritor não tem `regions`.
     */
    regionStrideOf(resource: Resource, descId: string): number | undefined;
    /**
     * Lê da GPU o dado do descritor `descId` de `resource` (ou o primeiro com schema), desempacotado pelo schema — a
     * leitura sob demanda da spec 007: os pedidos da mesma tarefa saem num lote, uma cópia por faixa contígua; o valor é
     * o do último quadro enviado. Resource fora da cena (ou removido antes da resposta) resolve `undefined`. É o caminho
     * de um Flow para um contador da GPU (a fila da refração, os contatos do LCP), sem staging próprio.
     */
    read(resource: Resource, descId?: string): Promise<Record<string, unknown> | undefined>;
    /**
     * O descritor individual `descId` de `resource` tem um escritor na GPU (um conjunto com `owns`, spec 008)? Serve a
     * quem consome dado `upload: 'never'` (ex.: o forward avisa quando desenha uma geometria que ninguém escreve).
     */
    hasGpuWriter(resource: Resource, descId: string): boolean;
    /**
     * O descritor `descId` de `resource` foi produzido no quadro corrente pelo seu produtor (spec 031, R5)? Marcado pelo
     * Flow que o escreve (`TransitionContext.produced`, no `framePrepare`); quem o lê só grava com o dado produzido.
     */
    isProduced(resource: Resource, descId: string): boolean;
    /**
     * Aloca agora um descritor individual `allocation: 'onDemand'` de `resource` (se ainda não estiver) e devolve o
     * buffer (spec 008). Descritores de textura também (spec 017: a superfície de água só ocupa memória quando há
     * água): alocados com o tamanho do canvas ou o declarado, e lidos por `textureOf`/`textureViewOf` — o retorno é
     * `undefined` para eles. Chamado numa transição, fora da gravação.
     */
    ensureAllocated(resource: Resource, descId: string): AnyBufferSpec | undefined;
    /**
     * Aloca agora o pool `poolKey` declarado `allocation: 'onDemand'` (spec 037: a inversa de mundo, que só alguns
     * consumidores leem) com a capacidade inteira e devolve o buffer; emite `poolReallocated` na primeira vez (os
     * estágios religam os bind groups). Pool já alocado: o buffer dele. Sem o pool na cena: `undefined`. Chamado numa
     * transição, fora da gravação.
     */
    ensurePoolAllocated(poolKey: string): AnyBufferSpec | undefined;
    /**
     * Garante o pool de chave `schema.name`: se a cena ainda não tem nenhum recurso dele, cria-o vazio (zerado, com a
     * capacidade inicial) e o registra como fornecedor `{ pool }` — para quem lê um pool que a cena pode não ter (ex.:
     * as luzes nos acertos da iluminação global num cômodo só com emissores; spec 033). Chamado numa transição.
     */
    ensurePool(schema: Schema): void;
    /**
     * Canal temporal do descritor individual `descId` (com `history`) — desde a inserção do recurso; as fatias de um
     * descritor `onDemand` só depois do `ensureAllocated` (`allocated`). `undefined` sem o descritor ou fora da cena.
     */
    channelOf(resource: Resource, descId: string): ChannelInfo | undefined;
    /** Canal temporal do pool `poolKey` (descritor com `history`; as fatias desde o `ensurePoolAllocated`). */
    channelOfPool(poolKey: string): ChannelInfo | undefined;
    /**
     * O produtor gravou a fatia atual do canal no quadro (chamado no `dispatch` que a gravou): a C2 gira o anel no
     * próximo quadro e carimba a fatia. Sem gravação, o anel não gira.
     */
    markWritten(resource: Resource, descId: string): void;
    /** `markWritten` do canal de um pool. */
    markPoolWritten(poolKey: string): void;
    /** A continuidade da série quebrou por um motivo que só o produtor conhece: nenhuma fatia anterior vale. */
    invalidateChannel(resource: Resource, descId: string): void;
    /** `invalidateChannel` do canal de um pool. */
    invalidatePoolChannel(poolKey: string): void;
}
