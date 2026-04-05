# Interface: PhysicsSceneConfig

Defined in: [scene/systems/PhysicsSceneConfig.ts:23](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L23)

Configuração de cena física — dados puros, sem comportamento.

Substitui os campos de configuração embutidos em `PhysicsWorldOptions`.
Injetado no `GpuPhysicsOrchestrator` no momento da construção.

GPU-only: campos `backend`, solvers CPU e pipeline CPU são omitidos.

## Substeps por algoritmo

`substeps` em `PhysicsSceneConfig` é o valor global de fallback.
Cada algoritmo pode sobrescrever com seu próprio `substeps`, permitindo
tuning independente:

  RigidBody LCP:  2–4   (velocity-space; detecta contatos mais vezes por frame)
  SoftBody XPBD:  4–8   (position-space; mais substeps = constraints mais rígidas)
  FEM:            4–16  (adaptativo por rigidez e tamanho de elemento)
  MPM:            20–160 (CFL de onda em materiais elásticos rígidos)

A closure `getSubsteps` de cada pass é reativa: lê do config vivo a cada frame,
então mutar `config.rigidBody.substeps` em runtime tem efeito imediato.

## Properties

### fem?

> `optional` **fem?**: `FemGpuConfig`

Defined in: [scene/systems/PhysicsSceneConfig.ts:52](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L52)

Parâmetros do pipeline FEM (Finite Element Method).
Presença habilita o `FEMComputePass` quando implementado (Fase 3).

***

### gravity?

> `optional` **gravity?**: readonly \[`number`, `number`, `number`\]

Defined in: [scene/systems/PhysicsSceneConfig.ts:28](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L28)

Aceleração gravitacional (m/s²) aplicada globalmente.
Default: [0, -9.81, 0].

***

### inertiaTensorMaxRatio?

> `optional` **inertiaTensorMaxRatio?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:40](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L40)

Razão máxima entre o maior e o menor componente do tensor de inércia.
Limita instabilidade em corpos finos/longos. Default: 10.

***

### mpm?

> `optional` **mpm?**: `MpmGpuConfig`

Defined in: [scene/systems/PhysicsSceneConfig.ts:58](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L58)

Parâmetros do pipeline MPM (Material Point Method).
Presença habilita o `MPMComputePass` quando implementado (Fase 5).

***

### rigidBody?

> `optional` **rigidBody?**: [`RigidBodyGpuConfig`](RigidBodyGpuConfig.md)

Defined in: [scene/systems/PhysicsSceneConfig.ts:43](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L43)

Parâmetros do pipeline LCP/PGS para RigidBody.

***

### softBody?

> `optional` **softBody?**: [`SoftBodyGpuConfig`](SoftBodyGpuConfig.md)

Defined in: [scene/systems/PhysicsSceneConfig.ts:46](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L46)

Parâmetros do pipeline XPBD para SoftBody/cloth.

***

### substeps?

> `optional` **substeps?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:34](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L34)

Substeps globais de fallback — usado por qualquer algoritmo que não
defina seu próprio `substeps`. Default: 4.
