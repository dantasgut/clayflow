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
  /**
   * O tempo (R19): o campo de pressão dita a cobertura, o tipo, o topo e o vento das nuvens. Com ele, `coverage`
   * (número), `type` e `top` são o tempo bom; a casca vai da base à tropopausa. Sem ele, a camada de antes.
   */
  readonly weather?: CloudWeatherValues;
}

/** O tempo das nuvens (R19). Leste = +x, norte = −z. */
export interface CloudWeatherSettings {
  /** Latitude (graus, −90 a 90): f = 2Ω sin φ e o sentido do giro. Default 45. */
  readonly latitude: number;
  /** Lado das células do padrão (m); também a escala do estêncil (`scale/64`). Default 1 500 000. */
  readonly scale: number;
  /** Amplitude das baixas do padrão a 45° (Pa); escala com a rotação na latitude. Default 1200. */
  readonly amplitude: number;
  /** Vida de um sistema do padrão (s). Default 172 800. */
  readonly lifetime: number;
  /** Atrito linear da camada limite (1/s). Default 6·10⁻⁵. */
  readonly friction: number;
  /** Tempo de formação das nuvens (s). Default 1200. */
  readonly formation: number;
  /** Tropopausa (m acima do chão; > `top`): o topo da casca. Default 11 000. */
  readonly tropopause: number;
  /** Semente do padrão (inteiro ≥ 0). Default 0. */
  readonly seed: number;
}

export interface CloudWeatherValues extends Partial<CloudWeatherSettings> {
  /** Campo de pressão: grafo de nós ou WGSL do ponto `cloud_pressure`. Default: o padrão de sistemas. */
  readonly pressure?: CloudPressureOptions;
}

export const CLOUD_WEATHER_DEFAULTS: CloudWeatherSettings;

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
  /** O tempo, ou `undefined`; atribuir (parcial) liga ou ajusta, `undefined` desliga (a função de pressão é a da criação). */
  weather: CloudWeatherSettings | undefined;
  /** A função de pressão (com `weather.pressure`). */
  readonly pressureFunction: CloudPressureFunction | undefined;
  /** O topo da casca: a tropopausa com o tempo, `top` sem. */
  readonly shellTop: number;
}
```

Erros: `RangeError` para `top ≤ base`, cobertura/tipo/albedo fora de [0, 1], `dropletDiameter` fora de [5, 50],
valores não finitos; com o tempo: latitude fora de [−90, 90], escala/vida/atrito/formação ≤ 0, amplitude < 0,
tropopausa ≤ `top`, semente não inteira, cobertura por função. Sem `Sky` na cena: aviso único (`consumerMissing`, a prontidão da 034) e nada é desenhado.

## Funções de extensão

```ts
/** `fn shape_fn(p: vec3f, data: ShapeFnParams) -> vec4f` — p em [0, 1)³ do volume periódico. */
export class CloudShapeFunction extends ExtensionFunction {}
/** `fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f` — cobertura, tipo, densidade relativa. */
export class CloudCoverageFunction extends ExtensionFunction {}
export type CloudShapeOptions = ExtensionFunctionOptions;
export type CloudCoverageOptions = ExtensionFunctionOptions;
/** `fn pressure_fn(xz: vec2f, time: f32, data: PressureFnParams) -> f32` — a anomalia de pressão (Pa), R19. */
export class CloudPressureFunction extends ExtensionFunction {}
export type CloudPressureOptions = ExtensionFunctionOptions;
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
coverageExtent, scatter: { size: [x, altitude, z], stride, collisions } }` (o cache de espalhamento, T023) (valores em [research.md R15](../research.md)). Os tetos de custo são do perfil; a `CloudLayer` só descreve o meio.

## O tempo (R19)

Com `weather`, o `CloudLightFlow` despacha `CloudLightFlow.weather` (o estado, série da 037, e o vento das nuvens) antes
do mapa de cobertura, que passa a ser escrito pelo estado (`cloud_coverage_weather`); a reconstrução temporal reprojeta
pelo vento do tempo (`cloud_wind_at`). Sem `weather`, nenhum pipeline novo e o mesmo WGSL das marchas. A densidade lê o
topo local (canal A do mapa; 1 sem o tempo) e tem a bigorna do cúmulo-nimbo maduro (tipo ≥ 0,9) em todo caso.
Exportados: `CloudLayer.weather`, `CloudWeatherSettings`, `CloudWeatherValues`, `CLOUD_WEATHER_DEFAULTS`,
`CloudPressureFunction`, `CloudPressureOptions`, `cloudPressurePoint`, `CLOUD_WEATHER_SIZE`.

## Eventos

Nenhum evento novo de autoria. A camada usa os da C2: mudança de slot (revisão das funções → volumes refeitos),
prontidão (`whenReady` espera os volumes completos) e invalidação do canal temporal (corte de câmera, perfil).
