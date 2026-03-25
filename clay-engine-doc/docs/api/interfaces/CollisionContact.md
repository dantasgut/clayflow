# Interface: CollisionContact

Defined in: [scene/systems/PhysicsStageContext.ts:12](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L12)

Resultado do narrowphase para um par de entidades.

## Properties

### cpx

> **cpx**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:19](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L19)

Ponto de contato no espaço de mundo.

***

### cpy

> **cpy**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:19](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L19)

***

### cpz

> **cpz**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:19](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L19)

***

### depth

> **depth**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:17](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L17)

***

### entityIdA

> **entityIdA**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:13](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L13)

***

### entityIdB

> **entityIdB**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:14](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L14)

***

### featureId?

> `optional` **featureId?**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:33](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L33)

ID estável do feature de contato (ex: índice do vértice na caixa).
Quando presente, o warm starting usa este ID como chave em vez da
posição em grade — sobrevive a pequenas variações geométricas entre frames.
Undefined para algoritmos que não rastreiam features (esfera-esfera etc.).

***

### nx

> **nx**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:16](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L16)

Normal apontando de B para A (direção de separação de A).

***

### ny

> **ny**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:16](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L16)

***

### nz

> **nz**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:16](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L16)

***

### weight

> **weight**: `number`

Defined in: [scene/systems/PhysicsStageContext.ts:26](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/PhysicsStageContext.ts#L26)

Fator de escala para distribuição de impulso em manifolds multi-ponto.
Para N contatos do mesmo par: weight = 1/N, garantindo que a soma dos
impulsos normais equivalha ao caso de contato único.
Default: 1.0 (contato único).
