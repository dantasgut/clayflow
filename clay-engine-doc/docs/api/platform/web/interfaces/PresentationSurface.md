[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PresentationSurface

# Interface: PresentationSurface

Defined in: [src/core/contracts/PlatformAdapter.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L17)

Onde o quadro final é apresentado (spec 038): o tamanho atual em pixels, o contexto e, quando o ambiente pede, a
apresentação explícita depois de cada quadro (a janela do Deno; o canvas apresenta sozinho).

## Properties

### context

> `readonly` **context**: [`PresentationContext`](PresentationContext.md)

Defined in: [src/core/contracts/PlatformAdapter.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L23)

O contexto de apresentação.

***

### height

> `readonly` **height**: `number`

Defined in: [src/core/contracts/PlatformAdapter.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L21)

Altura atual (pixels do quadro).

***

### width

> `readonly` **width**: `number`

Defined in: [src/core/contracts/PlatformAdapter.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L19)

Largura atual (pixels do quadro).

## Methods

### present()?

> `optional` **present**(): `void`

Defined in: [src/core/contracts/PlatformAdapter.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L25)

Apresenta o quadro submetido (só os ambientes que não apresentam sozinhos).

#### Returns

`void`
