[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ShaderModuleSpec

# Interface: ShaderModuleSpec

Defined in: [src/core/contracts/specs/ShaderModuleSpec.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/ShaderModuleSpec.ts#L9)

Spec de shader module — encapsula um WGSL source (vertex+fragment+compute
podem coexistir num mesmo module com entry points distintos).
Materializado em GPUShaderModule via `device.createShaderModule({code})`.

specHash é baseado em `source + discriminator`, então edits no source
geram nova GPU object (Vite HMR funciona out-of-the-box).

## Properties

### discriminator?

> `readonly` `optional` **discriminator?**: `string`

Defined in: [src/core/contracts/specs/ShaderModuleSpec.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/ShaderModuleSpec.ts#L13)

Discriminador semântico (e.g. 'lcp_predict_shader'). Parte do specHash.

***

### kind

> `readonly` **kind**: `"shader"`

Defined in: [src/core/contracts/specs/ShaderModuleSpec.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/ShaderModuleSpec.ts#L11)

Discriminador de tipo — sempre `'shader'`.

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [src/core/contracts/specs/ShaderModuleSpec.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/ShaderModuleSpec.ts#L15)

Label para debugging.

***

### source

> `readonly` **source**: `string`

Defined in: [src/core/contracts/specs/ShaderModuleSpec.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/ShaderModuleSpec.ts#L17)

WGSL source code completo.
