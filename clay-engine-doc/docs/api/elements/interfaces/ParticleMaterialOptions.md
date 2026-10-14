[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParticleMaterialOptions

# Interface: ParticleMaterialOptions

Defined in: [elements/physics/materials/ParticleMaterial.ts:11](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/materials/ParticleMaterial.ts#L11)

Opções de domínio do material de partículas (fluidos SPH/PBF/MPM e sólidos MPM).

## Properties

### domainMax?

> `readonly` `optional` **domainMax?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/materials/ParticleMaterial.ts:29](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/materials/ParticleMaterial.ts#L29)

Canto máximo do domínio simulado, em metros (default [2, 2, 2]).

***

### domainMin?

> `readonly` `optional` **domainMin?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/materials/ParticleMaterial.ts:27](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/materials/ParticleMaterial.ts#L27)

Canto mínimo do domínio simulado, em metros (default [-2, -2, -2]).

***

### particleSpacing?

> `readonly` `optional` **particleSpacing?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:15](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/materials/ParticleMaterial.ts#L15)

Espaçamento entre partículas em repouso, em metros (default 0.05). Define massa, suavização e grade.

***

### poissonRatio?

> `readonly` `optional` **poissonRatio?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:25](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/materials/ParticleMaterial.ts#L25)

Coeficiente de Poisson dos sólidos MPM, em [0, 0.5) (default 0.3).

***

### restDensity?

> `readonly` `optional` **restDensity?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:13](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/materials/ParticleMaterial.ts#L13)

Densidade de repouso em kg/m³ (default 1000, água).

***

### restitution?

> `readonly` `optional` **restitution?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:21](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/materials/ParticleMaterial.ts#L21)

Restituição no contato com colliders e com os limites do domínio (default 0.2).

***

### speedOfSound?

> `readonly` `optional` **speedOfSound?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:19](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/materials/ParticleMaterial.ts#L19)

Velocidade do som numérica em m/s (default 10): rigidez do fluido e passo estável.

***

### viscosity?

> `readonly` `optional` **viscosity?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:17](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/materials/ParticleMaterial.ts#L17)

Coeficiente de viscosidade (default 0.01).

***

### youngModulus?

> `readonly` `optional` **youngModulus?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:23](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/materials/ParticleMaterial.ts#L23)

Módulo de Young em Pa dos sólidos MPM (default 5e4).
