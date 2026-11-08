[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WebPlatformAdapter

# Class: WebPlatformAdapter

Defined in: [src/platform/web/WebPlatformAdapter.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/WebPlatformAdapter.ts#L8)

Adaptador de plataforma do navegador (spec 038): o adaptador da GPU pelo `navigator.gpu`, o formato preferido do
canvas e o contexto `webgpu` de um `<canvas>` como superfície de apresentação (o tamanho é o do backbuffer do canvas;
o contexto, pedido no primeiro uso).

## Implements

- [`PlatformAdapter`](../interfaces/PlatformAdapter.md)\<`HTMLCanvasElement`\>

## Constructors

### Constructor

> **new WebPlatformAdapter**(): `WebPlatformAdapter`

#### Returns

`WebPlatformAdapter`

## Properties

### name

> `readonly` **name**: `"navegador"` = `'navegador'`

Defined in: [src/platform/web/WebPlatformAdapter.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/WebPlatformAdapter.ts#L9)

Nome do ambiente (diagnóstico e mensagens).

#### Implementation of

[`PlatformAdapter`](../interfaces/PlatformAdapter.md).[`name`](../interfaces/PlatformAdapter.md#name)

## Methods

### getContext()

> **getContext**(`canvas`): [`PresentationSurface`](../interfaces/PresentationSurface.md)

Defined in: [src/platform/web/WebPlatformAdapter.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/WebPlatformAdapter.ts#L22)

A superfície de apresentação de um alvo do ambiente.

#### Parameters

##### canvas

`HTMLCanvasElement`

#### Returns

[`PresentationSurface`](../interfaces/PresentationSurface.md)

#### Implementation of

[`PlatformAdapter`](../interfaces/PlatformAdapter.md).[`getContext`](../interfaces/PlatformAdapter.md#getcontext)

***

### preferredFormat()

> **preferredFormat**(): `GPUTextureFormat`

Defined in: [src/platform/web/WebPlatformAdapter.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/WebPlatformAdapter.ts#L18)

O formato preferido da apresentação no ambiente.

#### Returns

`GPUTextureFormat`

#### Implementation of

[`PlatformAdapter`](../interfaces/PlatformAdapter.md).[`preferredFormat`](../interfaces/PlatformAdapter.md#preferredformat)

***

### requestAdapter()

> **requestAdapter**(`options?`): `Promise`\<`GPUAdapter` \| `null`\>

Defined in: [src/platform/web/WebPlatformAdapter.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/WebPlatformAdapter.ts#L11)

O adaptador da GPU; `null` quando o ambiente não tem WebGPU ou nenhum adaptador atende.

#### Parameters

##### options?

`GPURequestAdapterOptions`

#### Returns

`Promise`\<`GPUAdapter` \| `null`\>

#### Implementation of

[`PlatformAdapter`](../interfaces/PlatformAdapter.md).[`requestAdapter`](../interfaces/PlatformAdapter.md#requestadapter)
