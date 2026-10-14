[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidSurfaceMaterialOptions

# Interface: FluidSurfaceMaterialOptions

Defined in: [elements/material/FluidSurfaceMaterial.ts:41](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L41)

Opções do `FluidSurfaceMaterial`: os campos do dado, com `caustics` booleano.

## Extends

- `Partial`\<`Omit`\<[`FluidSurfaceMaterialData`](FluidSurfaceMaterialData.md), `"caustics"` \| `"color"` \| `"absorption"` \| `"ambient"` \| `"_pad0"` \| `"_pad1"`\>\>

## Properties

### absorption?

> `readonly` `optional` **absorption?**: readonly `number`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:50](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L50)

Absorção por metro (rgb).

***

### ambient?

> `readonly` `optional` **ambient?**: readonly `number`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:52](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L52)

Cor refletida, RGBA linear.

***

### causticIntensity?

> `optional` **causticIntensity?**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:33](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L33)

Escala do padrão das cáusticas (1 = físico; 0 = só a atenuação da luz pela água).

#### Inherited from

[`FluidSurfaceMaterialData`](FluidSurfaceMaterialData.md).[`causticIntensity`](FluidSurfaceMaterialData.md#causticintensity)

***

### caustics?

> `readonly` `optional` **caustics?**: `boolean`

Defined in: [elements/material/FluidSurfaceMaterial.ts:54](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L54)

Cáusticas ligadas. Padrão `true`.

***

### color?

> `readonly` `optional` **color?**: readonly `number`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:48](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L48)

Cor da dispersão interna, RGBA linear.

***

### depthThreshold?

> `optional` **depthThreshold?**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:25](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L25)

Descontinuidade de silhueta em múltiplos do raio: além dela a suavização não mistura profundidades.

#### Inherited from

[`FluidSurfaceMaterialData`](FluidSurfaceMaterialData.md).[`depthThreshold`](FluidSurfaceMaterialData.md#depththreshold)

***

### ior?

> `optional` **ior?**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:15](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L15)

Índice de refração (Fresnel, refração na tela e nas cáusticas).

#### Inherited from

[`FluidSurfaceMaterialData`](FluidSurfaceMaterialData.md).[`ior`](FluidSurfaceMaterialData.md#ior)

***

### particleRadius?

> `optional` **particleRadius?**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:21](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L21)

Raio da esfera de cada partícula em mundo; 0 = automático (0,6 × espaçamento do `ParticleMaterial`).

#### Inherited from

[`FluidSurfaceMaterialData`](FluidSurfaceMaterialData.md).[`particleRadius`](FluidSurfaceMaterialData.md#particleradius)

***

### reflectivity?

> `optional` **reflectivity?**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:17](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L17)

Escala da parcela refletida.

#### Inherited from

[`FluidSurfaceMaterialData`](FluidSurfaceMaterialData.md).[`reflectivity`](FluidSurfaceMaterialData.md#reflectivity)

***

### refraction?

> `optional` **refraction?**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:29](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L29)

Deslocamento da refração na tela por unidade de inclinação da superfície.

#### Inherited from

[`FluidSurfaceMaterialData`](FluidSurfaceMaterialData.md).[`refraction`](FluidSurfaceMaterialData.md#refraction)

***

### shininess?

> `optional` **shininess?**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:19](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L19)

Expoente do brilho especular.

#### Inherited from

[`FluidSurfaceMaterialData`](FluidSurfaceMaterialData.md).[`shininess`](FluidSurfaceMaterialData.md#shininess)

***

### smoothingRadius?

> `optional` **smoothingRadius?**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:23](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L23)

Raio da suavização da superfície em múltiplos do raio da partícula.

#### Inherited from

[`FluidSurfaceMaterialData`](FluidSurfaceMaterialData.md).[`smoothingRadius`](FluidSurfaceMaterialData.md#smoothingradius)

***

### thicknessScale?

> `optional` **thicknessScale?**: `number`

Defined in: [elements/material/FluidSurfaceMaterial.ts:27](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/material/FluidSurfaceMaterial.ts#L27)

Escala da espessura acumulada (absorção e dispersão).

#### Inherited from

[`FluidSurfaceMaterialData`](FluidSurfaceMaterialData.md).[`thicknessScale`](FluidSurfaceMaterialData.md#thicknessscale)
