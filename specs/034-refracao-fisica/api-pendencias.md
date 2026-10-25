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

## Terminologia nas mensagens e na documentação

"Material" fica reservado para a aparência (o grafo de fechamentos: cor, reflexo, rugosidade, transmissão,
translucidez, deslocamento); atrito, restituição, viscosidade e coesão são parâmetros de física. "Textura" fica reservada para imagem aplicada em superfície (um bitmap). Os resultados de cálculo guardados por pixel
a cada quadro (`radiance`, `hit`, `gradient`, os alvos do filtro) são "alvos por pixel" ou "resultados por pixel":
estado físico recalculado a cada quadro, nunca imagem pronta.
