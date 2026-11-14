[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BindingSource

# Type Alias: BindingSource

> **BindingSource** = [`ResolvedSource`](ResolvedSource.md) \| [`BindableBufferSpec`](BindableBufferSpec.md) \| [`TextureViewSpec`](../interfaces/TextureViewSpec.md) \| [`SamplerSpec`](../interfaces/SamplerSpec.md)

Defined in: [src/scene/flows/FlowBinding.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L21)

Fonte de um recurso **privado** do Flow (`provider: 'private'`): uma fonte completa (`ResolvedSource`, ex.: uniform
com offset dinâmico) ou, abreviado, o buffer, a view ou o sampler.
