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
npm install webgpu-engine
```

```typescript
import { Application } from 'webgpu-engine';

const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
const app = await Application.create({ canvas });
app.start(); // GameLoop começa a emitir frameTick
```

## Receitas

### 1. Cubo girando

```typescript
import { Application, OrbitController, InteractionSystem } from 'webgpu-engine';
import { BoxGeometry, Camera, DirectionalLight, StandardMaterial, Transform } from 'webgpu-engine';

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
import { Application } from 'webgpu-engine';
import { Camera, GravityField, RigidBody, LCPFlow } from 'webgpu-engine';

const app = await Application.create({ canvas });
app.world.insert(new Camera({ aspect: canvas.width / canvas.height }));
app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
app.world.insert(new RigidBody({ position: [0, 5, 0, 1], mass: 1.0 }));

app.flows.register(new LCPFlow(app.core, app.world, app.resources));
app.start();
```

### 3. Scene com sombras + post-processing

```typescript
import { Application, Bloom, ToneMapping, Fxaa, Vignette } from 'webgpu-engine';
import {
  BoxGeometry,
  Camera,
  DirectionalLight,
  PlaneGeometry,
  StandardMaterial,
  Transform,
} from 'webgpu-engine';

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

// Post chain: ToneMapping → Bloom → Fxaa → Vignette
app.defaults.post.addEffect(new ToneMapping({ strength: 1.0 }));
app.defaults.post.addEffect(new Bloom({ aux: [0.5, 0, 0] }));
app.defaults.post.addEffect(new Fxaa());
app.defaults.post.addEffect(new Vignette({ strength: 0.5 }));

app.start();
```

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
- [Colisões e estabilidade](https://github.com/dantasgut/clayflow/blob/develop/clay-engine-doc/docs/guides/colisoes.md)
- TypeDoc: `npm run doc` gera em `clay-engine-doc/docs/api/`

## Licença

MIT.
