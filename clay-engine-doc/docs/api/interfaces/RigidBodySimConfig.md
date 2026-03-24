[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / RigidBodySimConfig

# Interface: RigidBodySimConfig

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:12](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/simulation/RigidBodySimConfig.ts#L12)

Configuração da simulação de corpos rígidos.

Agrupa exclusivamente os parâmetros do pipeline RigidBody:
método de resolução (SI / XPBD) e estágios opcionais de estabilização.

Parâmetros de detecção de colisão (narrowphase, contatos especulativos)
ficam em `CollisionSimConfig`, pois são independentes do tipo de corpo.

## Properties

### gyroscopic?

> `optional` **gyroscopic?**: `boolean`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:20](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/simulation/RigidBodySimConfig.ts#L20)

Habilita correção giroscópica (Δω = −I⁻¹·(ω × I·ω)·dt).
Previne drift em corpos com tensor de inércia assimétrico girando
em alta velocidade (bastão, placa). Default: false.

***

### resolution?

> `optional` **resolution?**: [`ResolutionConfig`](ResolutionConfig.md)

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:14](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/simulation/RigidBodySimConfig.ts#L14)

Método de resolução e seus parâmetros numéricos.
