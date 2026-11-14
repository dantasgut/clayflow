[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ParticlePhysicsOptions

# Interface: ParticlePhysicsOptions

Defined in: [src/elements/physics/ParticlePhysics.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L11)

Opções de domínio da física das partículas (fluidos SPH/PBF/MPM e sólidos MPM).

## Properties

### adhesion?

> `readonly` `optional` **adhesion?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L45)

Adesão às fronteiras sólidas (limites do domínio e colliders), adimensional (default 0, desligada): 1 dá à
partícula em contato uma aceleração de adesão da ordem de g. Referência de água: `ParticlePhysics.WATER_ADHESION`.

***

### bounds?

> `readonly` `optional` **bounds?**: `"walls"` \| `"open"`

Defined in: [src/elements/physics/ParticlePhysics.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L35)

O que os limites do domínio são (spec 010): `'walls'` (default) — chão e paredes que seguram e aderem o fluido;
`'open'` — só a caixa de cálculo: nada colide nem adere aos planos do domínio, o fluido colide apenas com os
colliders da cena, e a partícula que sai da caixa é retirada (parada fora da cena, sem vizinhos nem desenho).

***

### cohesion?

> `readonly` `optional` **cohesion?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L40)

Coesão — tensão superficial de Akinci et al. 2013 (SPH e PBF), adimensional (default 0, desligada): 1 dá à
partícula de borda uma aceleração de coesão da ordem de g. Referência de água: `ParticlePhysics.WATER_COHESION`.

***

### contactAngle?

> `readonly` `optional` **contactAngle?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L56)

Ângulo de contato θ com as fronteiras sólidas, em graus (spec 010; default 90 — nem molha nem repele).

***

### domainMax?

> `readonly` `optional` **domainMax?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/elements/physics/ParticlePhysics.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L29)

Canto máximo do domínio simulado, em metros (default [2, 2, 2]).

***

### domainMin?

> `readonly` `optional` **domainMin?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/elements/physics/ParticlePhysics.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L27)

Canto mínimo do domínio simulado, em metros (default [-2, -2, -2]).

***

### particleSpacing?

> `readonly` `optional` **particleSpacing?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L15)

Espaçamento entre partículas em repouso, em metros (default 0.05). Define massa, suavização e grade.

***

### poissonRatio?

> `readonly` `optional` **poissonRatio?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L25)

Coeficiente de Poisson dos sólidos MPM, em [0, 0.5) (default 0.3).

***

### restDensity?

> `readonly` `optional` **restDensity?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L13)

Densidade de repouso em kg/m³ (default 1000, água).

***

### restitution?

> `readonly` `optional` **restitution?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L21)

Restituição no contato com colliders e com os limites do domínio (default 0.2).

***

### slidingAngle?

> `readonly` `optional` **slidingAngle?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L64)

Ângulo de deslize das gotas soltas num sólido que a água molha, em graus (spec 034; default 0, sem ancoramento):
a borda da gota fica ancorada no sólido com a gravidade vezes o seno dele, qualquer que seja o aperto contra o
sólido — a gota escorre quando a gravidade ao longo da superfície passa disso (parede vertical, rampa mais
íngreme que o ângulo) e, no chão, depois do choque espalha, é freada e para. O volume do fluido não tem esse
ancoramento. Só com `contactAngle` < 90°.

***

### speedOfSound?

> `readonly` `optional` **speedOfSound?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L19)

Velocidade do som numérica em m/s (default 10): rigidez do fluido e passo estável.

***

### surfaceTension?

> `readonly` `optional` **surfaceTension?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L54)

Tensão superficial física γ em N/m (spec 010; água: 0,072). Com ela, coesão e adesão vêm da física na escala do
espaçamento — a coesão é γ/(ρ₀ s²) em múltiplos de g, a adesão a coesão × (1 + cos θ) (Young–Dupré) e o arrasto
tangencial na parede o viscoso μ/(ρ₀ s²) — em vez dos valores adimensionais `cohesion`/`adhesion`, que ignoram a
escala (exclusivos com ela). Ver `ParticlePhysics.WATER`.

***

### viscosity?

> `readonly` `optional` **viscosity?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L17)

Coeficiente de viscosidade (default 0.01).

***

### xsph?

> `readonly` `optional` **xsph?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L47)

Suavização de velocidade XSPH do SPH e do PBF (default 0.05).

***

### youngModulus?

> `readonly` `optional` **youngModulus?**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L23)

Módulo de Young em Pa dos sólidos MPM (default 5e4).
