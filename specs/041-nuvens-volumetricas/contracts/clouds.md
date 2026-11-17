# Contrato: API pública das nuvens volumétricas (spec 041)

Tudo é aditivo: nenhuma assinatura existente muda. Exportado pelo índice de `elements/media` e pelo índice principal.

## `CloudLayer`

```ts
export interface CloudLayerValues {
  /** Altitude da base da camada (m acima do chão). Default 1500. */
  readonly base?: number;
  /** Altitude do topo (m acima do chão; > base). Default 4000. */
  readonly top?: number;
  /** Cobertura: número em [0, 1] (todo o céu) ou função (grafo de nós ou WGSL) da posição e do tempo. Default 0,5. */
  readonly coverage?: number | CloudCoverageOptions;
  /** Tipo em [0, 1]: 0 estrato, 0,5 cúmulo, 1 cúmulo-nimbo (contínuo). Default 0,5. */
  readonly type?: number;
  /** Extinção (1/m) na densidade 1. Default 0,04. */
  readonly density?: number;
  /** Albedo de espalhamento em [0, 1]. Default 0,99. */
  readonly albedo?: number;
  /** Diâmetro médio das gotículas (µm, 5–50): a fase de Mie aproximada (Jendersie & d'Eon 2023). Default 20. */
  readonly dropletDiameter?: number;
  /** Vento horizontal (m/s, [x, z] do mundo). Default [5, 0]. */
  readonly wind?: readonly [number, number];
  /** Forma: grafo de nós ou WGSL do ponto `cloud_shape`. Default: o grafo de Perlin-Worley da biblioteca. */
  readonly shape?: CloudShapeOptions;
  /** Metros por período do volume de forma. Default 12000. */
  readonly shapeScale?: number;
  /** Metros por período do volume de detalhe. Default 1800. */
  readonly detailScale?: number;
}

/**
 * Camada de nuvens volumétricas (Camada 3, spec 041): um meio participante entre duas altitudes sobre o planeta do
 * `Sky`, desenhado pela transferência radiativa (marcha em resolução reduzida com reconstrução temporal), com
 * autossombra, espalhamento múltiplo e fase de Mie; faz sombra na cena (`light_transmission`), entra no céu dos raios
 * que escapam (`sky_cover` → `scene_environment`) e na composição da tela atrás da névoa. Exige um `Sky` na cena.
 * Mudar valores vale no quadro seguinte sem recompilar; mudar a forma refaz os volumes de ruído na GPU.
 */
export class CloudLayer extends Entity<CloudLayerData> implements Resource {
  constructor(values?: CloudLayerValues);
  // getters/setters de todos os campos de CloudLayerValues
}
```

Erros: `RangeError` para `top ≤ base`, cobertura/tipo/albedo fora de [0, 1], `dropletDiameter` fora de [5, 50],
valores não finitos. Sem `Sky` na cena: aviso único (`consumerMissing`, a prontidão da 034) e nada é desenhado.

## Funções de extensão

```ts
/** `fn shape_fn(p: vec3f, data: ShapeFnParams) -> vec4f` — p em [0, 1)³ do volume periódico. */
export class CloudShapeFunction extends ExtensionFunction {}
/** `fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f` — cobertura, tipo, densidade relativa. */
export class CloudCoverageFunction extends ExtensionFunction {}
export type CloudShapeOptions = ExtensionFunctionOptions;
export type CloudCoverageOptions = ExtensionFunctionOptions;
```

Grafos de nós valem nos dois (como em `DensityFunction`). O grafo de forma deve usar ruídos com `period` para o
volume ladrilhar; sem `period`, aviso na composição (costura visível).

## Nós de ruído

Parâmetro novo `period` (u32, 0 = sem período) em `noise.gradient2/3`, `noise.value2/3`, `noise.fbm2/3` e
`noise.cellular3`: o reticulado e as células com módulo `period` (em unidades de `p · scale`); a saída é periódica
com período `period / scale`. Mesma semente e período, mesma saída na GPU e na referência u32.

## Pontos de cena

```wgsl
// Novo: o que cobre o céu numa direção (composição "na frente de", como scene_fog).
fn sky_cover(dir: vec3f) -> vec4f   // rgb: luz espalhada; a: transmitância
```

`Sky` → `scene_environment(dir) = sky_radiance(dir) · sky_cover(dir).a + sky_cover(dir).rgb` quando há contribuinte;
sem contribuinte, `sky_radiance(dir)` como hoje.

## Perspectiva aérea (mudança de comportamento do `Sky`)

Com um `Sky` na cena, toda a geometria passa a receber a atmosfera entre a câmera e ela (luz espalhada e transmitância
pela tabela 32³ de Hillaire 2020), com ou sem `CloudLayer`, aplicada na composição da tela (`SkyCompositeFlow`). Nenhuma
assinatura muda; a imagem das cenas ao ar livre muda (a geometria a quilômetros esmaece e azula; a de metros, quase
nada). As referências de imagem afetadas são regravadas e relatadas.

## Perfis do `Renderer`

`RENDER_PROFILES[profile].clouds`: `{ steps, lightSteps, octaves, panorama: [w, h], shadow: { size, extent },
coverageExtent }` (valores em [research.md R15](../research.md)). Os tetos de custo são do perfil; a `CloudLayer` só descreve o meio.

## Eventos

Nenhum evento novo de autoria. A camada usa os da C2: mudança de slot (revisão das funções → volumes refeitos),
prontidão (`whenReady` espera os volumes completos) e invalidação do canal temporal (corte de câmera, perfil).
