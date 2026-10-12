[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / effectsBase

# Variable: effectsBase

> `const` **effectsBase**: `WgslModule`

Defined in: [presentation/flows/shaders.ts:25](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/flows/shaders.ts#L25)

Base do pós-processamento: bindings da textura de origem e dos parâmetros, `vs_fullscreen` e os fragmentos dos
efeitos padrão. Efeitos próprios declaram um módulo com `requires: [effectsBase]` e o seu fragmento.
