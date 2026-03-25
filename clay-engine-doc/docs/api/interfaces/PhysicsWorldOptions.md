# Interface: PhysicsWorldOptions

Defined in: [elements/physics/PhysicsWorld.ts:45](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/PhysicsWorld.ts#L45)

## Properties

### broadphase?

> `optional` **broadphase?**: `Broadphase`

Defined in: [elements/physics/PhysicsWorld.ts:47](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/PhysicsWorld.ts#L47)

Estratégia de detecção de pares (broadphase). Default: AABBBroadphase.

***

### collision?

> `optional` **collision?**: [`CollisionSimConfig`](CollisionSimConfig.md)

Defined in: [elements/physics/PhysicsWorld.ts:87](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/PhysicsWorld.ts#L87)

Configuração do pipeline de detecção de colisão.
Independente do tipo de corpo — aplica-se a RigidBody e SoftBody.
Ausência usa os defaults de cada estágio.

***

### inertiaTensorMaxRatio?

> `optional` **inertiaTensorMaxRatio?**: `number`

Defined in: [elements/physics/PhysicsWorld.ts:68](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/PhysicsWorld.ts#L68)

Razão máxima entre o maior e o menor componente do tensor de inércia.
Limita instabilidade em corpos finos/longos. Default: 10.

***

### rigidBody?

> `optional` **rigidBody?**: [`RigidBodySimConfig`](RigidBodySimConfig.md)

Defined in: [elements/physics/PhysicsWorld.ts:75](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/PhysicsWorld.ts#L75)

Configuração da simulação de corpos rígidos.
Ausência desabilita o pipeline RigidBody (útil para cenas só com SoftBody).

***

### sleep?

> `optional` **sleep?**: `SleepStageOptions`

Defined in: [elements/physics/PhysicsWorld.ts:70](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/PhysicsWorld.ts#L70)

Configurações do gerenciador de sono.

***

### softBody?

> `optional` **softBody?**: [`SoftBodySimConfig`](SoftBodySimConfig.md)

Defined in: [elements/physics/PhysicsWorld.ts:81](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/PhysicsWorld.ts#L81)

Configuração da simulação de corpos deformáveis (XPBD SoftBody).
Presença deste objeto habilita o pipeline SoftBody no mesmo mundo.
Exemplo: `softBody: {}` usa todos os defaults.

***

### substeps?

> `optional` **substeps?**: `number`

Defined in: [elements/physics/PhysicsWorld.ts:63](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/PhysicsWorld.ts#L63)

Número de substeps por frame de física.

XPBD é teoricamente invariante ao número de substeps (compliance correto
escala com dt²), então reduzir substeps e compensar com mais iterações de
constraint é uma troca válida: menos overhead de predict/collision/velocity_update
por frame, com mesma qualidade de resolução de constraints.

Regra prática:
  - substeps=4 + iterations=15 → equivalente a substeps=8 + iterations=10
    em qualidade, com ~30% menos dispatches totais por frame.
  - substeps=2 pode introduzir tunneling em colisões rápidas.

Default: 4. (Anteriormente 8 — Otimização 3c)
