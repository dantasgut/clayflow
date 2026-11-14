[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowEvent

# Type Alias: FlowEvent

> **FlowEvent** = \{ `type`: `"slotsResolved"`; \} \| \{ `slot`: `string`; `type`: `"slotLost"`; \} \| \{ `slot`: `string`; `type`: `"slotChanged"`; \} \| \{ `pipeline?`: `string`; `type`: `"pipelinesCompiled"`; \} \| \{ `pipeline`: `string`; `type`: `"pipelineRejected"`; \} \| \{ `group`: `number`; `newSpec`: [`BindGroupSpec`](../interfaces/BindGroupSpec.md); `oldSpec`: [`BindGroupSpec`](../interfaces/BindGroupSpec.md); `pipeline`: `string`; `type`: `"bindGroupReplaced"`; \} \| \{ `added`: readonly [`EntityId`](EntityId.md)[]; `removed`: readonly [`EntityId`](EntityId.md)[]; `slot`: `string`; `type`: `"entitiesChanged"`; \} \| \{ `height`: `number`; `type`: `"canvasReconfigured"`; `width`: `number`; \} \| \{ `poolKey`: `string`; `type`: `"poolReallocated"`; \} \| \{ `resource`: [`Resource`](../interfaces/Resource.md); `schema`: [`Schema`](../interfaces/Schema.md); `type`: `"resourceReady"`; \} \| \{ `poolKey`: `string`; `ranges`: readonly readonly \[`number`, `number`\][]; `schema`: [`Schema`](../interfaces/Schema.md); `type`: `"poolWritten"`; \} \| \{ `type`: `"framePrepare"`; \} \| \{ `type`: `"frameRecorded"`; \}

Defined in: [src/scene/flows/FlowTransitions.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowTransitions.ts#L29)

Eventos entregues pela Camada 2 a um Flow. Só a C2 os produz; o estado do Flow muda só pela tabela de transições
em reação a eles (FR-002).

- `slotsResolved`: os slots obrigatórios passaram a existir (o Flow sai de `pending`); momento de criar recursos
  privados que dependem dos slots e ligá-los (`ctx.bind`).
- `slotLost`: um slot obrigatório deixou de existir (o Flow volta a `pending`).
- `slotChanged`: um slot opcional (ou um pool de `slot.pools`) apareceu, sumiu ou trocou de recurso.
- `pipelinesCompiled`: os pipelines declarados (ou um preparado em transição, `pipeline`) compilaram.
- `pipelineRejected`: o compilador rejeitou o shader de um pipeline preparado com `verify` (código de fora); a
  cena já anunciou `extensionRejected`. O Flow continua com o pipeline anterior.
- `bindGroupReplaced`: a C2 recriou um bind group de um pipeline do Flow (fonte recriada).
- `entitiesChanged`: entraram ou saíram entidades de um slot `entities` — um evento por slot por quadro, com as
  mudanças acumuladas desde o anterior, entregue antes de `framePrepare`.
- `canvasReconfigured`: o canvas mudou de tamanho (Flows com slot `target`).
- `poolReallocated`: um pool de um slot do Flow foi recriado (crescimento).
- `resourceReady`: um Resource com objetos próprios, de um schema de `listens`, foi alocado ou enviado.
- `poolWritten`: a C2 enviou faixas de um pool cujo schema está em `listens` (um evento por pool por envio).
- `framePrepare`: o quadro vai ser gravado (dados enviados, slots e bind groups reconciliados) — momento das
  escritas por quadro de uniforms privados (parâmetros por passo, contagens). Entregue só a quem o declara.
- `frameRecorded`: o quadro em que o Flow gravou foi enviado — entregue só aos Flows cuja tabela declara o evento
  (ex.: um estágio reativo que volta a "limpo" depois de gravar o trabalho pendente).

## Union Members

### Type Literal

\{ `type`: `"slotsResolved"`; \}

#### type

> `readonly` **type**: `"slotsResolved"`

Slots obrigatórios resolvidos.

***

### Type Literal

\{ `slot`: `string`; `type`: `"slotLost"`; \}

#### slot

> `readonly` **slot**: `string`

Nome do slot que deixou de existir.

#### type

> `readonly` **type**: `"slotLost"`

Slot obrigatório perdido.

***

### Type Literal

\{ `slot`: `string`; `type`: `"slotChanged"`; \}

#### slot

> `readonly` **slot**: `string`

Nome do slot que apareceu, sumiu ou trocou de recurso.

#### type

> `readonly` **type**: `"slotChanged"`

Slot opcional mudou.

***

### Type Literal

\{ `pipeline?`: `string`; `type`: `"pipelinesCompiled"`; \}

#### pipeline?

> `readonly` `optional` **pipeline?**: `string`

Id do pipeline preparado em transição que compilou; ausente para os declarados (Flow pronto).

#### type

> `readonly` **type**: `"pipelinesCompiled"`

Pipelines compilados.

***

### Type Literal

\{ `pipeline`: `string`; `type`: `"pipelineRejected"`; \}

#### pipeline

> `readonly` **pipeline**: `string`

Id do pipeline.

#### type

> `readonly` **type**: `"pipelineRejected"`

Shader de um pipeline com `verify` rejeitado pelo compilador.

***

### Type Literal

\{ `group`: `number`; `newSpec`: [`BindGroupSpec`](../interfaces/BindGroupSpec.md); `oldSpec`: [`BindGroupSpec`](../interfaces/BindGroupSpec.md); `pipeline`: `string`; `type`: `"bindGroupReplaced"`; \}

#### group

> `readonly` **group**: `number`

Índice do `@group`.

#### newSpec

> `readonly` **newSpec**: [`BindGroupSpec`](../interfaces/BindGroupSpec.md)

Bind group novo.

#### oldSpec

> `readonly` **oldSpec**: [`BindGroupSpec`](../interfaces/BindGroupSpec.md)

Bind group anterior (já fora de uso a partir da próxima gravação).

#### pipeline

> `readonly` **pipeline**: `string`

Id do pipeline dono do grupo.

#### type

> `readonly` **type**: `"bindGroupReplaced"`

Bind group recriado pela C2.

***

### Type Literal

\{ `added`: readonly [`EntityId`](EntityId.md)[]; `removed`: readonly [`EntityId`](EntityId.md)[]; `slot`: `string`; `type`: `"entitiesChanged"`; \}

#### added

> `readonly` **added**: readonly [`EntityId`](EntityId.md)[]

Entidades que passaram a casar com a consulta do slot.

#### removed

> `readonly` **removed**: readonly [`EntityId`](EntityId.md)[]

Entidades que saíram do slot (removidas do World).

#### slot

> `readonly` **slot**: `string`

Nome do slot `entities`.

#### type

> `readonly` **type**: `"entitiesChanged"`

Entidades entraram ou saíram de um slot `entities`.

***

### Type Literal

\{ `height`: `number`; `type`: `"canvasReconfigured"`; `width`: `number`; \}

#### height

> `readonly` **height**: `number`

Altura nova, em pixels.

#### type

> `readonly` **type**: `"canvasReconfigured"`

Canvas redimensionado.

#### width

> `readonly` **width**: `number`

Largura nova, em pixels.

***

### Type Literal

\{ `poolKey`: `string`; `type`: `"poolReallocated"`; \}

#### poolKey

> `readonly` **poolKey**: `string`

Chave do pool recriado.

#### type

> `readonly` **type**: `"poolReallocated"`

Pool de um slot recriado.

***

### Type Literal

\{ `resource`: [`Resource`](../interfaces/Resource.md); `schema`: [`Schema`](../interfaces/Schema.md); `type`: `"resourceReady"`; \}

#### resource

> `readonly` **resource**: [`Resource`](../interfaces/Resource.md)

O Resource alocado ou enviado.

#### schema

> `readonly` **schema**: [`Schema`](../interfaces/Schema.md)

Schema (de `listens`) do Resource.

#### type

> `readonly` **type**: `"resourceReady"`

Resource de um schema de `listens` alocado ou enviado.

***

### Type Literal

\{ `poolKey`: `string`; `ranges`: readonly readonly \[`number`, `number`\][]; `schema`: [`Schema`](../interfaces/Schema.md); `type`: `"poolWritten"`; \}

#### poolKey

> `readonly` **poolKey**: `string`

Chave do pool.

#### ranges

> `readonly` **ranges**: readonly readonly \[`number`, `number`\][]

Faixas escritas: `[primeiro slot, quantidade]`.

#### schema

> `readonly` **schema**: [`Schema`](../interfaces/Schema.md)

Schema (de `listens`) do pool.

#### type

> `readonly` **type**: `"poolWritten"`

Faixas de um pool de um schema de `listens` enviadas pela CPU.

***

### Type Literal

\{ `type`: `"framePrepare"`; \}

#### type

> `readonly` **type**: `"framePrepare"`

Quadro prestes a ser gravado (opt-in).

***

### Type Literal

\{ `type`: `"frameRecorded"`; \}

#### type

> `readonly` **type**: `"frameRecorded"`

Quadro enviado (opt-in).
