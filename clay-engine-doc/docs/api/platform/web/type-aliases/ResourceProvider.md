[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ResourceProvider

# Type Alias: ResourceProvider

> **ResourceProvider** = \{ `pool`: `string`; \} \| \{ `consumer`: `string`; \} \| \{ `scene`: `string`; \} \| \{ `descriptor?`: `string`; `lag?`: `number`; `part?`: `"live"` \| `"records"` \| `"instances"` \| `"stamps"` \| `"clock"`; `slot`: `string`; \} \| `"private"`

Defined in: [src/scene/shaders/WgslResource.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L78)

Quem fornece o dado: o pool da C2 de chave `pool` (o nome do schema, ou `schema:algoritmo`), um resolver nomeado
da cena (`consumer`: tempo, alvos, bitset vivo `<pool>.live`), um ponto de cena (`scene`, registros das funções da
cena), um slot do Flow (`slot`: o que o slot resolveu, ex. o pool de corpos do `bodyType` do registro) ou o próprio
estágio (`'private'`, ligado pelo objeto do recurso).

## Union Members

### Type Literal

\{ `pool`: `string`; \}

#### pool

> `readonly` **pool**: `string`

Chave do pool.

***

### Type Literal

\{ `consumer`: `string`; \}

#### consumer

> `readonly` **consumer**: `string`

Nome do resolver.

***

### Type Literal

\{ `scene`: `string`; \}

#### scene

> `readonly` **scene**: `string`

Nome do ponto de cena.

***

### Type Literal

\{ `descriptor?`: `string`; `lag?`: `number`; `part?`: `"live"` \| `"records"` \| `"instances"` \| `"stamps"` \| `"clock"`; `slot`: `string`; \}

#### descriptor?

> `readonly` `optional` **descriptor?**: `string`

Descritor do Resource de um slot `singleton`.

#### lag?

> `readonly` `optional` **lag?**: `number`

Atraso da fatia de um slot `channel` (spec 037; 0 = a atual). Default 0.

#### part?

> `readonly` `optional` **part?**: `"live"` \| `"records"` \| `"instances"` \| `"stamps"` \| `"clock"`

Parte do slot (padrão: o buffer do pool, ou a view da textura).

#### slot

> `readonly` **slot**: `string`

Slot do Flow que liga o recurso (spec 031): um pool (`buffer`, ou o bitset `live`), os registros ou a lista
de instâncias de um conjunto de entidades (`records`, `instances`), uma textura (`view`) ou o descritor
`descriptor` de um singleton. Slot opcional ausente: o pipeline espera.

***

`"private"`
