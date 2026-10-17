# Contrato: HDR, apresentação, luzes e materiais por nós

## Autoria (TypeScript)

```ts
// Apresentação (um por cena, nos estágios padrão; `defaults.presentation`)
defaults.presentation.set({
  operator: 'agx', // 'agx' | 'aces' | 'neutral' | 'linear'
  exposure: 0, // EV (0 = ×1; +1 dobra)
  dither: true,
  output: 'sdr', // 'hdr': saída estendida quando o navegador e a tela suportam
});

// Luzes (contribuem pelo ponto de cena `scene_lighting`; o desenho não as conhece)
new DirectionalLight({ direction: [0.4, -1, 0.6], color: [1, 0.97, 0.9, 1], intensity: 3 }); // lux
new PointLight({ position: [0, 2, 0], color: [1, 0.6, 0.3, 1], intensity: 40, range: 8 }); // candela
new SpotLight({ position, direction, intensity: 200, range: 15, innerCone: 0.3, outerCone: 0.5 }); // rad
defaults.ambient.set({
  skyColor: [0.6, 0.7, 0.9, 1],
  groundColor: [0.25, 0.2, 0.15, 1],
  intensity: 1,
});

// Material como grafo de nós BSDF: madeira com verniz, o verniz mais áspero onde o ruído é alto
const varnished = new NodeGraph({
  nodes: {
    s: nodes.input.surfaceSample(),
    wood: nodes.bsdf.diffuse.with({ color: [0.45, 0.28, 0.15] }),
    n: nodes.noise.gradient3.with({ scale: 6 }),
    r: nodes.map.range.with({ in_min: -1, in_max: 1, out_min: 0.02, out_max: 0.2 }),
    coat: nodes.bsdf.dielectric.with({ ior: 1.5 }),
    l: nodes.closure.layer.with({ top_color: [1, 0.85, 0.6] }),
    out: nodes.output.closure,
  },
  links: [
    ['s.world_position', 'n.p'],
    ['n.value', 'r.x'],
    ['r.value', 'coat.roughness'],
    ['coat.value', 'l.top'],
    ['wood.value', 'l.base'],
    ['l.value', 'out.closure'],
  ],
  output: 'out.value',
});
entity.add(new MaterialFunction({ graph: varnished }));

// OpenPBR é um sub-grafo da biblioteca (todos os parâmetros expostos)
const paint = new NodeGraph({
  nodes: {
    p: nodes.material.openpbr.with({ base_metalness: 0.9, coat_weight: 1, coat_roughness: 0.03 }),
    out: nodes.output.closure,
  },
  links: [['p.value', 'out.closure']],
  output: 'out.value',
});

// Biblioteca: material pronto inteiro, ou como nó num grafo maior
entity.add(Materials.woodVarnishedGloss({ coat_color: [1, 0.85, 0.6] })); // → MaterialFunction
const mixed = new NodeGraph({
  nodes: {
    a: nodes.material.woodRaw,
    b: nodes.material.metalBrushed,
    m: nodes.noise.gradient3.with({ scale: 3 }),
    x: nodes.closure.mix,
    out: nodes.output.closure,
  },
  links: [
    ['a.value', 'x.a'],
    ['b.value', 'x.b'],
    ['m.value', 'x.t'],
    ['x.value', 'out.closure'],
  ],
  output: 'out.value',
});

// Função de código com fechamento (011) — ou a assinatura da 009, que continua válida
new MaterialFunction({
  lobes: ['diffuse', 'specular', 'coat'],
  code: /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: P) -> Closure {
    let base = closure_diffuse(m.albedo.rgb, 0.0);
    let coat = closure_dielectric(1.5, vec3f(1.0), 0.05, 0.0, vec3f(0.0));
    return closure_layer(coat, base, vec3f(1.0), smoothstep(0.0, 0.5, s.curvature.y));
}`,
});
```

Eventos: `presentationFallback { requested: 'hdr', reason }`; `lightLimit { count, limit: 1024 }` (uma vez);
obsolescência de `FluidSurfaceMaterial.{ambient,shininess,reflectivity}` por aviso único; erros de grafo pelos de
sempre (`NodeGraphError`, `extensionRejected`).

## WGSL (biblioteca, um símbolo por módulo)

```wgsl
// bsdf.wgsl — funções físicas
fn bsdf_d_ggx(n_dot_h: f32, a2: f32) -> f32
fn bsdf_d_ggx_aniso(h_t: f32, h_b: f32, n_dot_h: f32, at: f32, ab: f32) -> f32
fn bsdf_v_smith_correlated(n_dot_v: f32, n_dot_l: f32, a2: f32) -> f32
fn bsdf_f_schlick(f0: vec3f, f90: vec3f, cos_t: f32) -> vec3f
fn bsdf_f82(f0: vec3f, tint: vec3f, cos_t: f32) -> vec3f
fn bsdf_f0_from_ior(ior: f32) -> f32
fn bsdf_d_charlie(n_dot_h: f32, r: f32) -> f32
fn bsdf_thin_film(cos_t: f32, thickness_nm: f32, film_ior: f32, base_f0: vec3f) -> vec3f
fn bsdf_specular_aa(a2: f32, n: vec3f) -> f32          // derivadas da normal (fragment)

// closure.wgsl — o fechamento e a composição (os nós chamam estas funções)
struct Closure { … }
fn closure_diffuse(color: vec3f, roughness: f32) -> Closure
fn closure_dielectric(ior: f32, tint: vec3f, roughness: f32, anisotropy: f32, tangent: vec3f) -> Closure
fn closure_mix(a: Closure, b: Closure, t: f32) -> Closure
fn closure_layer(top: Closure, base: Closure, top_color: vec3f, top_weight: f32) -> Closure
fn closure_eval(c: Closure, n: vec3f, v: vec3f, l: vec3f, radiance: vec3f) -> vec3f        // especializado pela máscara
fn closure_ambient(c: Closure, n: vec3f, v: vec3f, sky: vec3f, ground: vec3f, up: vec3f) -> vec3f
fn closure_from_params(p: SurfaceParams) -> Closure                                         // 009 → 011

// Pontos de cena (031): o desenho chama, as luzes contribuem
fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f
fn light_visibility(light: u32, p: vec3f, n_dot_l: f32) -> f32
fn light_transmission(light: u32, p: vec3f) -> vec3f

// present.wgsl
fn tonemap_agx(c: vec3f) -> vec3f
fn tonemap_aces(c: vec3f) -> vec3f
fn tonemap_neutral(c: vec3f) -> vec3f
fn present_dither(c: vec3f, pixel: vec2u) -> vec3f
fn srgb_encode(c: vec3f) -> vec3f
```

## Garantias

- Nenhum valor é cortado em [0, 1] antes da apresentação; NaN/∞ não chegam ao alvo HDR (saneados na avaliação do
  fechamento).
- Entidade sem `MaterialFunction`: o fechamento pronto das constantes do `StandardMaterial` (difuso + especular
  dielétrico/condutor pela metalicidade), um pipeline só com esses lobos.
- Funções `material` da 009 (`-> SurfaceParams`, código ou grafo com `output.surfaceParams`) compilam e desenham sem
  mudança.
- Mudar valores de nós não recompila; mudar a topologia recompila em transição, sem quadro quebrado.
- O forward, os sprites e a água não conhecem nenhuma classe de luz (só os pontos de cena).
- Trajetórias físicas idênticas, bit a bit; nada lido de volta por quadro (as medidas de imagem leem só nos smokes).
