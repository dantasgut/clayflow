# Quickstart: água contínua com cáusticas

```ts
import {
  Application,
  BoxCollider,
  DirectionalLight,
  FluidBody,
  FluidSurfaceMaterial,
  GravityField,
  ParticleMaterial,
} from 'clayflow';

const app = await Application.create({ canvas });
const world = app.world;
world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
world.insert(new ParticleMaterial({ particleSpacing: 0.05 }));
world.insert(new DirectionalLight({ direction: [0.3, -1, 0.2, 0], castShadow: true }));
// tanque: fundo e paredes como BoxCollider + caixas desenhadas com StandardMaterial
world.insert(
  new FluidBody({ algorithm: 'SPH', position }).add(new FluidSurfaceMaterial({ caustics: true })),
);
app.start();
```

- Trocar para sprites: `body.add(new PointSpriteMaterial({ radius }))` no lugar do material de água.
- Desligar as cáusticas: `new FluidSurfaceMaterial({ caustics: false })`.
- Água mais turva: aumentar `absorption`; mais "lisa": aumentar `smoothingRadius`.

## Verificação

```sh
npm run smoke -- fluidSurface            # fixtures por caso
npm run smoke -- fluidSurface --dist
npm run bench -- --scene particles --variant 64k-water --engine clayflow
```
