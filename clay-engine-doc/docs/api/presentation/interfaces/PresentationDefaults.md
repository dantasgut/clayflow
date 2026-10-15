[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PresentationDefaults

# Interface: PresentationDefaults

Defined in: [presentation/flows/defaults.ts:35](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L35)

Bag dos Flows default registrados pelo Application. Permite o app
customizar diretamente (e.g. `defaults.post.addEffect(new Bloom(...))`,
`defaults.debug.setEnabled(true)`).

## Properties

### camera

> `readonly` **camera**: [`CameraFlow`](../../elements/classes/CameraFlow.md)

Defined in: [presentation/flows/defaults.ts:39](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L39)

Estágio de câmera (fase `transform`, depois da composição): parâmetros + Transform → matrizes da câmera.

***

### caustics

> `readonly` **caustics**: [`CausticsFlow`](../classes/CausticsFlow.md)

Defined in: [presentation/flows/defaults.ts:51](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L51)

Cáusticas da água em espaço da luz (fase `shadow`, depois da superfície vista pela luz).

***

### debug

> `readonly` **debug**: [`DebugFlow`](../classes/DebugFlow.md)

Defined in: [presentation/flows/defaults.ts:61](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L61)

Debug overlay — emite profilerStats event quando habilitado.

***

### fluidLightSurface

> `readonly` **fluidLightSurface**: [`FluidSurfaceFlow`](../classes/FluidSurfaceFlow.md)

Defined in: [presentation/flows/defaults.ts:49](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L49)

Superfície de água das partículas vista pela luz que projeta sombra (fase `shadow`, depois do mapa).

***

### fluidSurface

> `readonly` **fluidSurface**: [`FluidSurfaceFlow`](../classes/FluidSurfaceFlow.md)

Defined in: [presentation/flows/defaults.ts:47](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L47)

Superfície de água das partículas vista pela câmera (fase `forward`, depois dos sprites; spec 017).

***

### forward

> `readonly` **forward**: [`ForwardFlow`](../classes/ForwardFlow.md)

Defined in: [presentation/flows/defaults.ts:43](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L43)

Render principal: desenha a cena nos `FrameTargets` (câmera, mundo, materiais e sombra pelos slots).

***

### particles

> `readonly` **particles**: [`ParticleFlow`](../classes/ParticleFlow.md)

Defined in: [presentation/flows/defaults.ts:45](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L45)

Corpos de partículas em sprites (fase `forward`, depois do forward), lidos direto dos pools dos corpos.

***

### post

> `readonly` **post**: [`PostFlow`](../classes/PostFlow.md)

Defined in: [presentation/flows/defaults.ts:57](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L57)

Post-processing chain (Bloom/Fxaa/etc. em ping-pong).

***

### shadow

> `readonly` **shadow**: [`ShadowFlow`](../classes/ShadowFlow.md)

Defined in: [presentation/flows/defaults.ts:55](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L55)

Passe de profundidade do ponto de vista da luz que projeta sombra, no `ShadowMap` dela.

***

### shadowMatrix

> `readonly` **shadowMatrix**: [`ShadowMatrixFlow`](../../elements/classes/ShadowMatrixFlow.md)

Defined in: [presentation/flows/defaults.ts:41](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L41)

Estágio da matriz de sombra (fase `transform`, depois da câmera): direção da luz → matriz do `ShadowMap`.

***

### transform

> `readonly` **transform**: [`TransformFlow`](../../elements/classes/TransformFlow.md)

Defined in: [presentation/flows/defaults.ts:37](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L37)

Estágio de transformação (fase `transform`): intenção dos Transform → matrizes de mundo.

***

### ui

> `readonly` **ui**: [`UIFlow`](../classes/UIFlow.md)

Defined in: [presentation/flows/defaults.ts:59](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L59)

UI pass (quads + glyphs sobre o canvas).

***

### water

> `readonly` **water**: [`WaterFlow`](../classes/WaterFlow.md)

Defined in: [presentation/flows/defaults.ts:53](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L53)

Composição óptica da água nos alvos da cena (fase `forward`, depois da superfície).
