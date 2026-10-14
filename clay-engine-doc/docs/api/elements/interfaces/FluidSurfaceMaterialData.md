[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidSurfaceMaterialData

# Interface: FluidSurfaceMaterialData

Defined in: [elements/material/FluidSurfaceMaterial.ts:7](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L7)

Dado de um `FluidSurfaceMaterial` (layout de `FluidSurfaceMaterial.schema`).

## Properties

### \_pad0

> **\_pad0**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:44](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L44)

Preenchimento do layout.

***

### \_pad1

> **\_pad1**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:46](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L46)

Preenchimento do layout.

***

### \_pad2

> **\_pad2**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:48](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L48)

Preenchimento do layout.

***

### absorption

> **absorption**: `number`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:11](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L11)

Absorção por metro em cada canal (`rgb`; `w` sem uso): a luz transmitida cai como `exp(−absorção · espessura)`.

***

### ambient

> **ambient**: `number`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:13](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L13)

Cor refletida pela superfície (ambiente/céu até a iluminação de ambiente da F4), RGBA linear.

***

### causticIntensity

> **causticIntensity**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:33](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L33)

Escala do padrão das cáusticas (1 = físico; 0 = só a atenuação da luz pela água).

***

### caustics

> **caustics**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:31](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L31)

Cáusticas ligadas (1) ou desligadas (0).

***

### color

> **color**: `number`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:9](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L9)

Cor da luz devolvida pelo interior da água (dispersão), RGBA linear.

***

### depthThreshold

> **depthThreshold**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:25](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L25)

Descontinuidade de silhueta em múltiplos do raio: além dela a suavização não mistura profundidades.

***

### ior

> **ior**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:15](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L15)

Índice de refração (Fresnel, refração na tela e nas cáusticas).

***

### particleRadius

> **particleRadius**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:21](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L21)

Raio da esfera de cada partícula em mundo; 0 = automático (0,6 × espaçamento do `ParticleMaterial`).

***

### reflectivity

> **reflectivity**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:17](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L17)

Escala da parcela refletida.

***

### refraction

> **refraction**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:29](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L29)

Deslocamento da refração na tela por unidade de inclinação da superfície.

***

### rippleSize

> **rippleSize**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:40](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L40)

Comprimento da maior ondulação (m).

***

### rippleSpeed

> **rippleSpeed**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:42](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L42)

Escala da velocidade das ondulações (1 = dispersão de águas profundas).

***

### rippleStrength

> **rippleStrength**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:38](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L38)

Ondulações capilares procedurais (inclinação máxima somada à normal): o detalhe que a simulação não resolve
(ondas de milímetros a centímetros) — afeta refração, reflexo e cáusticas. 0 desliga.

***

### shininess

> **shininess**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:19](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L19)

Expoente do brilho especular.

***

### smoothingRadius

> **smoothingRadius**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:23](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L23)

Raio da suavização da superfície em múltiplos do raio da partícula.

***

### thicknessScale

> **thicknessScale**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:27](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/FluidSurfaceMaterial.ts#L27)

Escala da espessura acumulada (absorção e dispersão).
