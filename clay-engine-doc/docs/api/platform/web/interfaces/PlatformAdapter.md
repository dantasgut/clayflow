[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PlatformAdapter

# Interface: PlatformAdapter\<Target\>

Defined in: [src/core/contracts/PlatformAdapter.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L33)

Adaptador de plataforma (spec 038, padrão adapter): o que o motor pede ao ambiente — o adaptador da GPU, o formato
preferido da apresentação e o contexto de um alvo do ambiente (o canvas no navegador, a janela no Deno). O núcleo
nunca toca `navigator`, canvas nem `Deno`: cada ponto de entrada (`clayflow/web`, `clayflow/deno`) traz o seu.

## Type Parameters

### Target

`Target` = `unknown`

## Properties

### name

> `readonly` **name**: `string`

Defined in: [src/core/contracts/PlatformAdapter.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L35)

Nome do ambiente (diagnóstico e mensagens).

## Methods

### getContext()

> **getContext**(`target`): [`PresentationSurface`](PresentationSurface.md)

Defined in: [src/core/contracts/PlatformAdapter.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L41)

A superfície de apresentação de um alvo do ambiente.

#### Parameters

##### target

`Target`

#### Returns

[`PresentationSurface`](PresentationSurface.md)

***

### preferredFormat()

> **preferredFormat**(): `GPUTextureFormat`

Defined in: [src/core/contracts/PlatformAdapter.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L39)

O formato preferido da apresentação no ambiente.

#### Returns

`GPUTextureFormat`

***

### requestAdapter()

> **requestAdapter**(`options?`): `Promise`\<`GPUAdapter` \| `null`\>

Defined in: [src/core/contracts/PlatformAdapter.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L37)

O adaptador da GPU; `null` quando o ambiente não tem WebGPU ou nenhum adaptador atende.

#### Parameters

##### options?

`GPURequestAdapterOptions`

#### Returns

`Promise`\<`GPUAdapter` \| `null`\>
