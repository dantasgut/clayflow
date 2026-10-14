[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / effectsBase

# Variable: effectsBase

> `const` **effectsBase**: `WgslModule`

Defined in: [presentation/flows/shaders.ts:32](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/shaders.ts#L32)

Base do pós-processamento: bindings da textura de origem e dos parâmetros, `vs_fullscreen` e os fragmentos dos
efeitos padrão. Efeitos próprios declaram um módulo com `requires: [effectsBase]` e o seu fragmento.
