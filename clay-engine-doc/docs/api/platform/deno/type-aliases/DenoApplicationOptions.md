[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/deno](../README.md) / DenoApplicationOptions

# Type Alias: DenoApplicationOptions

> **DenoApplicationOptions** = [`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md) & \{ `window`: \{ `height`: `number`; `highDpi?`: `boolean`; `title?`: `string`; `width`: `number`; \}; \} \| \{ `target`: \{ `height`: `number`; `width`: `number`; \}; \}

Defined in: [src/platform/deno/Application.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/Application.ts#L18)

Opções do `Application` do Deno (spec 038, `clayflow/deno`): as do motor mais o alvo — uma janela nativa (`window`,
navegação em tempo real) ou uma textura (`target`, sem tela: `step` e `read`, para gravar e testar).
