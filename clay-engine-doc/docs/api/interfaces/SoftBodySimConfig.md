[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / SoftBodySimConfig

# Interface: SoftBodySimConfig

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:12](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/simulation/SoftBodySimConfig.ts#L12)

Configuração da simulação de corpos deformáveis (XPBD SoftBody).

Presença deste objeto em `PhysicsWorldOptions.softBody` habilita o
pipeline XPBD SoftBody no mundo. Todos os campos são opcionais —
`softBody: {}` usa os defaults e já ativa o pipeline.

Forças globais (gravidade, vento) são registradas via `world.addForce()`
e aplicadas pelo XPBDSoftBodySolver — mesmo padrão do RigidBody.
Parâmetros por corpo (compliance, damping) são configurados em SoftBodyOptions.

## Properties

### iterations?

> `optional` **iterations?**: `number`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:18](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/simulation/SoftBodySimConfig.ts#L18)

Número de iterações do solver XPBD por substep.
Valores maiores convergem melhor em malhas densas, com custo proporcional.
Default: 10.

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:23](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/simulation/SoftBodySimConfig.ts#L23)

Coeficiente de restituição na colisão partícula-plano (0–1).
Default: 0.05.
