# Interface: RigidBodyGpuConfig

Defined in: [scene/systems/PhysicsSceneConfig.ts:43](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L43)

Parâmetros GPU do pipeline de corpo rígido.

## Properties

### baumgarteBeta?

> `optional` **baumgarteBeta?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:53](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L53)

Fator de Baumgarte [0.1–0.3] para o solver LCP. Default: 0.2.

***

### iterations?

> `optional` **iterations?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:45](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L45)

Número de iterações do solver por substep. Default: 15.

***

### predictiveThreshold?

> `optional` **predictiveThreshold?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:47](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L47)

Margem especulativa (m) para contatos iminentes. 0 = desativado. Default: 0.

***

### profilerLogInterval?

> `optional` **profilerLogInterval?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:57](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L57)

Intervalo de frames entre leituras do profiler GPU. Default: 60.

***

### restitutionThreshold?

> `optional` **restitutionThreshold?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:49](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L49)

Velocidade (m/s) abaixo da qual o coeficiente de restituição é zerado. Default: 2.0.

***

### sleepLinThreshold?

> `optional` **sleepLinThreshold?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:51](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L51)

Velocidade (m/s) para pseudo-sleep. 0 = desativado. Default: 0.01.

***

### useLcp?

> `optional` **useLcp?**: `boolean`

Defined in: [scene/systems/PhysicsSceneConfig.ts:59](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L59)

Ativa solver LCP/PGS em vez de XPBD. Default: false.

***

### warmStartFactor?

> `optional` **warmStartFactor?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:55](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L55)

Fator de warm start [0.8–1.0] para o solver LCP. Default: 0.85.
