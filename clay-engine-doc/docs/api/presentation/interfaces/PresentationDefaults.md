[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PresentationDefaults

# Interface: PresentationDefaults

Defined in: [presentation/flows/defaults.ts:29](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L29)

Bag dos Flows default registrados pelo Application. Permite o app
customizar diretamente (e.g. `defaults.post.addEffect(new Bloom(...))`,
`defaults.debug.setEnabled(true)`).

## Properties

### camera

> `readonly` **camera**: [`CameraFlow`](../../elements/classes/CameraFlow.md)

Defined in: [presentation/flows/defaults.ts:33](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L33)

Estágio de câmera (fase `transform`, depois da composição): parâmetros + Transform → matrizes da câmera.

***

### debug

> `readonly` **debug**: [`DebugFlow`](../classes/DebugFlow.md)

Defined in: [presentation/flows/defaults.ts:47](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L47)

Debug overlay — emite profilerStats event quando habilitado.

***

### forward

> `readonly` **forward**: [`ForwardFlow`](../classes/ForwardFlow.md)

Defined in: [presentation/flows/defaults.ts:37](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L37)

Render principal: desenha a cena nos `FrameTargets` (câmera, mundo, materiais e sombra pelos slots).

***

### particles

> `readonly` **particles**: [`ParticleFlow`](../classes/ParticleFlow.md)

Defined in: [presentation/flows/defaults.ts:39](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L39)

Corpos de partículas em sprites (fase `forward`, depois do forward), lidos direto dos pools dos corpos.

***

### post

> `readonly` **post**: [`PostFlow`](../classes/PostFlow.md)

Defined in: [presentation/flows/defaults.ts:43](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L43)

Post-processing chain (Bloom/Fxaa/etc. em ping-pong).

***

### shadow

> `readonly` **shadow**: [`ShadowFlow`](../classes/ShadowFlow.md)

Defined in: [presentation/flows/defaults.ts:41](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L41)

Passe de profundidade do ponto de vista da luz que projeta sombra, no `ShadowMap` dela.

***

### shadowMatrix

> `readonly` **shadowMatrix**: [`ShadowMatrixFlow`](../../elements/classes/ShadowMatrixFlow.md)

Defined in: [presentation/flows/defaults.ts:35](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L35)

Estágio da matriz de sombra (fase `transform`, depois da câmera): direção da luz → matriz do `ShadowMap`.

***

### transform

> `readonly` **transform**: [`TransformFlow`](../../elements/classes/TransformFlow.md)

Defined in: [presentation/flows/defaults.ts:31](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L31)

Estágio de transformação (fase `transform`): intenção dos Transform → matrizes de mundo.

***

### ui

> `readonly` **ui**: [`UIFlow`](../classes/UIFlow.md)

Defined in: [presentation/flows/defaults.ts:45](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L45)

UI pass (quads + glyphs sobre o canvas).
