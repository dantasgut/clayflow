# Contrato: superfícies colidíveis, geometria diferencial e malha adaptativa

## Autoria (TypeScript, C3)

```ts
// Colisor derivado da superfície
new SurfaceCollider({
  mode: 'height', // gráfico y = h(x, z) no espaço local; 'distance' para superfícies gerais
  resolution: [128, 128], // altura: [nx, nz]; distância: [n, n, n] (padrão 64³)
  margin: 0.01, // folga de contato (m)
  band: 2, // células de folga em volta da caixa (distância)
});

// Geometria diferencial e malha adaptativa
new ParametricSurface({
  preset: 'torus',
  differential: true,
  adaptive: { patches: [16, 16], maxLevel: 4, budget: 200_000, tolerance: 0.002, pixels: 8 },
});

// Segundas derivadas analíticas (opcionais; as três ou nenhuma)
new SurfaceFunction({
  code: /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: P) -> vec3f { ... }
fn surface_du(u: f32, v: f32, time: f32, data: P) -> vec3f { ... }
fn surface_dv(u: f32, v: f32, time: f32, data: P) -> vec3f { ... }
fn surface_duu(u: f32, v: f32, time: f32, data: P) -> vec3f { ... }
fn surface_duv(u: f32, v: f32, time: f32, data: P) -> vec3f { ... }
fn surface_dvv(u: f32, v: f32, time: f32, data: P) -> vec3f { ... }`,
});
```

Eventos: `adaptiveUnavailable { resource, reason }`; rejeições de função seguem `extensionRejected` (009) — o colisor e
a malha mantêm o último resultado válido.

## WGSL

```wgsl
// Material (acréscimos no fim; zeros sem dado diferencial)
struct SurfaceSample {
    world_position: vec3f, normal: vec3f, uv: vec2f, time: f32,
    metric: vec3f,      // E, F, G
    curvature: vec4f,   // K, H, k1, k2
    principal: vec3f,   // direção principal de k1 (mundo); 0 em umbílicos
}

// Fronteira de colisão (módulo surfaceColliderHit; bindings declarados pelo hospedeiro)
fn collider_hit_surface(i: u32, p: vec3f) -> ColliderHit   // dist < 0 dentro/abaixo; normal no mundo
```

Regras da consulta:

- Altura: fora da caixa xz local, ou célula `NO_HEIGHT`, não há contato (`dist = +∞`). Abaixo da superfície,
  `dist < 0` e a normal aponta para cima da superfície: partícula abaixo é empurrada para cima.
- Distância: fora da caixa, `dist` = distância à caixa (≥ 0); dentro, trilinear com o gradiente da grade.
- A cópia lida é `min(collider_step, copies − 1)`.

## Garantias

- Sem `SurfaceCollider` na cena: nenhum kernel novo despachado, laços com zero iterações, ids de par do LCP
  inalterados ⇒ trajetórias bit a bit (FR-006).
- Sem `differential`/`adaptive`: vértice, índices e pipelines do forward/sombra inalterados.
- Nenhuma leitura de volta em quadro (FR-016); contagens da malha adaptativa só na GPU.
- Mesmo tempo de construção por passo ⇒ mesma trajetória a 30/60/144 Hz (FR-015).
