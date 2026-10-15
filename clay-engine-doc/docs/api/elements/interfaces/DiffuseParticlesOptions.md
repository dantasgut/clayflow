[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / DiffuseParticlesOptions

# Interface: DiffuseParticlesOptions

Defined in: elements/particles/DiffuseParticles.ts:16

Opções das partículas secundárias de um fluido.

## Properties

### airDrag?

> `readonly` `optional` **airDrag?**: `number`

Defined in: elements/particles/DiffuseParticles.ts:36

Arrasto do ar sobre o spray (1/s). Default 0,4.

***

### appearance?

> `readonly` `optional` **appearance?**: [`DiffuseMaterialOptions`](DiffuseMaterialOptions.md)

Defined in: elements/particles/DiffuseParticles.ts:46

Aparência (cores e raios por tipo).

***

### bubbleDrag?

> `readonly` `optional` **bubbleDrag?**: `number`

Defined in: elements/particles/DiffuseParticles.ts:40

Arrasto das bolhas para a velocidade do fluido (fração por passo). Default 0,5.

***

### bubbleNeighbors?

> `readonly` `optional` **bubbleNeighbors?**: `number`

Defined in: elements/particles/DiffuseParticles.ts:44

Vizinhos do fluido acima dos quais é bolha. Default 20.

***

### buoyancy?

> `readonly` `optional` **buoyancy?**: `number`

Defined in: elements/particles/DiffuseParticles.ts:38

Empuxo das bolhas em múltiplos de g (para cima). Default 0,8.

***

### kinetic?

> `readonly` `optional` **kinetic?**: [`PotentialRange`](../type-aliases/PotentialRange.md)

Defined in: elements/particles/DiffuseParticles.ts:26

Energia cinética por massa ½ v², em J/kg. Default [2, 20].

***

### lifetime?

> `readonly` `optional` **lifetime?**: `number`

Defined in: elements/particles/DiffuseParticles.ts:32

Vida da espuma (s; spray e bolha envelhecem `sprayAging` vezes mais devagar). Default 1,5.

***

### maxParticles?

> `readonly` `optional` **maxParticles?**: `number`

Defined in: elements/particles/DiffuseParticles.ts:20

Capacidade do anel (partículas vivas no máximo). Default 65 536.

***

### source

> `readonly` **source**: [`FluidBody`](../classes/FluidBody.md)

Defined in: elements/particles/DiffuseParticles.ts:18

O corpo de fluido de onde nascem (SPH, PBF ou MPM fluido).

***

### sprayAging?

> `readonly` `optional` **sprayAging?**: `number`

Defined in: elements/particles/DiffuseParticles.ts:34

Envelhecimento relativo do spray e das bolhas (0: não envelhecem). Default 0,25.

***

### sprayNeighbors?

> `readonly` `optional` **sprayNeighbors?**: `number`

Defined in: elements/particles/DiffuseParticles.ts:42

Vizinhos do fluido abaixo dos quais é spray. Default 6.

***

### trappedAir?

> `readonly` `optional` **trappedAir?**: [`PotentialRange`](../type-aliases/PotentialRange.md)

Defined in: elements/particles/DiffuseParticles.ts:22

Ar aprisionado: Σ |v_ij| (1 − v̂_ij·x̂_ij) W, em m/s. Default [5, 20].

***

### trappedAirRate?

> `readonly` `optional` **trappedAirRate?**: `number`

Defined in: elements/particles/DiffuseParticles.ts:28

Partículas geradas por segundo por partícula de fluido com ar aprisionado pleno. Default 20.

***

### waveCrest?

> `readonly` `optional` **waveCrest?**: [`PotentialRange`](../type-aliases/PotentialRange.md)

Defined in: elements/particles/DiffuseParticles.ts:24

Crista de onda: Σ (1 − n̂_i·n̂_j) W. Default [2, 8].

***

### waveCrestRate?

> `readonly` `optional` **waveCrestRate?**: `number`

Defined in: elements/particles/DiffuseParticles.ts:30

Partículas geradas por segundo por partícula de fluido em crista plena. Default 20.
