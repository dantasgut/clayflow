# Interface: SoftBodySimConfig

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:20](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/simulation/SoftBodySimConfig.ts#L20)

Configuração da simulação de corpos deformáveis (XPBD SoftBody GPU).

Todos os campos são opcionais — `softBody: {}` usa os defaults.
Forças globais (gravidade, vento) são registradas via `world.addForce()`.

## Example

```ts
const world = new PhysicsWorld();
world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));
```

## Properties

### iterations?

> `optional` **iterations?**: `number`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:31](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/simulation/SoftBodySimConfig.ts#L31)

Número de iterações do solver XPBD por substep.
Valores maiores convergem melhor em malhas densas, com custo proporcional.
Default: 15.

***

### profilerLogInterval?

> `optional` **profilerLogInterval?**: `number`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:63](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/simulation/SoftBodySimConfig.ts#L63)

Intervalo de frames entre leituras do profiler GPU.
Default: 60 (≈1 log/s a 60fps).

***

### resolution?

> `optional` **resolution?**: [`SoftBodyResolutionConfig`](SoftBodyResolutionConfig.md)

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:25](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/simulation/SoftBodySimConfig.ts#L25)

Seleção explícita de algoritmo de resolução.
Default: XPBD (único suportado atualmente).

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:36](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/simulation/SoftBodySimConfig.ts#L36)

Coeficiente de restituição na colisão partícula-colissor (0–1).
Default: 0.05.

***

### shapeStiffness?

> `optional` **shapeStiffness?**: `number`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:49](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/simulation/SoftBodySimConfig.ts#L49)

Coeficiente de rigidez do Shape Matching [0..1].
0 = sem restauração, 1 = corpo rígido aproximado.
Só tem efeito se useShapeMatching=true. Default: 0.5.

***

### useJacobiSolve?

> `optional` **useJacobiSolve?**: `boolean`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:58](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/simulation/SoftBodySimConfig.ts#L58)

Ativa o solver Jacobi XPBD em vez do graph coloring.

Jacobi: todas as constraints resolvem em paralelo via acúmulo em atomic<i32>.
Prós: máximo paralelismo, sem graph-coloring.
Contras: pode precisar de ~10–20% mais iterações; sem warm-starting de λ.
Default: false.

***

### useShapeMatching?

> `optional` **useShapeMatching?**: `boolean`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:43](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/simulation/SoftBodySimConfig.ts#L43)

Ativa Shape Matching.
Cada partícula é puxada em direção à posição-meta R·r_i + cm,
onde R é extraída da decomposição polar do gradiente de deformação.
Default: false.
