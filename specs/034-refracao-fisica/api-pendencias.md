# Pendências de API para desenvolvedores — refração e antisserrilhado (spec 034)

Levantadas em 2026-10-23, na revisão da T044a. Nenhuma foi implementada; cada uma espera ordem do usuário.

## 1. Fachada de autoria para vidro

- **Hoje**: o `StandardMaterial` não tem transmissão. Vidro só sai escrevendo WGSL numa `MaterialFunction`
  (`closure_add(closure_dielectric(...), closure_transmission(...))`, como fazem os smokes) ou montando um grafo com o
  nó OpenPBR.
- **Por que importa**: a constituição (princípio II) exige uma fachada de autoria por família de elementos, no
  vocabulário do domínio.
- **Proposta**: uma fachada como `new GlassMaterial({ ior, color, roughness, dispersion, thinWalled })`, com absorção
  por profundidade e número de Abbe em unidades documentadas, montando a `Closure` por baixo.

## 2. Parede fina não chega pelo OpenPBR

- **Hoje**: `geometry_thin_walled` do nó OpenPBR liga a `bsdf.translucent`, não à parede fina física da refração
  (`closure_thin_walled`: reflete com 2R/(1 + R), atravessa sem desviar, não muda a pilha de meios).
- **Efeito**: quem usa o nó não consegue a vidraça física.
- **Proposta**: ligar `geometry_thin_walled` à parede fina quando houver transmissão; manter o translúcido para o
  caso difuso.

## 3. Guia de uso

- **Hoje**: não há página em `clay-engine-doc/docs/guides` para a refração traçada nem para o antisserrilhado.
- **Falta explicar**: `Refraction` (`enabled`, `maxInterfaces`), `TracedDenoiser` (`enabled`, `maxHistory`),
  `TemporalAntialiasing` (modos), o significado e as unidades de `transmission_depth` e `abbe`, a prioridade de meio,
  a parede fina e o que muda com e sem a luz global.

## 4. Nome `defaults.denoiser`

- **Hoje**: `defaults.denoiser` é o filtro do sinal traçado da refração; o nome não diz o que filtra.
- **Proposta**: `defaults.refractionDenoiser`, deixando espaço para outros filtros (reflexos traçados, luz global).
- **Resolvido na 037 (T034)**: o filtro virou o acumulador temporal de pixel genérico, `TemporalFilter`
  (`defaults.temporalFilter`, ponto `temporal_filter_source`): o nome diz o que ele é, e outro sinal traçado usa o mesmo
  recurso pelo ponto da fonte.

## 5. `ParticleMaterial` não é material

- **Hoje (até 2026-10-25)**: o recurso com densidade de repouso, viscosidade, restituição, coesão, adesão e o domínio
  dos corpos de partículas chamava-se `ParticleMaterial` — nome de material de render para parâmetros de física.
- **Resolvido em 2026-10-25 (decisão do usuário)**: `ParticlePhysics` (`src/elements/physics/ParticlePhysics.ts`), como
  o painel Physics das configurações de partículas do Blender; slot `physics` nos Flows de física (`SPHFlow`, `PBFFlow`,
  `MPMFlow`, `DiffuseFlow`, `SoftEnergyFlow`; `particlePhysics` no `FluidFieldFlow`) e consumidor `physics`. Continua Resource: o dado que os Flows da
  simulação leem. Sem apelido do nome antigo: a troca quebra a compatibilidade da API (quem usa o motor troca o nome).

## 6. Retirada do `FluidSurfaceMaterial` (T066)

- **Até 2026-10-27**: a água dos corpos de partículas era o `FluidSurfaceMaterial` (spec 017), um material próprio com
  parâmetros paralelos aos do dielétrico, desenhado por estágios próprios (a composição na tela e as cáusticas da 017).
- **Resolvido em 2026-10-27 (decisão do usuário de 2026-10-25: água e vidro são o mesmo tipo de material)**: a água é
  um `FluidBody` com uma função `material` (o grafo) e sem material de desenho; o campo dos fluidos dá a superfície e a
  refração a traça como o vidro. Sem apelido — quebra a compatibilidade da API. Saíram: `FluidSurfaceMaterial`
  (`FluidSurfaceMaterialData`, `FluidSurfaceMaterialOptions`), `WaterSurface` (`WaterSurfaceOptions`), `WaterFlow`,
  `FluidFieldPassFlow`, `CausticsFlow` (e os tipos de slots e opções deles) e `defaults.flows.fluidSurface`,
  `fluidLightSurface`, `caustics` e `water`.
- **Correspondência dos parâmetros** (o grafo: `bsdf.dielectric` + `bsdf.transmission` somados por `closure.add`):
  `ior` → o `ior` dos dois nós; `abbe` → `bsdf.transmission.abbe`; `absorption` (por metro) →
  `bsdf.transmission.color` = exp(−absorção) com `depth` 1; `roughness` → `bsdf.dielectric.roughness`;
  `rippleStrength`/`rippleSize`/`rippleSpeed` → o nó `surface.ripple` (`strength`, `size`, `speed`) ligado ao
  `closure.normal`; `caustics`/`causticIntensity` → o recurso `Caustics` (T067c: `enabled`, `photons`,
  `cellSize`; entra sozinho com o primeiro material transmissivo; a intensidade não tem sucessor — a física dá); `color` (o espalhamento interno) → o
  meio do grafo com espalhamento (T067c). Sem sucessor (a física e o traçado dão o efeito): `thicknessScale`,
  `refraction`, `particleRadius`, `smoothingRadius`, `depthThreshold`, `ambient`, `reflectivity`, `shininess`.

## Cáusticas fora da luz global (T067c)

- **Quebra**: `GlobalIllumination` perdeu as opções `caustics` e `photons` (e o descritor `caustics`); as cáusticas
  são o recurso próprio `Caustics` (`enabled`, padrão ligado; `photons`, padrão 65 536 por quadro; `cellSize`, padrão
  1 cm), inserido pelos estágios padrão com o primeiro material transmissivo (vidro, água), com ou sem a luz global.
  Para desligar: `world.findResource(Caustics.schema, Caustics).enabled = false` (ou inserir `new Caustics({ enabled:
false })` antes da água). Falta no guia.

## Terminologia nas mensagens e na documentação

"Material" fica reservado para a aparência (o grafo de fechamentos: cor, reflexo, rugosidade, transmissão,
translucidez, deslocamento); atrito, restituição, viscosidade e coesão são parâmetros de física. "Textura" fica reservada para imagem aplicada em superfície (um bitmap). Os resultados de cálculo guardados por pixel
a cada quadro (`radiance`, `hit`, `gradient`, os alvos do filtro) são "alvos por pixel" ou "resultados por pixel":
estado físico recalculado a cada quadro, nunca imagem pronta.
