# Data Model — 011 HDR e materiais físicos por nós

## Resources novos e alterados

| Entidade                                    | Camada | Dados (domínio)                                                                                               | GPU                                                                                                       |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `FrameTargets` (alterado)                   | C4     | `samples` (1/4)                                                                                               | `color`, `samples` em `rgba16float`; novos `sceneCopy` (`rgba16float`, mips) e `transmissionDepth`        |
| `ToneMapping` (alterado: vira apresentação) | C4     | `operator` (`agx`/`aces`/`neutral`/`linear`), `exposure` (EV), `dither`, `output` (`sdr`/`hdr`)               | uniform `PresentationParams`                                                                              |
| `StandardMaterial` (inalterado)             | C3     | `albedo`, `roughness`, `metallic` — as constantes do fechamento pronto e as entradas padrão dos nós           | pool `StandardMaterial` (o mesmo)                                                                         |
| `MaterialFunction` (alterado)               | C3     | código ou grafo (031); retorno `SurfaceParams` (009) ou `Closure` (011); `lobes` declarados no código         | registro tipado da forma (031); máscara de lobos na chave do pipeline                                     |
| `Light` (alterado)                          | C3     | + `innerCone`, `outerCone` (spot)                                                                             | `Light.schema` + `cones: vec4f`                                                                           |
| `SpotLight` (novo)                          | C3     | posição, direção, cor, intensidade (cd), alcance, cones interno/externo                                       | pool `Light` (`kind = 2`); contribuição ao ponto `scene_lighting`                                         |
| `DirectionalLight`, `PointLight` (alterado) | C3     | cor e intensidade passam a ser lidas                                                                          | contribuição ao ponto `scene_lighting` (a `DirectionalLight` com `ShadowMap` também a `light_visibility`) |
| `HemisphereLight` (novo)                    | C3     | `skyColor`, `groundColor`, `intensity`, `up`                                                                  | singleton (uniform); contribuição ao ponto `scene_lighting`                                               |
| `PbrTables` (novo)                          | C3     | nenhum (gerado)                                                                                               | textura `rg16float` 32×32 (DFG + sheen), gerada em compute no primeiro quadro                             |
| `FluidSurfaceMaterial` (alterado)           | C3     | + `roughness`; `ambient`, `shininess`, `reflectivity` obsoletos (aviso; `shininess` → rugosidade equivalente) | schema com `roughness`                                                                                    |
| `WaterSurface` (alterado)                   | C4     | `lightSize` padrão 1024; `causticGrid` (vértices por eixo, padrão 2 × `lightSize`)                            | vista `background` removida (usa `FrameTargets.sceneCopy`); buffer de vértices da malha de cáusticas      |

## Nós novos (C3, `nodes.*`)

| Grupo        | Nós                                                                                                    | Saída / lobos                          |
| ------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `bsdf.*`     | `diffuse`, `conductor`, `dielectric`, `transmission`, `translucent`, `sheen`, `subsurface`, `emission` | `Closure`; declaram o lobo produzido   |
| `closure.*`  | `mix`, `add`, `layer`, `thinFilm`, `opacity`, `normal`                                                 | `Closure`; uniões dos lobos de entrada |
| `geometry.*` | `tangentUv` (só `fragment`)                                                                            | `vec3f`                                |
| `color.*`    | `rgb`, `hsv`, `temperature` (K → RGB linear), `luminance`, `ramp` (o atual, movido se já existir)      | `vec3f`/`f32`                          |
| `output.*`   | + `closure`                                                                                            | `Closure`                              |
| `material.*` | `openpbr` e os 23 materiais prontos (R11) — sub-grafos de ponto com parâmetros expostos                | `Closure`                              |

## Structs WGSL

- `SurfaceParams` — inalterado (009).
- `Closure` — novo: lobos com peso (difuso, especular de base, especular de cima, sheen, transmissão, subsurface),
  emissão, opacidade, normais (base e de cima), tangente e anisotropia do especular, filme fino.
- `ForwardFrameParams` — + `lightCount`.
- `PresentationParams` — operador, exposição linear (2^EV), pontilhamento, saída, amostras.

## Pontos de cena (C3, 031)

- `scene_lighting(c: Closure, p, n, v) -> vec3f` — soma das contribuições (direcional, pontual, spot, hemisfério);
  pronto: zero.
- `light_visibility(light: u32, p, n_dot_l) -> f32` — produto; a `ShadowMap` da luz que projeta; pronto: 1.
- `light_transmission(light: u32, p) -> vec3f` — produto; a água (cáusticas, absorção); pronto: 1.
- Saem: `scene_light_direction`, `scene_any_light_direction` e o `light_transmission(p, ambiente, direta)` antigo.

## Estados e transições

- Máscara de lobos: derivada na compilação do grafo (lobos declarados pelos nós presentes) ou dos `lobes` da função de
  código; muda a chave do pipeline → outra variante preparada em transição (como a topologia); valores não recompilam.
- Transmissivo: máscara com transmissão ou opacidade → o grupo vai ao passe de transmissivos (duas camadas).
- `PbrTables`: `Uninitialized` → gerada no primeiro `framePrepare` → `Ready` (nunca regenerada).
- Apresentação: `output: 'hdr'` sem suporte → `sdr` + evento `presentationFallback`.

## Validação

- IOR ≥ 1; rugosidades e pesos em [0, 1]; espessura do filme em [0, 2000] nm; Abbe ≥ 10 (ou 0 = sem dispersão); cones
  0 < interno ≤ externo ≤ π/2 (interno > externo corrigido com aviso). Nos nós, a validação é no WGSL (`clamp`), já que os
  valores podem vir do grafo.
- Não finitos do fechamento: saneados na avaliação (NaN → lobo desligado; emissão limitada ao máximo do formato).
