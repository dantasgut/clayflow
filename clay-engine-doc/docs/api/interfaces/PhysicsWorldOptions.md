# Interface: PhysicsWorldOptions

Defined in: [elements/physics/PhysicsWorld.ts:42](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/PhysicsWorld.ts#L42)

## Properties

### broadphase?

> `optional` **broadphase?**: `Broadphase`

Defined in: [elements/physics/PhysicsWorld.ts:44](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/PhysicsWorld.ts#L44)

Estratégia de detecção de pares (broadphase). Default: AABBBroadphase.

***

### collision?

> `optional` **collision?**: [`CollisionSimConfig`](CollisionSimConfig.md)

Defined in: [elements/physics/PhysicsWorld.ts:68](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/PhysicsWorld.ts#L68)

Configuração do pipeline de detecção de colisão.
Independente do tipo de corpo — aplica-se a RigidBody e SoftBody.
Ausência usa os defaults de cada estágio.

***

### inertiaTensorMaxRatio?

> `optional` **inertiaTensorMaxRatio?**: `number`

Defined in: [elements/physics/PhysicsWorld.ts:49](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/PhysicsWorld.ts#L49)

Razão máxima entre o maior e o menor componente do tensor de inércia.
Limita instabilidade em corpos finos/longos. Default: 10.

***

### rigidBody?

> `optional` **rigidBody?**: [`RigidBodySimConfig`](RigidBodySimConfig.md)

Defined in: [elements/physics/PhysicsWorld.ts:56](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/PhysicsWorld.ts#L56)

Configuração da simulação de corpos rígidos.
Ausência desabilita o pipeline RigidBody (útil para cenas só com SoftBody).

***

### sleep?

> `optional` **sleep?**: `SleepStageOptions`

Defined in: [elements/physics/PhysicsWorld.ts:51](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/PhysicsWorld.ts#L51)

Configurações do gerenciador de sono.

***

### softBody?

> `optional` **softBody?**: [`SoftBodySimConfig`](SoftBodySimConfig.md)

Defined in: [elements/physics/PhysicsWorld.ts:62](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/PhysicsWorld.ts#L62)

Configuração da simulação de corpos deformáveis (XPBD SoftBody).
Presença deste objeto habilita o pipeline SoftBody no mesmo mundo.
Exemplo: `softBody: {}` usa todos os defaults.
