[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / effectsBase

# Variable: effectsBase

> `const` **effectsBase**: `WgslModule`

Defined in: [presentation/flows/shaders.ts:26](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/shaders.ts#L26)

Base do pós-processamento: bindings da textura de origem e dos parâmetros, `vs_fullscreen` e os fragmentos dos
efeitos padrão. Efeitos próprios declaram um módulo com `requires: [effectsBase]` e o seu fragmento.
