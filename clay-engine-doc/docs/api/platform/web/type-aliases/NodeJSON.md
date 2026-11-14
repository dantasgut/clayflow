[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / NodeJSON

# Type Alias: NodeJSON

> **NodeJSON** = \{ `id`: `string`; `type`: `string`; `values?`: `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](ExtensionParamValue.md)\>\>; \} \| \{ `fields`: `Readonly`\<`Record`\<`string`, [`PortType`](PortType.md)\>\>; `id`: `string`; `name`: `string`; `type`: `"argument"`; \} \| \{ `definition`: [`InlineNodeJSON`](../interfaces/InlineNodeJSON.md); `id`: `string`; `type`: `"wgsl"`; `values?`: `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](ExtensionParamValue.md)\>\>; \} \| \{ `id`: `string`; `subgraph`: `string`; `type`: `"subgraph"`; `values?`: `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](ExtensionParamValue.md)\>\>; \}

Defined in: [src/scene/graph/serialize.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/serialize.ts#L39)

Um nó serializado.
