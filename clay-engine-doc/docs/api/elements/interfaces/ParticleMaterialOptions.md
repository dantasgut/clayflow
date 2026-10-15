[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParticleMaterialOptions

# Interface: ParticleMaterialOptions

Defined in: [elements/physics/materials/ParticleMaterial.ts:11](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L11)

Opções de domínio do material de partículas (fluidos SPH/PBF/MPM e sólidos MPM).

## Properties

### adhesion?

> `readonly` `optional` **adhesion?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:45](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L45)

Adesão às fronteiras sólidas (limites do domínio e colliders), adimensional (default 0, desligada): 1 dá à
partícula em contato uma aceleração de adesão da ordem de g. Referência de água: `ParticleMaterial.WATER_ADHESION`.

***

### bounds?

> `readonly` `optional` **bounds?**: `"walls"` \| `"open"`

Defined in: [elements/physics/materials/ParticleMaterial.ts:35](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L35)

O que os limites do domínio são (spec 010): `'walls'` (default) — chão e paredes que seguram e aderem o fluido;
`'open'` — só a caixa de cálculo: nada colide nem adere aos planos do domínio, o fluido colide apenas com os
colliders da cena, e a partícula que sai da caixa é retirada (parada fora da cena, sem vizinhos nem desenho).

***

### cohesion?

> `readonly` `optional` **cohesion?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:40](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L40)

Coesão — tensão superficial de Akinci et al. 2013 (SPH e PBF), adimensional (default 0, desligada): 1 dá à
partícula de borda uma aceleração de coesão da ordem de g. Referência de água: `ParticleMaterial.WATER_COHESION`.

***

### contactAngle?

> `readonly` `optional` **contactAngle?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:56](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L56)

Ângulo de contato θ com as fronteiras sólidas, em graus (spec 010; default 90 — nem molha nem repele).

***

### domainMax?

> `readonly` `optional` **domainMax?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/materials/ParticleMaterial.ts:29](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L29)

Canto máximo do domínio simulado, em metros (default [2, 2, 2]).

***

### domainMin?

> `readonly` `optional` **domainMin?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/materials/ParticleMaterial.ts:27](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L27)

Canto mínimo do domínio simulado, em metros (default [-2, -2, -2]).

***

### particleSpacing?

> `readonly` `optional` **particleSpacing?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:15](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L15)

Espaçamento entre partículas em repouso, em metros (default 0.05). Define massa, suavização e grade.

***

### poissonRatio?

> `readonly` `optional` **poissonRatio?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:25](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L25)

Coeficiente de Poisson dos sólidos MPM, em [0, 0.5) (default 0.3).

***

### restDensity?

> `readonly` `optional` **restDensity?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:13](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L13)

Densidade de repouso em kg/m³ (default 1000, água).

***

### restitution?

> `readonly` `optional` **restitution?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:21](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L21)

Restituição no contato com colliders e com os limites do domínio (default 0.2).

***

### speedOfSound?

> `readonly` `optional` **speedOfSound?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:19](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L19)

Velocidade do som numérica em m/s (default 10): rigidez do fluido e passo estável.

***

### surfaceTension?

> `readonly` `optional` **surfaceTension?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:54](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L54)

Tensão superficial física γ em N/m (spec 010; água: 0,072). Com ela, coesão e adesão vêm da física na escala do
espaçamento — a coesão é γ/(ρ₀ s²) em múltiplos de g, a adesão a coesão × (1 + cos θ) (Young–Dupré) e o arrasto
tangencial na parede o viscoso μ/(ρ₀ s²) — em vez dos valores adimensionais `cohesion`/`adhesion`, que ignoram a
escala (exclusivos com ela). Ver `ParticleMaterial.WATER`.

***

### viscosity?

> `readonly` `optional` **viscosity?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:17](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L17)

Coeficiente de viscosidade (default 0.01).

***

### xsph?

> `readonly` `optional` **xsph?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:47](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L47)

Suavização de velocidade XSPH do SPH e do PBF (default 0.05).

***

### youngModulus?

> `readonly` `optional` **youngModulus?**: `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:23](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/materials/ParticleMaterial.ts#L23)

Módulo de Young em Pa dos sólidos MPM (default 5e4).
