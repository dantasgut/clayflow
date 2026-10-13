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
    Application, OrbitController,
} from 'webgpu-engine';
import {
    BoxGeometry, Camera, DirectionalLight, Parent, PlaneGeometry,
    StandardMaterial, Transform,
} from 'webgpu-engine';

const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
const dpr = window.devicePixelRatio || 1;
canvas.width = Math.floor(canvas.clientWidth * dpr);
canvas.height = Math.floor(canvas.clientHeight * dpr);

const app = await Application.create({ canvas });

// Câmera = parâmetros (Camera) + posição/orientação (Transform); o controller é componente da mesma entidade
// e muta o Transform a cada quadro com o `app.input` da cena. As matrizes são calculadas na GPU.
app.world.insert(
    new Camera({ fov: Math.PI / 4 }) // aspectMode 'canvas': acompanha o canvas
        .add(new Transform({ position: [0, 3, 6, 1], rotation: Transform.lookRotation([0, 3, 6], [0, 0.5, 0]) }))
        .add(new OrbitController({
            target: [0, 0.5, 0], distance: 6,
            autoRotate: true, autoRotateSpeed: 0.4,
            damping: 0.85,
        })),
);

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

## Câmera, entrada e controllers

- **Câmera** = `Camera` (projeção: `fov`, `orthoHeight`, `near`, `far`, `projection: 'perspective' | 'orthographic'`)
  mais um `Transform` na mesma entidade (obrigatório; a câmera olha para −Z local; `Transform.lookRotation(olho, alvo)`
  mira um ponto). Com `aspectMode: 'canvas'` (padrão) a razão acompanha o canvas; com `'fixed'` vale `aspect`. View,
  projection e viewProjection saem do `CameraFlow` (fase `transform`, na GPU) — nenhuma matriz de câmera na CPU.
- **Entrada** = `app.input` (`Input`, um Resource da cena): consulta (`isKeyDown('KeyW')`, `isButtonDown('left')`,
  `pointerPosition()`, `pointerDelta()`, `wheelDelta()`, `gamepadAxis(…)`; estado cru em `input.current`) e eventos no
  barramento (`keyDown`, `keyUp`, `pointerDown`, `pointerUp`, `pointerMove`, `wheel`).
- **Controllers** — `OrbitController`, `FlyController`, `FpsController` (todos estendem `InputDrivenController`):
  componentes da entidade da câmera; o `app.interaction` chama `tick(input, dt, transform)` a cada quadro e eles só
  mutam `position`/`rotation` do `Transform`. Um controller próprio estende `InputDrivenController` e implementa `tick`.

## Hierarquia (`Parent`)

Um objeto segue outro com `Parent(idDoPai)`: a matriz de mundo do filho é a do pai (já composta no mesmo quadro)
composta com a local dele, por níveis, na GPU. Sem nenhum `Parent`, a composição é um passe só.

```typescript
const arm = app.world.insert(
    new BoxGeometry().add(new StandardMaterial()).add(new Transform({ position: [0, 1, 0, 1] })),
);
app.world.insert(
    new BoxGeometry().add(new StandardMaterial()).add(new Transform({ position: [1, 0, 0, 1] })).add(new Parent(arm)),
);
```

Regras: pai sem `Transform`, ciclo ou `Parent` num corpo rígido dinâmico (pose escrita pela física) são erro com as
entidades nomeadas; pai removido torna o filho raiz (matriz de mundo = local) com aviso; para trocar de pai, remova e
reinsira a entidade com outro `Parent`.

## Mover e animar objetos

O `Transform` guarda a **intenção** de posicionamento — `position`, `rotation` (quaternion) e `scale`. Depois de
inserir a entidade, basta mudar o `data`: a mudança aparece no quadro seguinte, sem nenhuma chamada extra.

```typescript
const t = new Transform({ position: [2, 0, 0, 1], scale: [1, 2, 1, 1] });
cube.add(t);
app.world.insert(cube);

app.events.on('frameTick', ({ elapsed }) => {
  t.data.position[1] = Math.sin(elapsed); // componente
  // ou: t.data.position = [x, y, z, 1];   // campo inteiro
});
```

A matriz de mundo é calculada na GPU pelo `TransformFlow` (fase `transform`) a cada mudança; vale o mesmo para
qualquer recurso (ex.: `material.data.albedo[0] = 1`). Dados em `Float32Array`/`Uint16Array` (vértices, índices)
são rastreados quando o campo é reatribuído.

## Tempo, passo fixo e avanço sem laço

`app.time` governa a simulação. A física avança em passos fixos (`fixedDt`, default 1/60 s) com acumulador: o
resultado é o mesmo a 30, 60 ou 144 Hz. `scale` muda a velocidade de tudo; `pausePhysics()` para só a física.

```typescript
app.time.scale = 0.25;            // câmera lenta
app.time.pausePhysics();          // física parada, desenho continua
app.time.fixedDt = 1 / 120;       // passo fixo menor (mais preciso)
app.events.on('timeDropped', ({ dropped }) => console.warn(`quadro lento: ${dropped}s descartados`));

// Sem laço (testes, pré-cálculo, captura): 300 quadros de 1/60 s
app.step(1 / 60, 300);
```

## Dispositivo e capacidades

```typescript
const app = await Application.create({
  canvas,
  device: { powerPreference: 'high-performance', optionalFeatures: ['timestamp-query'] },
});
console.log(app.capabilities.adapter.description, app.capabilities.limits.maxStorageBufferBindingSize);
```

Features obrigatórias ausentes (`requiredFeatures`) falham na criação com mensagem que nomeia a feature; desejadas
ausentes aparecem em `app.capabilities.missingFeatures`. O motor pede os limites de que precisa no máximo do adaptador.

## Próximos passos

- **Adicionar física**: crie bodies em vocabulário de domínio — `new RigidBody({ shape: 'sphere', radius: 0.4, mass: 1 })`, `new SoftBody({ algorithm: 'XPBD', position, mass })`, `new FluidBody({ algorithm: 'MPM', position })` — e `app.world.insert(body)`. O Flow do algoritmo já está registrado por factory e a C2 o instancia quando o primeiro body do tipo entra (sem `flows.register` manual). Veja [Physics Flows](./physics_flows.md).
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
| `app.events.on('frameTick', ...)` | Subscribe ao quadro (`{ dt, realDt, elapsed, frame }`). |
| `app.step(dt?, frames?)` | Avança quadros sem o laço (testes, headless). |
| `app.time` | Escala, pausa e passo fixo da simulação. |
| Uma instância por objeto | Inserir a mesma instância duas vezes lança `ReuseError` — crie outra. |

## Comandos do projeto

```bash
npm run dev          # Vite dev server
npm run build:lib    # Build da lib (ESM + .d.ts)
npm run test         # Vitest unit tests
npm run doc          # TypeDoc → clay-engine-doc/docs/api/
```
