[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PresentationDefaults

# Interface: PresentationDefaults

Defined in: [presentation/flows/defaults.ts:25](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/defaults.ts#L25)

Bag dos Flows default registrados pelo Application. Permite o app
customizar diretamente (e.g. `defaults.post.addEffect(new Bloom(...))`,
`defaults.debug.setEnabled(true)`).

## Properties

### camera

> `readonly` **camera**: [`CameraFlow`](../../elements/classes/CameraFlow.md)

Defined in: [presentation/flows/defaults.ts:29](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/defaults.ts#L29)

Estágio de câmera (fase `transform`, depois da composição): parâmetros + Transform → matrizes da câmera.

***

### debug

> `readonly` **debug**: [`DebugFlow`](../classes/DebugFlow.md)

Defined in: [presentation/flows/defaults.ts:41](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/defaults.ts#L41)

Debug overlay — emite profilerStats event quando habilitado.

***

### forward

> `readonly` **forward**: [`ForwardFlow`](../classes/ForwardFlow.md)

Defined in: [presentation/flows/defaults.ts:33](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/defaults.ts#L33)

Render principal: desenha a cena nos `FrameTargets` (câmera, mundo, materiais e sombra pelos slots).

***

### post

> `readonly` **post**: [`PostFlow`](../classes/PostFlow.md)

Defined in: [presentation/flows/defaults.ts:37](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/defaults.ts#L37)

Post-processing chain (Bloom/Fxaa/etc. em ping-pong).

***

### shadow

> `readonly` **shadow**: [`ShadowFlow`](../classes/ShadowFlow.md)

Defined in: [presentation/flows/defaults.ts:35](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/defaults.ts#L35)

Passe de profundidade do ponto de vista da luz que projeta sombra, no `ShadowMap` dela.

***

### shadowMatrix

> `readonly` **shadowMatrix**: [`ShadowMatrixFlow`](../../elements/classes/ShadowMatrixFlow.md)

Defined in: [presentation/flows/defaults.ts:31](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/defaults.ts#L31)

Estágio da matriz de sombra (fase `transform`, depois da câmera): direção da luz → matriz do `ShadowMap`.

***

### transform

> `readonly` **transform**: [`TransformFlow`](../../elements/classes/TransformFlow.md)

Defined in: [presentation/flows/defaults.ts:27](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/defaults.ts#L27)

Estágio de transformação (fase `transform`): intenção dos Transform → matrizes de mundo.

***

### ui

> `readonly` **ui**: [`UIFlow`](../classes/UIFlow.md)

Defined in: [presentation/flows/defaults.ts:39](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/defaults.ts#L39)

UI pass (quads + glyphs sobre o canvas).
