[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / wgslModule

# Function: wgslModule()

> **wgslModule**(`options`): [`WgslModule`](../interfaces/WgslModule.md)

Defined in: [src/scene/shaders/WgslModule.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L39)

Cria um módulo WGSL congelado. Lança se o nome é vazio, se o fonte define o mesmo símbolo duas vezes ou se escreve
ligações à mão (`@group`/`@binding` — spec 031: recursos são declarados com `wgslResource`).

## Parameters

### options

[`WgslModuleOptions`](../interfaces/WgslModuleOptions.md)

## Returns

[`WgslModule`](../interfaces/WgslModule.md)
