[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / wgslResource

# Function: wgslResource()

> **wgslResource**(`options`): [`WgslResource`](../interfaces/WgslResource.md)

Defined in: [src/scene/shaders/WgslResource.ts:150](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L150)

Declara um recurso de shader (spec 031, R1): a variável `name` com a ligação, o tipo, a frequência e o fornecedor.
Quem usa o recurso o põe em `requires`; a montagem (`composeWgsl`) emite a linha `@group(g) @binding(b) var…` com os
números atribuídos pelo motor. Declarado uma vez e compartilhado por referência: duas declarações diferentes com o
mesmo nome no mesmo shader são `symbol-conflict`.

## Parameters

### options

[`WgslResourceOptions`](../interfaces/WgslResourceOptions.md)

## Returns

[`WgslResource`](../interfaces/WgslResource.md)
