# Quickstart — Cena física com a fachada de autoria (Fase 1)

Demonstra o alvo **SC-001**: a cena do `claflow-web` (chão + plataforma + esfera + bastão rígidos sob
gravidade) **sem** nenhuma menção a `schema`, `data`, `vec4`, `invMass` ou `flows.register`.

## Antes (estado atual — vocabulário de buffer)

```ts
const ball = new SphereGeometry({ radius: 0.4, latSegments: 24, lonSegments: 32 });
ball.add(new StandardMaterial({ albedo: [0.9, 0.25, 0.25, 1], roughness: 0.35 }));
ball.add(new Transform({ position: [-0.4, 4, 0, 1] }));
ball.add(
  new RigidBody({
    schema: LCPSchema,
    data: {
      pos: [-0.4, 4, 0, 1.0],
      rot: [0, 0, 0, 1],
      rot_pred: [0, 0, 0, 1],
      I_inv: [1, 1, 1, 0],
      mat_props: [0.45, 0.3, 0.05, 0.05],
      body_shape: [0, 0.4, 0.4, 0.4],
    },
  }),
);
ball.add(new SphereCollider({ radius: 0.4, center: [0, 0, 0, 1] }));
a.world.insert(ball);
a.flows.register(new LCPFlow(a.core, a.world, a.resources));
```

## Depois (fachada — vocabulário de domínio)

```ts
import { Application, Camera, DirectionalLight, GravityField } from 'webgpu-engine';
import {
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  StandardMaterial,
  RigidBody,
} from 'webgpu-engine';

const a = await Application.create({ canvas });
a.world.insert(new Camera({ aspect: canvas.width / canvas.height }));
a.world.insert(
  new DirectionalLight({ direction: [0.4, -1, 0.6, 0], color: [1, 1, 0.95, 1], castShadow: true }),
);
a.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));

// Chão estático (plano)
const floor = new RigidBody({ shape: 'plane', normal: [0, 1, 0], offset: -0.5, friction: 0.9 });
floor.add(new PlaneGeometry({ size: [12, 12] }));
floor.add(new StandardMaterial({ albedo: [0.35, 0.35, 0.4, 1], roughness: 0.95 }));
a.world.insert(floor);

// Plataforma estática (caixa)
const platform = new RigidBody({
  shape: 'box',
  static: true,
  halfExtents: [1.5, 0.15, 1.5],
  position: [0, 0, 0],
  friction: 0.7,
});
platform.add(new BoxGeometry({ size: [3, 0.3, 3] }));
platform.add(new StandardMaterial({ albedo: [0.55, 0.4, 0.25, 1], roughness: 0.7 }));
a.world.insert(platform);

// Esfera dinâmica
const ball = new RigidBody({
  shape: 'sphere',
  position: [-0.4, 4, 0],
  mass: 1,
  radius: 0.4,
  friction: 0.3,
  restitution: 0.45,
});
ball.add(new SphereGeometry({ radius: 0.4, latSegments: 24, lonSegments: 32 }));
ball.add(new StandardMaterial({ albedo: [0.9, 0.25, 0.25, 1], roughness: 0.35 }));
a.world.insert(ball);

// Bastão dinâmico
const bat = new RigidBody({
  shape: 'box',
  position: [0.6, 5.5, 0],
  mass: 1.25,
  halfExtents: [0.075, 0.75, 0.075],
  restitution: 0.3,
});
bat.add(new BoxGeometry({ size: [0.15, 1.5, 0.15] }));
bat.add(new StandardMaterial({ albedo: [0.85, 0.75, 0.4, 1], roughness: 0.4 }));
a.world.insert(bat);

a.start(); // LCPFlow auto-registrado na 1ª inserção de um corpo LCP
```

## Verificação (mapeia para Success Criteria)

- **SC-001/002/003**: nenhuma ocorrência de `schema`, `data`, `vec4`, `invMass`, `flows.register` acima.
- **SC-004**: criar `RigidBody.sphere({...})` tem a mesma altitude de `new SphereGeometry({...})`.
- **SC-006**: comportamento da simulação idêntico ao `claflow-web` atual (mesmo `Resource` produzido).

> A colisão (`SphereCollider`/`BoxCollider`/`PlaneCollider`) é anexada automaticamente pela factory; o usuário
> não declara colisor separado para as formas primitivas. Geometria/Material (render) seguem como hoje.
