# Quickstart: superfícies paramétricas completas

```ts
import {
  ParametricSurface,
  SurfaceCollider,
  MaterialFunction,
  RigidBody,
  StandardMaterial,
  Transform,
  Entity,
} from 'clayflow';

// Terreno colidível
const terrain = new ParametricSurface({
  preset: 'terrain',
  resolution: [128, 128],
  params: [1.5, 0.4, 5],
});
app.world.insert(
  new Entity([
    terrain,
    new SurfaceCollider({ mode: 'height' }),
    new StandardMaterial(),
    new Transform(),
  ]),
);
app.world.insert(new RigidBody({ shape: 'sphere', radius: 0.3, mass: 1, position: [0, 4, 0] }));

// Toro colidível com malha adaptativa e material por curvatura
const torus = new ParametricSurface({
  preset: 'torus',
  adaptive: { patches: [16, 16], maxLevel: 4 },
});
const byCurvature = new MaterialFunction({
  code: /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: P) -> SurfaceParams {
    let k = clamp(s.curvature.x * 4.0, -1.0, 1.0);
    return SurfaceParams(vec4f(0.5 + 0.5 * k, 0.4, 0.5 - 0.5 * k, 1.0), 0.5, 0.0, vec3f(0.0));
}`,
});
app.world.insert(
  new Entity([
    torus,
    new SurfaceCollider({ mode: 'distance' }),
    new StandardMaterial(),
    byCurvature,
    new Transform(),
  ]),
);
```

Verificar: `npm run smoke -- parametricSurfaces` (e `--dist`); `npm run smoke -- trajectories` (sem regravar);
`npm run bench:check`; `npm run ci`.
