# Interface: RigidBodySimConfig

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:12](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/simulation/RigidBodySimConfig.ts#L12)

Configuração da simulação de corpos rígidos.

Agrupa exclusivamente os parâmetros do pipeline RigidBody:
método de resolução (SI / XPBD) e estágios opcionais de estabilização.

Parâmetros de detecção de colisão (narrowphase, contatos especulativos)
ficam em `CollisionSimConfig`, pois são independentes do tipo de corpo.

## Properties

### gyroscopic?

> `optional` **gyroscopic?**: `boolean`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:20](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/simulation/RigidBodySimConfig.ts#L20)

Habilita correção giroscópica (Δω = −I⁻¹·(ω × I·ω)·dt).
Previne drift em corpos com tensor de inércia assimétrico girando
em alta velocidade (bastão, placa). Default: false.

***

### resolution?

> `optional` **resolution?**: [`ResolutionConfig`](ResolutionConfig.md)

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:14](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/simulation/RigidBodySimConfig.ts#L14)

Método de resolução e seus parâmetros numéricos.
