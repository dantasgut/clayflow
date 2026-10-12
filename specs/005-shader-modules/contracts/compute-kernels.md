# Contrato — Kernels genéricos

Todos em C3 (`elements/gpu/compute/`), exportados por `elements` para os estágios do motor; não fazem parte da
fachada de domínio (N0). Todos usam `createComputeKernel` com `WgslModule`, despacho linear da 004
(`Dispatcher.invocations`, índice por `num_workgroups`) e não despacham com `count = 0`.

**Parâmetros por chamada** (`FrameUniforms`): `count`, modo etc. vão numa região própria de um uniform com offset
dinâmico, renovada a cada quadro (um `core.record` = um envio; `core.write` entra na fila antes do quadro inteiro —
research A1). A mesma instância pode, portanto, ser gravada várias vezes no quadro com valores diferentes. Crescimento
no meio do quadro cria um buffer maior com as regiões já gravadas e adia a destruição do anterior ao quadro seguinte.

## `PrefixSum`

```ts
class PrefixSum {
  constructor(core: EngineCore, options: { discriminator: string; capacity: number });
  record(
    frame: Frame,
    args: {
      src: StorageBufferSpec; // u32[count]
      dst: StorageBufferSpec; // u32[count]; pode ser o mesmo que src
      count: number; // ≤ capacity
      mode?: 'exclusive' | 'inclusive'; // padrão exclusive
    },
  ): void;
  destroy(): void;
}
```

- Níveis `n_{l+1} = ⌈n_l / 256⌉` até ≤ 256 (topo num grupo); sem teto além de `maxStorageBufferBindingSize`.
- `count > capacity` → `RangeError`. Uniform `ScanLevel` por nível (schema `ScanLevelSchema`).
- O nível 0 roda no lugar em `dst`; com `src ≠ dst`, `src` é copiado antes (no fluxo de comandos) e não é alterado.

## `RadixSort`

```ts
class RadixSort {
  constructor(
    core: EngineCore,
    options: { discriminator: string; capacity: number; withValues?: boolean },
  );
  record(
    frame: Frame,
    args: {
      keys: StorageBufferSpec; // u32[count], ordenado no lugar
      values?: StorageBufferSpec; // u32[count], permutado junto (exige withValues)
      count: number;
      bits?: number; // múltiplo de 4, 4..32; padrão 32
    },
  ): void;
  destroy(): void;
}
```

- LSD, 4 bits por passe, estável. Buffers temporários dimensionados pela capacidade.
- Espalhamento: dentro do grupo de 256, o dígito é ordenado por quatro divisões estáveis por bit (soma de prefixos de
  flags em memória de workgroup) — mesmo resultado que 16 somas por dígito, com um quarto das barreiras.
- `values` exige `withValues: true` (e vice-versa); com número ímpar de passes o resultado é copiado de volta.

## `Compaction`

```ts
class Compaction {
  constructor(
    core: EngineCore,
    options: {
      discriminator: string;
      predicate: WgslModule; // define fn compact_keep(i: u32) -> bool e fn compact_value(i: u32) -> u32
      capacity: number; // tamanho máximo da saída
      stable?: boolean; // padrão false
      inputCapacity?: number; // maior count de entrada — obrigatório com stable (flags e soma de prefixos)
      bindings?: readonly ComputeKernelBinding[]; // buffers que o predicado lê (grupo 1)
    },
  );
  record(
    frame: Frame,
    args: { count: number; out: StorageBufferSpec; counter: StorageBufferSpec },
  ): void;
  destroy(): void;
}
```

- `counter` usa `AtomicAllocCounterSchema` (`count`, `overflow`), zerado pelo próprio `record`; nos dois modos `count` =
  total de aceitos (inclusive os recusados por falta de espaço) e `overflow` = recusados; nada é escrito além de
  `capacity`.
- Os módulos de compactação são gerados por predicado (`compactionModules(predicate)`, memorizado); predicado sem
  `compact_keep`/`compact_value` → erro na criação.
- `stable: true`: flags + `PrefixSum` + espalhamento (ordem de entrada preservada); `false`: `atomic_alloc` (ordem
  não garantida).

## Módulos de suporte

```wgsl
// atomic_alloc
struct AtomicAllocCounter { count: atomic<u32>, overflow: atomic<u32> } // gerado de AtomicAllocCounterSchema
const ATOMIC_ALLOC_FULL: u32 = 0xFFFFFFFFu;
fn atomic_alloc(counter: ptr<storage, AtomicAllocCounter, read_write>, capacity: u32) -> u32;

// fixed_point
fn fixed_from_f32(x: f32, scale: f32) -> i32; // satura em ±(2^31 − 128)
fn fixed_to_f32(v: i32, scale: f32) -> f32;
fn fixed_saturated(x: f32, scale: f32) -> bool;
```

- A narrowphase do LCP requer `atomic_alloc`; solve, acumulação e commit do LCP requerem `fixed_point` com escala 2²⁰.

## `Reduce`

```ts
class Reduce {
  constructor(
    core: EngineCore,
    options: {
      discriminator: string;
      capacity: number;
      op: 'sum' | 'min' | 'max';
      type: 'u32' | 'i32' | 'f32';
    },
  );
  record(
    frame: Frame,
    args: { src: StorageBufferSpec; count: number; out: StorageBufferSpec; outOffset?: number },
  ): void;
  destroy(): void;
}
```

- `reduceOp(op, type)` gera (memorizado) o módulo com `alias ReduceT`, `const REDUCE_IDENTITY`, `fn reduce_op`
  (identidades de f32 em hexadecimal exato, `±0x1.fffffep+127f`).
- `outOffset` em elementos.
- Soma f32: tolerância relativa `1e-5 × log2(count)` contra a CPU (documentada).

## `GraphColoring`

```ts
interface GraphColoring {
  readonly colorCount: number;
  readonly edgeColors: StorageBufferSpec; // u32[edgeCount]
  readonly edgesByColor: StorageBufferSpec; // u32[edgeCount]: índices de aresta agrupados por cor
  readonly ranges: StorageBufferSpec; // ColorRange[colorCount] { offset, count }
  readonly rangesCpu: readonly { offset: number; count: number }[];
}

class GraphColorer {
  constructor(
    core: EngineCore,
    options: { discriminator: string; capacity: number; maxColors?: number },
  );
  color(
    edges: StorageBufferSpec /* vec2u[count] */,
    count: number,
    vertexCount: number,
  ): Promise<GraphColoring>;
  destroy(): void;
}
```

- Cada cor é um emparelhamento **maximal** construído por subpassos (prioridade única por aresta: `pcg_hash`, bijeção
  de u32; máximo atômico nos vértices; a aresta que vence nos dois vértices recebe a cor e marca os vértices); sem
  candidatas, a cor seguinte começa — por isso ≤ 2Δ − 1 cores. Δ por `Reduce` max; `maxColors` padrão 2Δ (passar dele
  é erro); agrupamento por `RadixSort` (bits suficientes para as cores) + contagem + `PrefixSum`.
- Os buffers do resultado pertencem ao `GraphColorer` e valem até a próxima coloração; uma coloração por vez;
  `verifyEdgeColoring(edges, colors)` (CPU) verifica a validade — usada nos testes e no smoke.
- Laço (`a == b`) → erro na validação (lida de volta junto da contagem); arestas repetidas recebem cores distintas.
- Uso na criação/mudança de topologia (assíncrono, com envios próprios — fora de um `core.record`), não por quadro.
- Substitui o `GraphColorSolver` em CPU (removido).

## Validação na GPU (smoke `computeKernels`)

| Kernel          | Casos                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `PrefixSum`     | N ∈ {0, 1, 255, 256, 257, 65 537, 70 000 × 256 (> 65 535 grupos), 4 194 304}; exclusiva e inclusiva                                           |
| `RadixSort`     | N ∈ {0, 1, 1 000, 4 194 304}; chaves aleatórias, todas iguais, decrescentes; `bits` 8 e 32; estabilidade                                      |
| `Compaction`    | 50% e 1% aceitos; capacidade excedida (contagem + excedente, sem escrita fora); `stable`                                                      |
| `Reduce`        | sum/min/max × u32/i32/f32; N ∈ {1, 257, 4 194 304}                                                                                            |
| `GraphColoring` | grade 2D (Δ = 4), malha de tetraedros, grafo aleatório de 1 M arestas; validade, `colorCount ≤ maxColors`, intervalos cobrem todas as arestas |
| `fixed_point`   | soma de 1 M contribuições contra CPU dentro da resolução; saturação detectada                                                                 |
