[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SamplerSpec

# Interface: SamplerSpec

Defined in: [src/core/contracts/specs/SamplerSpec.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/SamplerSpec.ts#L9)

Spec de sampler GPU — encapsula filtering + wrap modes para sampling
de texturas. Materializado em GPUSampler via `device.createSampler(desc)`.

Default `desc` (quando omitido) é nearest filtering + clamp-to-edge,
adequado para depth maps e UI atlases. Para textures de cor com
mipmaps use `{magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear'}`.

## Properties

### desc?

> `readonly` `optional` **desc?**: `GPUSamplerDescriptor`

Defined in: [src/core/contracts/specs/SamplerSpec.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/SamplerSpec.ts#L17)

Descriptor WebGPU (filtering, addressMode, compare, etc.).

***

### discriminator?

> `readonly` `optional` **discriminator?**: `string`

Defined in: [src/core/contracts/specs/SamplerSpec.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/SamplerSpec.ts#L13)

Discriminador semântico. Parte do specHash.

***

### kind

> `readonly` **kind**: `"sampler"`

Defined in: [src/core/contracts/specs/SamplerSpec.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/SamplerSpec.ts#L11)

Discriminador de tipo — sempre `'sampler'`.

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [src/core/contracts/specs/SamplerSpec.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/SamplerSpec.ts#L15)

Label para debugging.
