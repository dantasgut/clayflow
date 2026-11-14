[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TextureSurface

# Class: TextureSurface

Defined in: [src/core/gpu/surfaces/TextureSurface.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/gpu/surfaces/TextureSurface.ts#L10)

Superfície de apresentação sobre uma textura (spec 038): o quadro final vai para uma textura do tamanho pedido, sem
tela — para gravar vídeo, testar ou pré-calcular em qualquer ambiente com WebGPU (o navegador sem canvas, o Deno sem
janela). O contexto emula o do canvas: `configure` cria a textura no device com o formato e os usos pedidos (mais o
de alvo de desenho), `getCurrentTexture` a devolve e a leitura do quadro (`readCanvas`) a copia como faria com o
canvas. `resize` muda o tamanho; a textura nova sai na próxima configuração.

## Implements

- [`PresentationSurface`](../interfaces/PresentationSurface.md)

## Constructors

### Constructor

> **new TextureSurface**(`width`, `height`): `TextureSurface`

Defined in: [src/core/gpu/surfaces/TextureSurface.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/gpu/surfaces/TextureSurface.ts#L17)

#### Parameters

##### width

`number`

##### height

`number`

#### Returns

`TextureSurface`

## Properties

### context

> `readonly` **context**: [`PresentationContext`](../interfaces/PresentationContext.md)

Defined in: [src/core/gpu/surfaces/TextureSurface.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/gpu/surfaces/TextureSurface.ts#L15)

O contexto de apresentação.

#### Implementation of

[`PresentationSurface`](../interfaces/PresentationSurface.md).[`context`](../interfaces/PresentationSurface.md#context)

## Accessors

### height

#### Get Signature

> **get** **height**(): `number`

Defined in: [src/core/gpu/surfaces/TextureSurface.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/gpu/surfaces/TextureSurface.ts#L50)

Altura atual (pixels do quadro).

##### Returns

`number`

Altura atual (pixels do quadro).

#### Implementation of

[`PresentationSurface`](../interfaces/PresentationSurface.md).[`height`](../interfaces/PresentationSurface.md#height)

***

### width

#### Get Signature

> **get** **width**(): `number`

Defined in: [src/core/gpu/surfaces/TextureSurface.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/gpu/surfaces/TextureSurface.ts#L46)

Largura atual (pixels do quadro).

##### Returns

`number`

Largura atual (pixels do quadro).

#### Implementation of

[`PresentationSurface`](../interfaces/PresentationSurface.md).[`width`](../interfaces/PresentationSurface.md#width)

## Methods

### resize()

> **resize**(`width`, `height`): `void`

Defined in: [src/core/gpu/surfaces/TextureSurface.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/gpu/surfaces/TextureSurface.ts#L55)

Muda o tamanho (pixels); a textura nova é criada na próxima configuração (`reconfigureCanvas`).

#### Parameters

##### width

`number`

##### height

`number`

#### Returns

`void`
