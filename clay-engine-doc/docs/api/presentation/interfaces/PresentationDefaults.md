[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / PresentationDefaults

# Interface: PresentationDefaults

Defined in: [src/presentation/flows/defaults.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L73)

Bag dos Flows default registrados pelo Application. Permite o app
customizar diretamente (e.g. `defaults.post.addEffect(new Bloom(...))`,
`defaults.debug.setEnabled(true)`).

## Properties

### ambient

> `readonly` **ambient**: [`HemisphereLight`](../../elements/classes/HemisphereLight.md)

Defined in: [src/presentation/flows/defaults.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L101)

Luz ambiente da cena (spec 011): o hemisfério céu/chão no lugar da constante escondida — ajuste em `data`
(`defaults.ambient.data.intensity = 0.5`) ou remova do World (só as luzes diretas iluminam).

***

### camera

> `readonly` **camera**: [`CameraFlow`](../../elements/classes/CameraFlow.md)

Defined in: [src/presentation/flows/defaults.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L77)

Estágio de câmera (fase `transform`, depois da composição): parâmetros + Transform → matrizes da câmera.

***

### debug

> `readonly` **debug**: [`DebugFlow`](../classes/DebugFlow.md)

Defined in: [src/presentation/flows/defaults.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L91)

Debug overlay — emite profilerStats event quando habilitado.

***

### forward

> `readonly` **forward**: [`ForwardFlow`](../classes/ForwardFlow.md)

Defined in: [src/presentation/flows/defaults.ts:81](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L81)

Render principal: desenha a cena nos `FrameTargets` (câmera, mundo, materiais e sombra pelos slots).

***

### particles

> `readonly` **particles**: [`ParticleFlow`](../classes/ParticleFlow.md)

Defined in: [src/presentation/flows/defaults.ts:83](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L83)

Corpos de partículas em sprites (fase `forward`, depois do forward), lidos direto dos pools dos corpos.

***

### post

> `readonly` **post**: [`PostFlow`](../classes/PostFlow.md)

Defined in: [src/presentation/flows/defaults.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L87)

Post-processing chain (Bloom/Vignette/etc. em ping-pong).

***

### renderer

> `readonly` **renderer**: [`SceneRenderer`](../classes/SceneRenderer.md)

Defined in: [src/presentation/flows/defaults.ts:96](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L96)

O renderizador da cena (spec 039): o perfil de qualidade, os caminhos de luz, as cáusticas, o antisserrilhado, o
filtro temporal e a saída (`defaults.renderer.profile = 'medium'`, `defaults.renderer.output.data.exposure = 1`).

***

### shadow

> `readonly` **shadow**: [`ShadowFlow`](../classes/ShadowFlow.md)

Defined in: [src/presentation/flows/defaults.ts:85](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L85)

Passe de profundidade do ponto de vista da luz que projeta sombra, no `ShadowMap` dela.

***

### shadowMatrix

> `readonly` **shadowMatrix**: [`ShadowMatrixFlow`](../../elements/classes/ShadowMatrixFlow.md)

Defined in: [src/presentation/flows/defaults.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L79)

Estágio da matriz de sombra (fase `transform`, depois da câmera): direção da luz → matriz do `ShadowMap`.

***

### targets

> `readonly` **targets**: `FrameTargets`

Defined in: [src/presentation/flows/defaults.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L103)

Alvos HDR da cena (cor, amostras, profundidade e a cópia com mips).

***

### transform

> `readonly` **transform**: [`TransformFlow`](../../elements/classes/TransformFlow.md)

Defined in: [src/presentation/flows/defaults.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L75)

Estágio de transformação (fase `transform`): intenção dos Transform → matrizes de mundo.

***

### ui

> `readonly` **ui**: [`UIFlow`](../classes/UIFlow.md)

Defined in: [src/presentation/flows/defaults.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L89)

UI pass (quads + glyphs sobre o canvas).
