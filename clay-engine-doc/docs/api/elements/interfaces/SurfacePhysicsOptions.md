[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SurfacePhysicsOptions

# Interface: SurfacePhysicsOptions

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L10)

Opções da física da superfície de um sólido diante da água (`SurfacePhysics`).

## Properties

### contactAngle?

> `readonly` `optional` **contactAngle?**: `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L19)

Ângulo de contato de Young da água neste sólido, em graus; sem ele, o do líquido (`ParticlePhysics.contactAngle`,
ou o da água de referência).

***

### hysteresis?

> `readonly` `optional` **hysteresis?**: `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L14)

Histerese do ângulo de contato no sólido liso, θ_avanço − θ_recuo, em graus (default 10).

***

### poreRadius?

> `readonly` `optional` **poreRadius?**: `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L26)

Raio efetivo dos capilares (m), com a tortuosidade embutida: o que reproduz a sortividade medida do material
(default 0).

***

### porosity?

> `readonly` `optional` **porosity?**: `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L21)

Fração de vazios do material, em [0, 1) (default 0, impermeável).

***

### roughness?

> `readonly` `optional` **roughness?**: `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L12)

Razão de Wenzel: área real sobre a aparente, ≥ 1 (default 1, lisa).

***

### temperature?

> `readonly` `optional` **temperature?**: `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L30)

Temperatura da superfície (°C); sem ela, a do ar (`Atmosphere`).

***

### thickness?

> `readonly` `optional` **thickness?**: `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L28)

Espessura da camada que absorve (m) (default 0).
