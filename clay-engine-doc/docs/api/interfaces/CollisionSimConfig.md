# Interface: CollisionSimConfig

Defined in: [scene/systems/simulation/CollisionSimConfig.ts:5](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/CollisionSimConfig.ts#L5)

Configuração do pipeline de detecção de colisão.
Parâmetros de narrowphase CPU foram removidos (GPU-only).

## Properties

### predictiveContacts?

> `optional` **predictiveContacts?**: `boolean`

Defined in: [scene/systems/simulation/CollisionSimConfig.ts:12](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/CollisionSimConfig.ts#L12)

Habilita contatos especulativos anti-tunneling.
Testa posições previstas (pos + vel·dt) para pares sem contato atual,
gerando contatos preventivos antes da penetração ocorrer.
Default: false.

***

### predictiveContactsThreshold?

> `optional` **predictiveContactsThreshold?**: `number`

Defined in: [scene/systems/simulation/CollisionSimConfig.ts:14](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/CollisionSimConfig.ts#L14)

Velocidade relativa mínima (m/s) para ativar contatos especulativos. Default: 2.0.
