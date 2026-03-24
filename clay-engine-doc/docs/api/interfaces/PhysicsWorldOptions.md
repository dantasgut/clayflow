# Interface: PhysicsWorldOptions

Defined in: [elements/physics/PhysicsWorld.ts:43](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/PhysicsWorld.ts#L43)

## Properties

### broadphase?

> `optional` **broadphase?**: `Broadphase`

Defined in: [elements/physics/PhysicsWorld.ts:45](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/PhysicsWorld.ts#L45)

Estratégia de detecção de pares (broadphase). Default: AABBBroadphase.

***

### collision?

> `optional` **collision?**: [`CollisionSimConfig`](CollisionSimConfig.md)

Defined in: [elements/physics/PhysicsWorld.ts:69](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/PhysicsWorld.ts#L69)

Configuração do pipeline de detecção de colisão.
Independente do tipo de corpo — aplica-se a RigidBody e SoftBody.
Ausência usa os defaults de cada estágio.

***

### inertiaTensorMaxRatio?

> `optional` **inertiaTensorMaxRatio?**: `number`

Defined in: [elements/physics/PhysicsWorld.ts:50](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/PhysicsWorld.ts#L50)

Razão máxima entre o maior e o menor componente do tensor de inércia.
Limita instabilidade em corpos finos/longos. Default: 10.

***

### rigidBody?

> `optional` **rigidBody?**: [`RigidBodySimConfig`](RigidBodySimConfig.md)

Defined in: [elements/physics/PhysicsWorld.ts:57](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/PhysicsWorld.ts#L57)

Configuração da simulação de corpos rígidos.
Ausência desabilita o pipeline RigidBody (útil para cenas só com SoftBody).

***

### sleep?

> `optional` **sleep?**: `SleepStageOptions`

Defined in: [elements/physics/PhysicsWorld.ts:52](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/PhysicsWorld.ts#L52)

Configurações do gerenciador de sono.

***

### softBody?

> `optional` **softBody?**: [`SoftBodySimConfig`](SoftBodySimConfig.md)

Defined in: [elements/physics/PhysicsWorld.ts:63](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/PhysicsWorld.ts#L63)

Configuração da simulação de corpos deformáveis (XPBD SoftBody).
Presença deste objeto habilita o pipeline SoftBody no mesmo mundo.
Exemplo: `softBody: {}` usa todos os defaults.
