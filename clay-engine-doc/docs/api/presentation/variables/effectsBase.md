[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / effectsBase

# Variable: effectsBase

> `const` **effectsBase**: `WgslModule`

Defined in: [presentation/flows/shaders.ts:32](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/shaders.ts#L32)

Base do pós-processamento: bindings da textura de origem e dos parâmetros, `vs_fullscreen` e os fragmentos dos
efeitos padrão. Efeitos próprios declaram um módulo com `requires: [effectsBase]` e o seu fragmento.
