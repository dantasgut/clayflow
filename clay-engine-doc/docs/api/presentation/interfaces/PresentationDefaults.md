[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PresentationDefaults

# Interface: PresentationDefaults

Defined in: [presentation/flows/defaults.ts:36](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L36)

Bag dos Flows default registrados pelo Application. Permite o app
customizar diretamente (e.g. `defaults.post.addEffect(new Bloom(...))`,
`defaults.debug.setEnabled(true)`).

## Properties

### camera

> `readonly` **camera**: [`CameraFlow`](../../elements/classes/CameraFlow.md)

Defined in: [presentation/flows/defaults.ts:40](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L40)

Estágio de câmera (fase `transform`, depois da composição): parâmetros + Transform → matrizes da câmera.

***

### caustics

> `readonly` **caustics**: [`CausticsFlow`](../classes/CausticsFlow.md)

Defined in: [presentation/flows/defaults.ts:52](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L52)

Cáusticas da água em espaço da luz (fase `shadow`, depois da superfície vista pela luz).

***

### debug

> `readonly` **debug**: [`DebugFlow`](../classes/DebugFlow.md)

Defined in: [presentation/flows/defaults.ts:62](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L62)

Debug overlay — emite profilerStats event quando habilitado.

***

### fluidLightSurface

> `readonly` **fluidLightSurface**: [`FluidSurfaceFlow`](../classes/FluidSurfaceFlow.md)

Defined in: [presentation/flows/defaults.ts:50](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L50)

Superfície de água das partículas vista pela luz que projeta sombra (fase `shadow`, depois do mapa).

***

### fluidSurface

> `readonly` **fluidSurface**: [`FluidSurfaceFlow`](../classes/FluidSurfaceFlow.md)

Defined in: [presentation/flows/defaults.ts:48](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L48)

Superfície de água das partículas vista pela câmera (fase `forward`, depois dos sprites; spec 017).

***

### forward

> `readonly` **forward**: [`ForwardFlow`](../classes/ForwardFlow.md)

Defined in: [presentation/flows/defaults.ts:44](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L44)

Render principal: desenha a cena nos `FrameTargets` (câmera, mundo, materiais e sombra pelos slots).

***

### particles

> `readonly` **particles**: [`ParticleFlow`](../classes/ParticleFlow.md)

Defined in: [presentation/flows/defaults.ts:46](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L46)

Corpos de partículas em sprites (fase `forward`, depois do forward), lidos direto dos pools dos corpos.

***

### post

> `readonly` **post**: [`PostFlow`](../classes/PostFlow.md)

Defined in: [presentation/flows/defaults.ts:58](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L58)

Post-processing chain (Bloom/Fxaa/etc. em ping-pong).

***

### shadow

> `readonly` **shadow**: [`ShadowFlow`](../classes/ShadowFlow.md)

Defined in: [presentation/flows/defaults.ts:56](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L56)

Passe de profundidade do ponto de vista da luz que projeta sombra, no `ShadowMap` dela.

***

### shadowMatrix

> `readonly` **shadowMatrix**: [`ShadowMatrixFlow`](../../elements/classes/ShadowMatrixFlow.md)

Defined in: [presentation/flows/defaults.ts:42](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L42)

Estágio da matriz de sombra (fase `transform`, depois da câmera): direção da luz → matriz do `ShadowMap`.

***

### transform

> `readonly` **transform**: [`TransformFlow`](../../elements/classes/TransformFlow.md)

Defined in: [presentation/flows/defaults.ts:38](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L38)

Estágio de transformação (fase `transform`): intenção dos Transform → matrizes de mundo.

***

### ui

> `readonly` **ui**: [`UIFlow`](../classes/UIFlow.md)

Defined in: [presentation/flows/defaults.ts:60](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L60)

UI pass (quads + glyphs sobre o canvas).

***

### water

> `readonly` **water**: [`WaterFlow`](../classes/WaterFlow.md)

Defined in: [presentation/flows/defaults.ts:54](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L54)

Composição óptica da água nos alvos da cena (fase `forward`, depois da superfície).
