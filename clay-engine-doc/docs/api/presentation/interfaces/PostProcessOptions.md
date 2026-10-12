[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PostProcessOptions

# Interface: PostProcessOptions

Defined in: [presentation/resources/PostProcessEffect.ts:14](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/resources/PostProcessEffect.ts#L14)

Opções comuns a todos os post-process effects. Cada effect concreto
(Bloom, Fxaa, etc.) pode estender via cast em `data`, mas estes 3 campos
são padrão e mapeiam direto pro uniform buffer de 16 bytes do shader.

## Properties

### aux?

> `optional` **aux?**: readonly \[`number`, `number`, `number`\]

Defined in: [presentation/resources/PostProcessEffect.ts:26](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/resources/PostProcessEffect.ts#L26)

Slot extra de 3 floats para parâmetros custom do effect (e.g.
Bloom usa para threshold/knee/intensity, Vignette para center+radius).

***

### enabled?

> `optional` **enabled?**: `boolean`

Defined in: [presentation/resources/PostProcessEffect.ts:16](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/resources/PostProcessEffect.ts#L16)

Liga/desliga o effect sem removê-lo do pipeline. Default: true.

***

### strength?

> `optional` **strength?**: `number`

Defined in: [presentation/resources/PostProcessEffect.ts:21](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/resources/PostProcessEffect.ts#L21)

Intensidade do effect (uniform `strength` no shader). Semântica
varia por effect: 0 = sem efeito; 1.0 = padrão; >1 = exagerado.
