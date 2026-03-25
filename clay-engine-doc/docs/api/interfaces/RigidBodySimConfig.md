# Interface: RigidBodySimConfig

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:12](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/RigidBodySimConfig.ts#L12)

Configuração da simulação de corpos rígidos.

Agrupa exclusivamente os parâmetros do pipeline RigidBody:
método de resolução (SI / XPBD) e estágios opcionais de estabilização.

Parâmetros de detecção de colisão (narrowphase, contatos especulativos)
ficam em `CollisionSimConfig`, pois são independentes do tipo de corpo.

## Properties

### backend?

> `optional` **backend?**: `"cpu"` \| `"gpu"`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:27](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/RigidBodySimConfig.ts#L27)

Backend de simulação RigidBody.
'cpu' — pipeline XPBD/SI em JavaScript (padrão, estável).
'gpu' — pipeline XPBD em compute shaders WGSL (Fase 3).
Default: 'cpu'.

***

### gyroscopic?

> `optional` **gyroscopic?**: `boolean`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:20](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/RigidBodySimConfig.ts#L20)

Habilita correção giroscópica (Δω = −I⁻¹·(ω × I·ω)·dt).
Previne drift em corpos com tensor de inércia assimétrico girando
em alta velocidade (bastão, placa). Default: false.

***

### iterations?

> `optional` **iterations?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:32](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/RigidBodySimConfig.ts#L32)

Número de iterações do solver PGS por substep (backend='gpu').
Default: 15. (Otimização 3c — compensa substeps=4 vs. substeps=8 anteriores)

***

### profilerLogInterval?

> `optional` **profilerLogInterval?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:38](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/RigidBodySimConfig.ts#L38)

Intervalo de frames entre leituras do profiler GPU (backend='gpu').
Valores menores aumentam a frequência dos logs de tempo de kernel.
Default: 60 (≈1 log/s a 60fps).

***

### resolution?

> `optional` **resolution?**: [`ResolutionConfig`](ResolutionConfig.md)

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:14](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/simulation/RigidBodySimConfig.ts#L14)

Método de resolução e seus parâmetros numéricos.
