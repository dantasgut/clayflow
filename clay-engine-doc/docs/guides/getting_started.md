---
sidebar_position: 1
title: Getting Started
---

# Getting Started

Boot a Clay Engine application in 3 steps. Veja também o [repositório no GitHub](https://github.com/dantasgut/clayflow) para receitas mais elaboradas.

## 1. Install

```bash
npm install webgpu-engine
```

Pré-requisito: navegador com WebGPU habilitado (Chrome 113+, Edge 113+, Safari TP, Firefox Nightly com flag).

## 2. HTML

```html
<!DOCTYPE html>
<html>
<head>
    <title>My WebGPU App</title>
    <style>
        html, body, canvas { margin: 0; width: 100%; height: 100%; display: block; }
    </style>
</head>
<body>
    <canvas id="gpuCanvas"></canvas>
    <script type="module" src="./main.ts"></script>
</body>
</html>
```

## 3. main.ts — cubo girando com luz e sombra

```typescript
import {
    Application, OrbitController, InteractionSystem,
} from 'webgpu-engine';
import {
    BoxGeometry, Camera, DirectionalLight, PlaneGeometry,
    StandardMaterial, Transform,
} from 'webgpu-engine';

const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
const dpr = window.devicePixelRatio || 1;
canvas.width = Math.floor(canvas.clientWidth * dpr);
canvas.height = Math.floor(canvas.clientHeight * dpr);

const app = await Application.create({ canvas });

// Camera + controller
const camera = new Camera({ aspect: canvas.width / canvas.height });
app.world.insert(camera);

const interaction = new InteractionSystem({ canvas, window }, app.events);
interaction.attach();
interaction.addController(new OrbitController(camera, {
    target: [0, 0.5, 0], distance: 6,
    autoRotate: true, autoRotateSpeed: 0.4,
    damping: 0.85,
}));

// Iluminação direcional com sombra
app.world.insert(new DirectionalLight({
    direction: [0.4, -1, 0.6, 0],
    color: [1, 1, 0.95, 1],
    castShadow: true,
}));

// Chão
const ground = new PlaneGeometry({ size: [10, 10] });
ground.add(new StandardMaterial({ albedo: [0.4, 0.5, 0.55, 1], roughness: 0.9 }));
ground.add(new Transform({ position: [0, -0.5, 0, 1] }));
app.world.insert(ground);

// Cubo
const cube = new BoxGeometry({ size: [1, 1, 1] });
cube.add(new StandardMaterial({ albedo: [0.85, 0.4, 0.25, 1], roughness: 0.4 }));
cube.add(new Transform({ position: [0, 0, 0, 1] }));
app.world.insert(cube);

// GO
app.start();
```

Pronto: você tem um cubo com sombra, OrbitController com damping, luz direcional, e o `GameLoop` pulsando frames a 60 Hz.

## Próximos passos

- **Adicionar física**: crie bodies em vocabulário de domínio — `new RigidBody({ shape: 'sphere', radius: 0.4, mass: 1 })`, `new SoftBody({ algorithm: 'XPBD', position, mass })`, `new FluidBody({ algorithm: 'MPM', position })` — e `app.world.insert(body)`. O Flow correspondente é **auto-registrado** (sem `flows.register` manual). Veja [Physics Flows](./physics_flows.md).
- **Pós-processamento**: `app.defaults.post.addEffect(new Bloom())`. Veja [Pós-processamento](./post_processing.md).
- **UI overlay**: `app.defaults.ui.ui.add(new UiPanel())` + `UiInteractionHandler` para hit-test.
- **Loaders**: `await new GltfLoader().load('/assets/model.glb')` (suporta GLB binário, animações, skinning).
- **Profiling**: `app.defaults.debug.setEnabled(true)` e subscribe ao evento `profilerStats` (FPS, frame time, médias).

## Convenções rápidas

| Padrão | Uso |
|---|---|
| `app.world.insert(entity)` | Adiciona uma entidade. Resources são auto-alocados. |
| `entity.add(part)` | Composição: `BoxGeometry.add(StandardMaterial).add(Transform)`. |
| `app.flows.register(flow)` | Registra um Flow customizado (ex.: `LCPFlow`, `MPMFlow`). |
| `app.events.on('frameTick', ...)` | Subscribe a eventos do GameLoop. |

## Comandos do projeto

```bash
npm run dev          # Vite dev server
npm run build:lib    # Build da lib (ESM + .d.ts)
npm run test         # Vitest unit tests
npm run doc          # TypeDoc → clay-engine-doc/docs/api/
```
