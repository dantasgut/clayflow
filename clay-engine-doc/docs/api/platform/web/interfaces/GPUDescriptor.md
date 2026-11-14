[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / GPUDescriptor

# Interface: GPUDescriptor

Defined in: [src/scene/descriptors/GPUDescriptor.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L35)

GPUDescriptor declara um binding GPU que um Resource expõe ao
ResourceSystem. Comparado com `ResourceSpec` (Camada 1, materializável),
o GPUDescriptor é declarativo: schema + role + storage strategy. O
ResourceSystem materializa via `core.create` no momento certo.

Exemplo: Camera declara um GPUDescriptor `uniform` com `Camera.schema`,
e o ResourceSystem aloca um UniformBuffer + cria bindgroup automaticamente.

## Properties

### allocation?

> `readonly` `optional` **allocation?**: `"eager"` \| `"onDemand"`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L97)

Quando a C2 aloca o objeto de GPU de um descritor individual (spec 008): `'eager'` (padrão) na inserção;
`'onDemand'` só quando um estágio o pede (`ResourceDirectory.ensureAllocated`) — dado que só alguns consumidores
usam (ex.: as arestas de arame de uma geometria, só com material de arame). Liberado com o Resource. Em pool
(spec 037; só `upload: 'never'`), o pool fica com um elemento até `ResourceDirectory.ensurePoolAllocated`.

***

### binding?

> `readonly` `optional` **binding?**: `number`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L64)

Slot do binding no bindgroup (`@binding(N)`). Default: derivado por LayoutInferencer.

***

### clearOnRelease?

> `readonly` `optional` **clearOnRelease?**: `boolean`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L103)

Em pool: os slots que o Resource libera (saída da cena, troca de pool) voltam a zero na GPU (spec 031). Serve a
quem percorre o pool inteiro e reconhece o slot vazio pelo próprio dado (ex.: o `kind` 0 dos campos prontos),
sem ligar o bitset de vivos — uma ligação de storage a menos nos kernels. Padrão: o dado antigo fica no slot.

***

### count?

> `readonly` `optional` **count?**: `number`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L51)

Número de elementos. Em buffer individual, o tamanho do array (e.g. `count: 1024`). Em pool, os slots
contíguos que o Resource ocupa (spec 008: um corpo de N partículas ocupa N slots); com `count > 1` o dado
`data[id]` é por campo (um array por campo do schema, ver `StructSchema.packRange`). Default: 1.

***

### group?

> `readonly` `optional` **group?**: `number`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L66)

Slot do bindgroup (`@group(N)`). Default: 0.

***

### history?

> `readonly` `optional` **history?**: `HistoryShape`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:110](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L110)

Série temporal do descritor (spec 037, canal temporal): a C2 mantém `depth` fatias (texturas, ou buffers do pool
com `upload: 'never'`), gira o anel quando o produtor grava (`ResourceDirectory.markWritten`), carimba as fatias e
invalida a série na recriação, no crescimento do pool e na entrada ou saída de entidades dele. Lida por atraso
(`ResourceDirectory.channelOf`, `slot.channel`, provedor `{ slot, lag }`).

***

### id

> `readonly` **id**: `string`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L37)

Identificador local do descriptor dentro do Resource (e.g. 'view', 'mass').

***

### indexFormat?

> `readonly` `optional` **indexFormat?**: `GPUIndexFormat`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L90)

Formato dos índices de um descritor `index` (spec 008). Com conteúdo da CPU, derivado do array (`Uint32Array` →
`'uint32'`); obrigatório com `upload: 'never'` (índices escritos pela GPU).

***

### regions?

> `readonly` `optional` **regions?**: [`UniformRegions`](UniformRegions.md)

Defined in: [src/scene/descriptors/GPUDescriptor.ts:118](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L118)

Uniforme por região (spec 039, FR-014): `count` regiões do schema num buffer só, cada uma começando num múltiplo do
`minUniformBufferOffsetAlignment` do adaptador, ligadas por offset dinâmico (a fonte sai com `dynamic`) — os
parâmetros por passo, por substep ou por nível de um Flow. O dado é `data[id]`: um registro por região (as
ausentes ficam zeradas). Só `role: 'uniform'` individual, sem `count` nem `history`; a capacidade muda por
redescrição. Offset da região `i`: `i × ResourceDirectory.regionStrideOf(...)`.

***

### role

> `readonly` **role**: `GPUDescriptorRole`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L39)

Papel — controla tipo de buffer/textura e visibility no shader.

***

### samplerShape?

> `readonly` `optional` **samplerShape?**: `SamplerShape`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L62)

Configuração do sampler — apenas para role 'sampler'.

***

### schema?

> `readonly` `optional` **schema?**: [`Schema`](Schema.md)

Defined in: [src/scene/descriptors/GPUDescriptor.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L45)

Schema do field (StructSchema ou TensorSchema). Define stride,
alinhamento e WGSL type para gerar struct definition no shader.
Obrigatório para roles tipados (uniform/storage/vertex).

***

### slotRefs?

> `readonly` `optional` **slotRefs?**: `Readonly`\<`Record`\<`string`, `SlotRefTarget`\>\>

Defined in: [src/scene/descriptors/GPUDescriptor.ts:85](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L85)

Campos `u32` do schema que guardam slots de pool (spec 008): a C2 resolve o valor no empacotamento, porque o slot
de um Resource é alocado por ela.
  - `'self:<descId>'`: índice local na faixa do descritor `<descId>` deste Resource (número, ou array por campo
    com `count`); vira `first + índice`.
  - `'ref:<descId>'`: `{ body, index }` — índice na faixa do descritor `<descId>` do Resource `body`, que precisa
    estar na cena antes deste.

***

### storage?

> `readonly` `optional` **storage?**: `"pool"` \| `"individual"`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L58)

Estratégia de alocação:
  - `individual` (default): 1 buffer por Resource.
  - `pool`: coalesce N members do mesmo schema em 1 buffer compartilhado
    (eficiente para muitos RigidBodies, partículas, etc.).

***

### textureShape?

> `readonly` `optional` **textureShape?**: `TextureShape`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L60)

Forma da textura (dimensões, format, usage) — apenas para role 'texture'.

***

### upload?

> `readonly` `optional` **upload?**: `"always"` \| `"initial"` \| `"never"`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L76)

Quem escreve o buffer deste descritor:
  - `'always'` (default): a CPU envia na alocação e a cada mutação de `data`.
  - `'initial'`: a CPU envia só na alocação; depois a GPU é dona do dado (o recurso
    entra em `GpuManaged` e mutações posteriores são ignoradas com um aviso).
  - `'never'`: produzido só pela GPU (ex.: saída de um estágio); a CPU nunca escreve.

***

### visibility?

> `readonly` `optional` **visibility?**: `number`

Defined in: [src/scene/descriptors/GPUDescriptor.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/GPUDescriptor.ts#L68)

Bitmask `GPUShaderStage.*` indicando onde o binding é visível.
