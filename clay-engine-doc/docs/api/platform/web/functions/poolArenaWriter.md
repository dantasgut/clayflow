[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / poolArenaWriter

# Function: poolArenaWriter()

> **poolArenaWriter**(`options`): [`ArenaReader`](../interfaces/ArenaReader.md)

Defined in: [src/scene/shaders/poolArena.ts:150](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/poolArena.ts#L150)

Os elementos do pool `pool` lidos e escritos pela arena da GPU: o leitor e mais `name_store(i, v)` e
`name_store_<campo>(i, v)` — quem usa escreve `name[i] = v` e `name[i].campo = v`. O kernel liga a arena da GPU em
leitura e escrita (e lê por ela os outros pools dela).

## Parameters

### options

`Omit`\<[`PoolArenaReaderOptions`](../interfaces/PoolArenaReaderOptions.md), `"arena"`\>

## Returns

[`ArenaReader`](../interfaces/ArenaReader.md)
