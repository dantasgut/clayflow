# Interface: CollisionSimConfig

Defined in: [scene/systems/simulation/CollisionSimConfig.ts:11](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/CollisionSimConfig.ts#L11)

Configuração do pipeline de detecção de colisão.

Agrupa parâmetros que pertencem à detecção de contatos, independente
do tipo de corpo (RigidBody, SoftBody ou futuros tipos).
Broadphase é configurado diretamente em PhysicsWorldOptions pois é
uma estratégia trocável em nível de mundo.

## Properties

### narrowphase?

> `optional` **narrowphase?**: [`NarrowphaseConfig`](NarrowphaseConfig.md)

Defined in: [scene/systems/simulation/CollisionSimConfig.ts:13](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/CollisionSimConfig.ts#L13)

Algoritmos de narrowphase por par de formas (Registry pattern).

***

### predictiveContacts?

> `optional` **predictiveContacts?**: `boolean`

Defined in: [scene/systems/simulation/CollisionSimConfig.ts:20](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/CollisionSimConfig.ts#L20)

Habilita contatos especulativos anti-tunneling.
Testa posições previstas (pos + vel·dt) para pares sem contato atual,
gerando contatos preventivos antes da penetração ocorrer.
Default: false.

***

### predictiveContactsThreshold?

> `optional` **predictiveContactsThreshold?**: `number`

Defined in: [scene/systems/simulation/CollisionSimConfig.ts:22](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/CollisionSimConfig.ts#L22)

Velocidade relativa mínima (m/s) para ativar contatos especulativos. Default: 2.0.
