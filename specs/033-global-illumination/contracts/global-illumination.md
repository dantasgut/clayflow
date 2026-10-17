# Contrato: estrutura de raios, céu físico e iluminação global

## Autoria (TypeScript)

```ts
// Céu físico ligado ao sol (a luz direcional da cena)
const sun = new DirectionalLight({
  direction: [0.3, -0.6, 0.4],
  intensity: 100000,
  castShadow: true,
}); // lux
app.world.insert(sun);
app.world.insert(new Sky({ sun, turbidity: 2 }));

// Iluminação global: substitui o hemisfério (os estágios padrão o retiram enquanto ela existir)
const gi = new GlobalIllumination({ quality: 'medium', bounces: 3 });
app.world.insert(gi);
gi.data.bounces = 4; // vale no quadro seguinte, sem recompilar
app.defaults.presentation.data.exposure = -12; // sol físico: exposição de câmera
```

Eventos: `globalIlluminationUnsupported { reason }` (uma vez).

## WGSL (biblioteca)

```wgsl
// ray_scene.wgsl — consulta da estrutura de raios (recursos declarados pelo módulo)
struct RayHit { t: f32, instance: u32, primitive: u32, bary: vec2f, position: vec3f, normal: vec3f, renderable: u32 }
fn ray_scene_hit(origin: vec3f, dir: vec3f, t_max: f32) -> RayHit
fn ray_scene_occluded(origin: vec3f, dir: vec3f, t_max: f32) -> bool

// sky.wgsl
fn sky_radiance(dir: vec3f) -> vec3f
fn sky_sun_transmittance(p: vec3f) -> vec3f

// closure_eval.wgsl (011) — o ambiente geral
fn closure_indirect(c: Closure, n: vec3f, v: vec3f, irradiance: vec3f, specular: vec3f) -> vec3f
```

## Garantias

- A geometria escrita na GPU entra na estrutura de raios sem leitura de volta; trajetórias físicas idênticas bit a bit.
- Os materiais, os nós e os estágios de desenho da 011 não mudam: a luz indireta chega por `scene_lighting`.
- Sem `GlobalIllumination` nem `Sky`, a cena é a da 011.
