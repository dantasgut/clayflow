[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/deno](../README.md) / DenoPlatformAdapter

# Class: DenoPlatformAdapter

Defined in: [src/platform/deno/DenoPlatformAdapter.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/DenoPlatformAdapter.ts#L22)

Adaptador de plataforma do Deno (spec 038): o adaptador da GPU pelo `navigator.gpu` do Deno (wgpu), o formato
preferido dele e, de uma janela SDL, a superfície de apresentação sobre `Deno.UnsafeWindowSurface` — o tamanho em
pixels da janela, o contexto `webgpu` e a apresentação explícita depois de cada quadro.

## Implements

- [`PlatformAdapter`](../../web/interfaces/PlatformAdapter.md)\<[`SdlWindow`](SdlWindow.md)\>

## Constructors

### Constructor

> **new DenoPlatformAdapter**(): `DenoPlatformAdapter`

#### Returns

`DenoPlatformAdapter`

## Properties

### name

> `readonly` **name**: `"Deno"` = `'Deno'`

Defined in: [src/platform/deno/DenoPlatformAdapter.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/DenoPlatformAdapter.ts#L23)

Nome do ambiente (diagnóstico e mensagens).

#### Implementation of

[`PlatformAdapter`](../../web/interfaces/PlatformAdapter.md).[`name`](../../web/interfaces/PlatformAdapter.md#name)

## Methods

### getContext()

> **getContext**(`window`): [`PresentationSurface`](../../web/interfaces/PresentationSurface.md) & `object`

Defined in: [src/platform/deno/DenoPlatformAdapter.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/DenoPlatformAdapter.ts#L42)

A superfície de apresentação de um alvo do ambiente.

#### Parameters

##### window

[`SdlWindow`](SdlWindow.md)

#### Returns

[`PresentationSurface`](../../web/interfaces/PresentationSurface.md) & `object`

#### Implementation of

[`PlatformAdapter`](../../web/interfaces/PlatformAdapter.md).[`getContext`](../../web/interfaces/PlatformAdapter.md#getcontext)

***

### preferredFormat()

> **preferredFormat**(): `GPUTextureFormat`

Defined in: [src/platform/deno/DenoPlatformAdapter.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/DenoPlatformAdapter.ts#L38)

O formato preferido da apresentação no ambiente.

#### Returns

`GPUTextureFormat`

#### Implementation of

[`PlatformAdapter`](../../web/interfaces/PlatformAdapter.md).[`preferredFormat`](../../web/interfaces/PlatformAdapter.md#preferredformat)

***

### requestAdapter()

> **requestAdapter**(`options?`): `Promise`\<`GPUAdapter` \| `null`\>

Defined in: [src/platform/deno/DenoPlatformAdapter.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/DenoPlatformAdapter.ts#L34)

O adaptador da GPU; `null` quando o ambiente não tem WebGPU ou nenhum adaptador atende.

#### Parameters

##### options?

`GPURequestAdapterOptions`

#### Returns

`Promise`\<`GPUAdapter` \| `null`\>

#### Implementation of

[`PlatformAdapter`](../../web/interfaces/PlatformAdapter.md).[`requestAdapter`](../../web/interfaces/PlatformAdapter.md#requestadapter)
