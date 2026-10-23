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

## Terminologia nas mensagens e na documentação

"Textura" fica reservada para imagem aplicada em superfície (um bitmap). Os resultados de cálculo guardados por pixel
a cada quadro (`radiance`, `hit`, `gradient`, os alvos do filtro) são "alvos por pixel" ou "resultados por pixel":
estado físico recalculado a cada quadro, nunca imagem pronta.
