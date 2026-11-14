[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PresentationContext

# Interface: PresentationContext

Defined in: [src/core/contracts/PlatformAdapter.ts:6](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L6)

O contexto de apresentação (spec 038): o subconjunto do `GPUCanvasContext` que o motor usa — configurar no device,
desconfigurar, a textura do quadro corrente e a configuração aplicada. O do canvas do navegador e o da janela do Deno
o são de fato; a `TextureSurface` o emula sobre uma textura (desenho sem tela, lido de volta).

## Methods

### configure()

> **configure**(`configuration`): `void`

Defined in: [src/core/contracts/PlatformAdapter.ts:7](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L7)

#### Parameters

##### configuration

`GPUCanvasConfiguration`

#### Returns

`void`

***

### getConfiguration()?

> `optional` **getConfiguration**(): `GPUCanvasConfiguration` \| `null`

Defined in: [src/core/contracts/PlatformAdapter.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L10)

#### Returns

`GPUCanvasConfiguration` \| `null`

***

### getCurrentTexture()

> **getCurrentTexture**(): `GPUTexture`

Defined in: [src/core/contracts/PlatformAdapter.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L9)

#### Returns

`GPUTexture`

***

### unconfigure()

> **unconfigure**(): `void`

Defined in: [src/core/contracts/PlatformAdapter.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/PlatformAdapter.ts#L8)

#### Returns

`void`
