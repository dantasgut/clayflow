# Interface: RigidBodyGpuConfig

Defined in: [scene/systems/PhysicsSceneConfig.ts:62](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/PhysicsSceneConfig.ts#L62)

Parâmetros GPU do pipeline de corpo rígido (LCP/PGS).

## Properties

### baumgarteBeta?

> `optional` **baumgarteBeta?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:78](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/PhysicsSceneConfig.ts#L78)

Fator de Baumgarte [0.1–0.4] para correção de penetração. Default: 0.3.

***

### iterations?

> `optional` **iterations?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:70](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/PhysicsSceneConfig.ts#L70)

Número de iterações PGS por substep. Default: 25.

***

### predictiveThreshold?

> `optional` **predictiveThreshold?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:72](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/PhysicsSceneConfig.ts#L72)

Margem especulativa (m) para contatos iminentes. 0 = desativado. Default: 0.05.

***

### profilerLogInterval?

> `optional` **profilerLogInterval?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:82](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/PhysicsSceneConfig.ts#L82)

Intervalo de frames entre leituras do profiler GPU. Default: 60.

***

### restitutionThreshold?

> `optional` **restitutionThreshold?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:74](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/PhysicsSceneConfig.ts#L74)

Velocidade (m/s) abaixo da qual o coeficiente de restituição é zerado. Default: 2.0.

***

### sleepLinThreshold?

> `optional` **sleepLinThreshold?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:76](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/PhysicsSceneConfig.ts#L76)

Velocidade (m/s) para pseudo-sleep. 0 = desativado. Default: 0.01.

***

### substeps?

> `optional` **substeps?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:68](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/PhysicsSceneConfig.ts#L68)

Substeps por frame para o pipeline de corpo rígido.
Sobrescreve `PhysicsSceneConfig.substeps` para este algoritmo.
Default: 2 (velocity-space; 2 detecções por frame a 60fps).

***

### useLcp?

> `optional` **useLcp?**: `boolean`

Defined in: [scene/systems/PhysicsSceneConfig.ts:84](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/PhysicsSceneConfig.ts#L84)

Ativa solver LCP/PGS em vez de XPBD. Default: false.

***

### warmStartFactor?

> `optional` **warmStartFactor?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:80](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/PhysicsSceneConfig.ts#L80)

Fator de warm start [0.8–1.0] para o solver LCP. Default: 0.85.
