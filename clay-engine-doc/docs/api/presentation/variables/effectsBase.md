[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / effectsBase

# Variable: effectsBase

> `const` **effectsBase**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/presentation/flows/shaders.ts:327](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/shaders.ts#L327)

Base do pós-processamento: recursos da textura de origem, do amostrador e dos parâmetros, `vs_fullscreen` e os
fragmentos dos efeitos padrão. Efeitos próprios declaram um módulo com `requires: [effectsBase]` e o seu fragmento.
