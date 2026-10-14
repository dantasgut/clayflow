# Quickstart: pontos de extensão

```ts
import { FieldType, TransformFunction, Transform, Entity } from 'clayflow';

const orbit = new TransformFunction({
  params: { radius: FieldType.f32, period: FieldType.f32 },
  values: { radius: 2, period: 4 },
  code: /* wgsl */ `
fn transform_fn(slot: u32, t: Transform, data: OrbitParams, time: f32) -> mat4x4f {
    let a = 6.2831853 * (time / data.period + f32(slot) * 0.01);
    var m = transform_local(t).world;
    m[3] = vec4f(data.radius * cos(a), t.position.y, data.radius * sin(a), 1.0);
    return m;
}`,
});
app.world.insert(new Entity([new Transform(), mesh, material, orbit]));

app.world.events.on('extensionRejected', (e) => console.warn(e.point, e.line, e.message));
orbit.code = novoCodigo; // troca em execução (compila em segundo plano)
orbit.values.radius = 3; // parâmetro: quadro seguinte, sem recompilar
```

Verificar: `npm run smoke -- extensionPoints` (e `--dist`); `npm run ci`; `npm run bench:check`.
