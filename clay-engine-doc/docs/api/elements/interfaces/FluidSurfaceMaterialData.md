[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidSurfaceMaterialData

# Interface: FluidSurfaceMaterialData

Defined in: [elements/material/FluidSurfaceMaterial.ts:7](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L7)

Dado de um `FluidSurfaceMaterial` (layout de `FluidSurfaceMaterial.schema`).

## Properties

### \_pad0

> **\_pad0**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:35](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L35)

Preenchimento do layout.

***

### \_pad1

> **\_pad1**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:37](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L37)

Preenchimento do layout.

***

### absorption

> **absorption**: `number`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:11](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L11)

Absorção por metro em cada canal (`rgb`; `w` sem uso): a luz transmitida cai como `exp(−absorção · espessura)`.

***

### ambient

> **ambient**: `number`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:13](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L13)

Cor refletida pela superfície (ambiente/céu até a iluminação de ambiente da F4), RGBA linear.

***

### causticIntensity

> **causticIntensity**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:33](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L33)

Escala do padrão das cáusticas (1 = físico; 0 = só a atenuação da luz pela água).

***

### caustics

> **caustics**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:31](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L31)

Cáusticas ligadas (1) ou desligadas (0).

***

### color

> **color**: `number`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:9](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L9)

Cor da luz devolvida pelo interior da água (dispersão), RGBA linear.

***

### depthThreshold

> **depthThreshold**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:25](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L25)

Descontinuidade de silhueta em múltiplos do raio: além dela a suavização não mistura profundidades.

***

### ior

> **ior**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:15](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L15)

Índice de refração (Fresnel, refração na tela e nas cáusticas).

***

### particleRadius

> **particleRadius**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:21](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L21)

Raio da esfera de cada partícula em mundo; 0 = automático (0,6 × espaçamento do `ParticleMaterial`).

***

### reflectivity

> **reflectivity**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:17](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L17)

Escala da parcela refletida.

***

### refraction

> **refraction**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:29](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L29)

Deslocamento da refração na tela por unidade de inclinação da superfície.

***

### shininess

> **shininess**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:19](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L19)

Expoente do brilho especular.

***

### smoothingRadius

> **smoothingRadius**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:23](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L23)

Raio da suavização da superfície em múltiplos do raio da partícula.

***

### thicknessScale

> **thicknessScale**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:27](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L27)

Escala da espessura acumulada (absorção e dispersão).
