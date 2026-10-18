# Contrato: refração pela estrutura de raios (034)

## Autoria (sem mudança)

Materiais com transmissão continuam iguais: `closure_transmission(...)`, o sub-grafo OpenPBR (`transmission_weight`,
IOR, Abbe, cor e distância de absorção, parede fina, rugosidade), `FluidSurfaceMaterial` da água. Nenhum parâmetro novo
é obrigatório; `Refraction` é opcional e só ajusta `maxInterfaces`/`roughnessBlur`.

## Garantias

1. A imagem vista através de um material com transmissão é o traçado do raio refratado por pixel de tela — nítida em
   qualquer ampliação; o que está fora do quadro ou encoberto aparece.
2. A superfície atingida recebe `scene_lighting` (o mesmo ponto do desenho) com o material das funções `material` da
   cena; raio que escapa vê o céu (`Sky`) ou o fundo.
3. Interfaces encadeadas até `maxInterfaces`; reflexão interna total reflete; no limite, leitura bicúbica da cópia da
   cena deslocada pela profundidade.
4. Beer-Lambert pela distância real percorrida em cada meio; dispersão por canal (três raios); parede fina sem desvio;
   rugosidade pelo cone em espaço de tela.
5. Cena sem transmissão e sem água: nenhum recurso nem estágio da refração.
6. Sem leitura de volta; despacho indireto pela contagem de pedidos.

## Ordem dos estágios (fase `forward`)

opacos → pedidos de refração (raster das faces da frente com transmissão; água pelo `WaterFlow`) → `RefractionFlow`
(traçado, compute) → desfoque da rugosidade (compute) → composição (transmissão da frente; água) → pós.

## Pontos de cena

- `ray_hit_material` / `ray_hit_closure` (novos nomes de `gi_hit_material` / `gi_hit_closure`).
- `scene_lighting`, `light_transmission`, `scene_fog`: usados no acerto como no desenho.
