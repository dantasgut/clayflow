[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / poolArenaReader

# Function: poolArenaReader()

> **poolArenaReader**(`options`): [`ArenaReader`](../interfaces/ArenaReader.md)

Defined in: [src/scene/shaders/poolArena.ts:141](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/poolArena.ts#L141)

Os elementos do pool `pool` lidos pela arena (T060i): `name_at(i)` devolve o elemento `i` montado das palavras,
`name_at_<campo>(i)` só o campo e `name_len()` a capacidade; quem usa escreve `name[i]`, `name[i].campo` e
`arrayLength(&name)` e a montagem reescreve. Declarar o leitor põe o pool na arena (a C2 o aloca numa região).

## Parameters

### options

[`PoolArenaReaderOptions`](../interfaces/PoolArenaReaderOptions.md)

## Returns

[`ArenaReader`](../interfaces/ArenaReader.md)
