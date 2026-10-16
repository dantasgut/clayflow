# Contrato: HDR, apresentação, luzes e material em camadas

## Autoria (TypeScript)

```ts
// Apresentação (um por cena, nos estágios padrão; `defaults.presentation`)
defaults.presentation.set({
  operator: 'agx', // 'agx' | 'aces' | 'neutral' | 'linear'
  exposure: 0, // EV (0 = ×1; +1 dobra)
  dither: true,
  output: 'sdr', // 'hdr': saída estendida quando o navegador e a tela suportam
});

// Luzes
new DirectionalLight({ direction: [0.4, -1, 0.6], color: [1, 0.97, 0.9, 1], intensity: 3 }); // lux
new PointLight({ position: [0, 2, 0], color: [1, 0.6, 0.3, 1], intensity: 40, range: 8 }); // candela
new SpotLight({ position, direction, intensity: 200, range: 15, innerCone: 0.3, outerCone: 0.5 }); // rad
defaults.ambient.set({
  skyColor: [0.6, 0.7, 0.9, 1],
  groundColor: [0.25, 0.2, 0.15, 1],
  intensity: 1,
});

// Material em camadas (OpenPBR; tudo opcional, neutro por padrão)
new StandardMaterial({
  albedo: [0.8, 0.1, 0.1, 1],
  roughness: 0.4,
  metallic: 0.9,
  coatWeight: 1,
  coatRoughness: 0.03,
  coatIor: 1.5, // pintura de carro
});
new StandardMaterial({
  transmissionWeight: 1,
  ior: 1.52,
  dispersionAbbe: 58,
  thickness: 0.02,
  roughness: 0,
}); // vidro
new StandardMaterial({ fuzzWeight: 1, fuzzColor: [0.5, 0.1, 0.2, 1], fuzzRoughness: 0.5 }); // veludo
new StandardMaterial({ metallic: 1, roughness: 0.35, anisotropy: 0.8, anisotropyFrame: 'uv' }); // escovado
new StandardMaterial({ thinFilmWeight: 1, thinFilmThickness: 400, thinFilmIor: 1.33 }); // bolha
new StandardMaterial({
  subsurfaceWeight: 1,
  subsurfaceColor: [0.9, 0.6, 0.5, 1],
  subsurfaceRadius: 0.01,
}); // pele
new StandardMaterial({ emissionColor: [1, 0.8, 0.5, 1], emissionLuminance: 500 }); // nits

// Biblioteca
Materials.WOOD_VARNISHED_GLOSS({ coatColor: [1, 0.85, 0.6, 1] });
Materials.CAR_PAINT({ albedo: [0.05, 0.1, 0.5, 1] });

// Função material com camadas (011) — ou a assinatura da 009, que continua válida
new MaterialFunction({
  layers: ['coat'], // camadas que a função pode ligar (entram na especialização)
  code: /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: P) -> SurfaceLayers {
    var l = material_layers_default(m);
    l.coat_weight = smoothstep(0.0, 0.5, s.curvature.y);
    return l;
}`,
});
```

Eventos: `presentationFallback { requested: 'hdr', reason }`; `lightLimit { count, limit: 1024 }` (uma vez);
obsolescência de `FluidSurfaceMaterial.{ambient,shininess,reflectivity}` por aviso único.

## WGSL (biblioteca, um símbolo por módulo)

```wgsl
// pbr.wgsl
fn pbr_d_ggx(n_dot_h: f32, a2: f32) -> f32
fn pbr_d_ggx_aniso(h_t: f32, h_b: f32, n_dot_h: f32, at: f32, ab: f32) -> f32
fn pbr_v_smith_correlated(n_dot_v: f32, n_dot_l: f32, a2: f32) -> f32
fn pbr_f_schlick(f0: vec3f, f90: vec3f, cos_t: f32) -> vec3f
fn pbr_f0_from_ior(ior: f32) -> f32
fn pbr_d_charlie(n_dot_h: f32, r: f32) -> f32
fn pbr_thin_film(cos_t: f32, thickness_nm: f32, film_ior: f32, base_f0: vec3f) -> vec3f
fn pbr_specular_aa(a2: f32, n: vec3f) -> f32          // usa dpdx/dpdy da normal
fn pbr_shade(l: SurfaceLayers, n: vec3f, v: vec3f, light_dir: vec3f, radiance: vec3f) -> vec3f
fn pbr_ambient(l: SurfaceLayers, n: vec3f, v: vec3f, hemi: HemisphereLight) -> vec3f

// lighting.wgsl (laço do pool, atenuação, cones, sombra da luz que projeta)
fn lighting_eval(l: SurfaceLayers, p: vec3f, n: vec3f, v: vec3f) -> vec3f

// present.wgsl
fn tonemap_agx(c: vec3f) -> vec3f
fn tonemap_aces(c: vec3f) -> vec3f
fn tonemap_neutral(c: vec3f) -> vec3f
fn present_dither(c: vec3f, pixel: vec2u) -> vec3f
fn srgb_encode(c: vec3f) -> vec3f
```

## Garantias

- Nenhum valor é cortado em [0, 1] antes da apresentação; NaN/∞ não chegam ao alvo HDR (saneados no `material_eval`
  e na saída do sombreamento).
- Um material com os valores padrão e sem função dá o mesmo pipeline especializado que hoje dá o `StandardMaterial`
  (só base + especular).
- Funções `material` da 009 (`-> SurfaceParams`) compilam e desenham sem mudança.
- Trajetórias físicas idênticas, bit a bit.
- Nada lido de volta por quadro; as medidas de imagem leem só nos smokes.
