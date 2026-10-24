# Contrato: canal temporal da C2 (`history`)

Spec 037, item 5 (FR-017 a FR-021). O canal temporal é a série de um recurso no tempo: um anel de N fatias do mesmo
descritor, girado pela C2 quando o produtor grava, com carimbo de tempo por fatia e invalidado pelos eventos que
quebram a continuidade. Física e luz usam o mesmo objeto; muda só a correspondência e a redução, que são de quem
consome.

## Declaração (descritor)

Qualquer descritor de textura (`texture`, `storage-texture`) ou de pool (`storage: 'pool'`) ganha o campo `history`:

```ts
interface HistoryShape {
  /** Fatias no anel (≥ 2): a atual (atraso 0) e as N − 1 anteriores. */
  readonly depth: number;
  /**
   * Precisão (só formatos float de 16 bits na declaração): `'full'` troca pelo de 32 bits do mesmo número de canais.
   * Sem `float32-filterable` e com `filtered`, fica em 16 bits com um aviso (uma vez por recurso).
   */
  readonly precision?: 'half' | 'full';
  /** O histórico é lido com amostrador filtrante (exige `float32-filterable` para `'full'`). */
  readonly filtered?: boolean;
}
```

- Textura: N texturas do mesmo `textureShape` (`sizeFromCanvas`, `canvasDivisor`, 3D valem), discriminador
  `${descId}:${identity}:h${k}:${w}x${h}`.
- Pool: N buffers do pool (`stride × capacidade` cada), crescendo junto; só `upload: 'never'` (o produtor é a GPU).
- `allocation: 'onDemand'` vale igual: as N fatias nascem no `ensureAllocated` / `ensurePoolAllocated`.

## Estado (C2, `ResourceSystem`)

Por canal: `head` (a fatia do atraso 0), `frames` (quadros gravados seguidos desde a última invalidação), o carimbo de
cada fatia (`frame`, `elapsed` do `frameTick` em que foi gravada) e o formato resolvido.

- **Girar**: no `frameRecording`, antes do `prepareFrame`, todo canal gravado no quadro anterior gira
  (`head = (head + 1) mod N`, `frames + 1`). Canal não gravado não gira: o atraso 1 continua sendo a última gravação, e
  o carimbo diz quanto tempo passou.
- **Invalidar** (`frames = 0`): textura recriada (redimensionamento, `redescribe`), pool crescido ou realocado, entrada
  ou saída de entidade no pool do canal, ou o pedido explícito do produtor. O corte de câmera continua na GPU
  (`CameraMatrices.history.x`, `temporal_cut`): é por câmera, não por recurso.
- O atraso `k` vale quando `frames ≥ k`.

## Diretório (`ResourceDirectory`)

```ts
channelOf(resource: Resource, descId: string): ChannelInfo | undefined;
channelOfPool(poolKey: string): ChannelInfo | undefined;
markWritten(resource: Resource, descId: string): void;
markPoolWritten(poolKey: string): void;
invalidateChannel(resource: Resource, descId: string): void;

interface ChannelInfo {
    readonly depth: number;
    readonly head: number;
    readonly frames: number;
    readonly format?: GPUTextureFormat;
    /** A fatia `lag` (0 = atual): textura e vista, ou buffer do pool. */
    texture(lag: number): TextureSpec;
    view(lag: number): TextureViewSpec;
    buffer(lag: number): BufferSpec;
    /** Carimbo da fatia `lag`; `undefined` se ainda não gravada desde a invalidação. */
    stamp(lag: number): { readonly frame: number; readonly elapsed: number } | undefined;
}
```

## Ligação (WGSL e slots)

- Provedor `{ channel: 'Schema.descId' | '<poolKey>', lag }` no `wgslResource`: a C2 resolve a fatia pelo atraso.
- O bind group de um grupo com fonte de canal tem uma **fase** por combinação de `head` dos canais do grupo; a C2
  cria cada fase uma vez e escolhe a do quadro ao gravar (`bindTo`, `groupsOf`). Nenhum pipeline por paridade.
- Slot `slot.channel(schema, descId, { optional })` → `BoundChannel` (vivo: `depth`, `head`, `frames`, `format`,
  `texture(lag)`, `view(lag)`, `stamp(lag)`, `written()`, `invalidate()`). Alvos de render (MRT) usam `view(0)`.
- `written()` é chamado no `dispatch` que gravou a fatia atual (não no `framePrepare`: um quadro pulado pela
  prontidão não gira o anel).

## Instâncias (FR-019, FR-020)

| Instância                  | Canais                                                        | Domínio           |
| -------------------------- | ------------------------------------------------------------- | ----------------- |
| antisserrilhado            | `history` (cor), `state`, `light` — N = 2                     | pixel (canvas)    |
| luz global de tela         | `screenHistory` — N = 2                                       | ladrilho (buffer) |
| névoa                      | `history` — N = 2                                             | célula 3D         |
| filtro temporal            | `accumulated`, `moments` — N = 2; o guia anterior da refração | pixel (canvas)    |
| energia dos corpos rígidos | `energy` — N = 8 (janela)                                     | entidade (pool)   |
| energia dos corpos moles   | `energy` — N = 8 (janela), um registro por corpo              | entidade (pool)   |

## Garantias testadas

- Unidade (C2): giro só com gravação, atraso e carimbo, invalidação por cada evento, fases do bind group, precisão com
  e sem `float32-filterable`.
- Smokes: as quatro instâncias de luz com os mesmos números da base da T050 (bit a bit onde a conta não muda) e o custo
  ≤ 1,1×; energia contra a referência f64 e contra a solução analítica do amortecimento (`energy`; corpos moles em
  `softEnergy`, com as fatias conferidas contra a potência e a janela).
