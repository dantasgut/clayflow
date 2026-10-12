[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ColorGradingOptions

# Interface: ColorGradingOptions

Defined in: [presentation/flows/effects/ColorGrading.ts:5](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/effects/ColorGrading.ts#L5)

Opções de domínio do color grading (lift/gain/gamma), além de `enabled` e `strength` (mistura com o original).

## Extends

- `Omit`\<[`PostProcessOptions`](PostProcessOptions.md), `"aux"`\>

## Properties

### enabled?

> `optional` **enabled?**: `boolean`

Defined in: [presentation/resources/PostProcessEffect.ts:16](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/resources/PostProcessEffect.ts#L16)

Liga/desliga o effect sem removê-lo do pipeline. Default: true.

#### Inherited from

[`PostProcessOptions`](PostProcessOptions.md).[`enabled`](PostProcessOptions.md#enabled)

***

### gain?

> `readonly` `optional` **gain?**: `number`

Defined in: [presentation/flows/effects/ColorGrading.ts:9](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/effects/ColorGrading.ts#L9)

Ganho multiplicativo depois do lift (default 1).

***

### gamma?

> `readonly` `optional` **gamma?**: `number`

Defined in: [presentation/flows/effects/ColorGrading.ts:11](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/effects/ColorGrading.ts#L11)

Gama aplicado ao resultado (default 1; > 1 clareia os meios-tons).

***

### lift?

> `readonly` `optional` **lift?**: `number`

Defined in: [presentation/flows/effects/ColorGrading.ts:7](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/effects/ColorGrading.ts#L7)

Deslocamento subtraído da cor antes do ganho (default 0).

***

### strength?

> `optional` **strength?**: `number`

Defined in: [presentation/resources/PostProcessEffect.ts:21](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/resources/PostProcessEffect.ts#L21)

Intensidade do effect (uniform `strength` no shader). Semântica
varia por effect: 0 = sem efeito; 1.0 = padrão; >1 = exagerado.

#### Inherited from

[`PostProcessOptions`](PostProcessOptions.md).[`strength`](PostProcessOptions.md#strength)
