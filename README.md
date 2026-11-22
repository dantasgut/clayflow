# Clay Engine

WebGPU engine modular construída em torno de Clean Architecture (4 camadas), ECS reativo e física GPU-only. Sem CPU fallback, sem dependências de bundlers além de Vite/TypeScript.

## Status

A engine está em `feature/hardening` (a ser merged em `develop`) com cobertura de **smokes browser-mode** para todos os solvers físicos (LCP, XPBD, FEM, MPM, SPH, PBF, NeighborSearch, DistanceConstraint), para o pipeline de pós-processamento (8 effects), UI hit-test, GLB binário, e profiler. **71 unit tests** (Vitest) + CI workflow.

## Arquitetura em 1 minuto

| Camada                | Responsabilidade                                                       | Diretório           |
| --------------------- | ---------------------------------------------------------------------- | ------------------- |
| **C1 — Hardware**     | EngineCore facade sobre WebGPU; spec-as-identity (UUIDv5)              | `src/core/`         |
| **C2 — Sync**         | World/EventBus/ResourceSystem/Flow/LayoutInferencer                    | `src/scene/`        |
| **C3 — Elements**     | Resources user-facing: geometry, material, physics bodies, constraints | `src/elements/`     |
| **C4 — Presentation** | Application, GameLoop, ForwardFlow, PostFlow, UIFlow, controllers      | `src/presentation/` |

Detalhes em [Arquitetura do Motor](https://github.com/dantasgut/clayflow/blob/develop/clay-engine-doc/docs/guides/architecture_resource_loaders.md).

## Quickstart

```bash
npm install
npm run dev      # Vite dev server em :5173 (ou :5174)
```

Edite `src/main.ts` para experimentar — o demo standalone hoje cobre os smokes da Fase E. Para incorporar a engine em outra app:

```bash
npm install clayflow
```

```typescript
import { Application } from 'clayflow/web';

const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
const app = await Application.create({ canvas });
app.start(); // GameLoop começa a emitir frameTick
```

## Receitas

### 1. Cubo girando

```typescript
import { Application, OrbitController, InteractionSystem } from 'clayflow/web';
import { BoxGeometry, Camera, DirectionalLight, StandardMaterial, Transform } from 'clayflow/web';

const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
const app = await Application.create({ canvas });

const camera = new Camera({ aspect: canvas.width / canvas.height });
app.world.insert(camera);

const interaction = new InteractionSystem({ canvas, window }, app.events);
interaction.attach();
interaction.addController(
  new OrbitController(camera, {
    target: [0, 0, 0],
    distance: 5,
    autoRotate: true,
    autoRotateSpeed: 0.4,
    damping: 0.85,
  }),
);

app.world.insert(
  new DirectionalLight({
    direction: [0.4, -1, 0.6, 0],
    color: [1, 1, 0.95, 1],
    castShadow: true,
  }),
);

const cube = new BoxGeometry({ size: [1, 1, 1] });
cube.add(new StandardMaterial({ albedo: [0.85, 0.4, 0.25, 1], roughness: 0.4 }));
cube.add(new Transform({ position: [0, 0, 0, 1] }));
app.world.insert(cube);

app.start();
```

### 2. RigidBody em queda livre

```typescript
import { Application } from 'clayflow/web';
import { Camera, GravityField, RigidBody, LCPFlow } from 'clayflow/web';

const app = await Application.create({ canvas });
app.world.insert(new Camera({ aspect: canvas.width / canvas.height }));
app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
app.world.insert(new RigidBody({ position: [0, 5, 0, 1], mass: 1.0 }));

app.flows.register(new LCPFlow(app.core, app.world, app.resources));
app.start();
```

### 3. Scene com sombras + post-processing

```typescript
import { Application, Bloom, ToneMapping, Vignette } from 'clayflow/web';
import {
  BoxGeometry,
  Camera,
  DirectionalLight,
  PlaneGeometry,
  StandardMaterial,
  Transform,
} from 'clayflow/web';

const app = await Application.create({ canvas });

app.world.insert(new Camera({ aspect: canvas.width / canvas.height }));
app.world.insert(
  new DirectionalLight({
    direction: [0.4, -1, 0.6, 0],
    castShadow: true,
    color: [1, 1, 0.95, 1],
  }),
);

const ground = new PlaneGeometry({ size: [10, 10] });
ground.add(new StandardMaterial({ albedo: [0.4, 0.4, 0.45, 1], roughness: 0.9 }));
ground.add(new Transform({ position: [0, -0.5, 0, 1] }));
app.world.insert(ground);

const cube = new BoxGeometry({ size: [1, 1, 1] });
cube.add(new StandardMaterial({ albedo: [0.85, 0.4, 0.25, 1], roughness: 0.3 }));
cube.add(new Transform({ position: [0, 0, 0, 1] }));
app.world.insert(cube);

// Apresentação (o último passe, do HDR à tela): AgX com exposição em EV. O antisserrilhado é o temporal, padrão da
// opção `antialias` de `Application.create` ('temporal' | 'msaa' | 'off').
app.world.insert(new ToneMapping({ operator: 'agx', exposure: 0 }));
// Efeitos em HDR antes da apresentação: Bloom → Vignette
app.defaults.post.addEffect(new Bloom({ aux: [0.5, 0, 0] }));
app.defaults.post.addEffect(new Vignette({ strength: 0.5 }));

app.start();
```

### 4. Mover objetos em tempo de execução

O `Transform` é a intenção (`position`, `rotation`, `scale`); mudar o `data` reposiciona o objeto no quadro
seguinte — sem chamadas manuais (a matriz de mundo é calculada na GPU pelo `TransformFlow`).

```typescript
const t = new Transform({ position: [0, 0, 0, 1] });
cube.add(t);
app.world.insert(cube);

app.events.on('frameTick', ({ elapsed }) => {
  t.data.position[1] = Math.sin(elapsed);
});
```

### 5. Tempo e avanço sem laço

```typescript
app.time.scale = 0.5; // câmera lenta (física e animação)
app.time.pausePhysics(); // física parada, desenho continua
app.step(1 / 60, 120); // 2 s simulados sem o laço (headless, testes)
console.log(app.capabilities.adapter.description); // adaptador e limites do device
```

### 6. Materiais por nós e a biblioteca de materiais prontos

O material é um grafo de nós de espalhamento (`nodes.bsdf.*`) e de composição (`nodes.closure.*`) numa
`MaterialFunction`, anexada a uma entidade com `StandardMaterial`. A biblioteca traz 23 materiais prontos — madeira
crua e envernizada, tecidos, couro, borracha, cerâmica, plásticos, metais, pintura de carro, vidro, pele, cera,
mármore —, usados inteiros (`Materials.*`) ou como nós de um grafo maior (`nodes.material.*`).

```typescript
import { MaterialFunction, Materials, NodeGraph, SphereGeometry, nodes } from 'clayflow/web';
import { StandardMaterial, Transform } from 'clayflow/web';

// Material pronto, com um parâmetro exposto ajustado
const ball = new SphereGeometry({ radius: 0.5 });
ball.add(new StandardMaterial());
ball.add(new Transform({ position: [-1, 0.5, 0, 1] }));
ball.add(Materials.woodVarnishedGloss({ coat_color: [1, 0.85, 0.6] }));
app.world.insert(ball);

// Dois materiais prontos misturados por um ruído
const mixed = new NodeGraph({
  nodes: {
    s: nodes.input.surfaceSample(),
    a: nodes.material.woodRaw,
    b: nodes.material.metalBrushed,
    n: nodes.noise.gradient3.with({ scale: 3 }),
    x: nodes.closure.mix,
    out: nodes.output.closure,
  },
  links: [
    ['s.world_position', 'n.p'],
    ['a.value', 'x.a'],
    ['b.value', 'x.b'],
    ['n.value', 'x.t'],
    ['x.value', 'out.closure'],
  ],
  output: 'out.value',
});
const other = new SphereGeometry({ radius: 0.5 });
other.add(new StandardMaterial());
other.add(new Transform({ position: [1, 0.5, 0, 1] }));
other.add(new MaterialFunction({ graph: mixed }));
app.world.insert(other);
```

A lista dos materiais, os parâmetros e as fontes dos valores estão no guia
[Materiais](https://github.com/dantasgut/clayflow/blob/develop/clay-engine-doc/docs/guides/materials.md).

## Comandos

```bash
npm run dev          # Vite dev server (engine standalone, src/main.ts)
npm run build:lib    # Build da lib para dist/ (ESM + .d.ts)
npm run preview      # Preview do build
npm run test         # Vitest unit tests
npm run test:watch   # Vitest watch mode
npm run test:coverage  # Cobertura ≥ 60% lines/funcs/statements
npm run doc          # TypeDoc → docs/
```

## Convenções de código

- **Sem prefixo `I` em interfaces.** `Renderer`, não `IRenderer`.
- **Sem `_` prefix em métodos privados.** Use modificador `private`.
- **Nomes semânticos.** `PhysicsBody`, não `GpuPhysicsBody`. `write`, não `gpuWrite`.
- **Mermaid em vez de ASCII** para diagramas em docs.

## Documentação adicional

- [Arquitetura completa](https://github.com/dantasgut/clayflow/blob/develop/clay-engine-doc/docs/guides/architecture_resource_loaders.md)
- [Materiais por nós e a biblioteca](https://github.com/dantasgut/clayflow/blob/develop/clay-engine-doc/docs/guides/materials.md)
- [Colisões e estabilidade](https://github.com/dantasgut/clayflow/blob/develop/clay-engine-doc/docs/guides/colisoes.md)
- TypeDoc: `npm run doc` gera em `clay-engine-doc/docs/api/`

## Licença

MIT.
