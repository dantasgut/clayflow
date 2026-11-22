import { FieldType } from '../../../scene/descriptors/FieldType';
import { type FieldSpec, StructSchema, fieldArray } from '../../../scene/descriptors/StructSchema';

/**
 * Uniforme da camada de nuvens (spec 041, R1–R12), escrito pelos estágios das nuvens a cada quadro (empacotamento dos
 * valores da `CloudLayer`, do `Sky` e da câmera): a casca (raio do chão da cena, base, topo, espessura; m), a camada
 * (cobertura, tipo, extinção, albedo), a fase (g_HG, g_D, α, w_D), as oitavas (quantas, a, b, c), os deslocamentos do
 * vento da forma e do detalhe (m, reduzidos módulo o período em f64; `w` a escala), o vento (direção unitária xz e
 * velocidade xz em m/s), o mapa de cobertura em níveis (a câmera xz no referencial do vento, o lado, o tempo; o
 * deslocamento do vento xz e o texel do nível 0; o orçamento de páginas por quadro, a assinatura do conteúdo, se o
 * conteúdo muda no tempo e quantos níveis — R21 rodada 19), o referencial do mapa
 * visto do sol por páginas (o pivô do plano — o vento × tempo mais a célula da grade do pivô —; a direita e em cima, a
 * rotação mínima de +y ao sol, com a câmera no plano em `w`; a direção do sol; o texel do nível 0, a tolerância, o tempo
 * da evolução da forma e o vento que sobra além do local; o orçamento de páginas por quadro, a assinatura do conteúdo e
 * a célula do pivô — R11 revisto), a marcha (passos,
 * passos de luz, quadro de Bayer, slot da câmera), as marcas (histórico válido, slots das funções de forma e de
 * cobertura), os tempos (Δt, passos do panorama), a posição da câmera do panorama e o cache de espalhamento (T023): a
 * grade das sondas (centro xz, escala e alcance do asinh), os parâmetros (peso da estimativa das oitavas, teto da média,
 * validade do histórico, lado do encaixe do centro), a truncagem da fase (cosseno do corte, fração do núcleo, chance da
 * HG, acumulada da HG até o corte), o trabalho (o orçamento de encher a janela, colisões, quadro, assinatura), as sondas
 * por eixo (com o orçamento da mudança em `w`) e as memórias da média no ângulo do sol e da câmera (rad) com o centro da
 * grade no referencial das nuvens (T074); o tempo (R19): f
 * (1/s), o atrito da atmosfera livre e o da camada limite (1/s) e o tempo de formação (s); o padrão de sistemas (lado
 * das células, amplitude das baixas e teto das altas em Pa, vida em s); o quadrado do tempo (o topo do tempo bom como
 * fração da casca — 1 sem o tempo —, texels por lado, lado em m, lado do estêncil em m); as marcas (tempo ligado, slot
 * da função de pressão, histórico do estado válido, semente); a bigorna (o vento da alta troposfera em m/s, x e z, e o
 * deslocamento dela em m, módulo o período da forma); o volume de τ até o sol perto da câmera (T074): o lado da célula no
 * plano (0: desligado), o comprimento do trecho que cada nó integra, o ponto do cone onde a leitura entra e o tempo da
 * evolução da cobertura (0 sem evolução); a página da câmera na janela (x, z, em i32), o orçamento e a assinatura.
 */
export const CloudSchema = new StructSchema(
    'CloudLayer',
    {
        shell: FieldType.vec4f,
        layer: FieldType.vec4f,
        phase: FieldType.vec4f,
        octaves: FieldType.vec4f,
        shape: FieldType.vec4f,
        detail: FieldType.vec4f,
        wind: FieldType.vec4f,
        coverageMap: FieldType.vec4f,
        coverageOffset: FieldType.vec4f,
        coveragePages: FieldType.vec4u,
        sunFrame: FieldType.vec4f,
        sunRight: FieldType.vec4f,
        sunUp: FieldType.vec4f,
        sunDir: FieldType.vec4f,
        sunMap: FieldType.vec4f,
        sunPages: FieldType.vec4u,
        march: FieldType.vec4u,
        flags: FieldType.vec4u,
        timing: FieldType.vec4f,
        eye: FieldType.vec4f,
        scatterGrid: FieldType.vec4f,
        scatterParams: FieldType.vec4f,
        phaseCut: FieldType.vec4f,
        scatterWork: FieldType.vec4u,
        scatterSize: FieldType.vec4u,
        scatterMemory: FieldType.vec4f,
        weather: FieldType.vec4f,
        weatherPattern: FieldType.vec4f,
        weatherMap: FieldType.vec4f,
        weatherFlags: FieldType.vec4u,
        anvil: FieldType.vec4f,
        sunVolume: FieldType.vec4f,
        sunVolumeGrid: FieldType.vec4u,
    },
    { addressSpace: 'uniform' },
);

/** Lado dos volumes de ruído (texels por eixo): a forma e o detalhe (spec 041, R3). */
export const CLOUD_SHAPE_SIZE = 128;
export const CLOUD_DETAIL_SIZE = 32;
/** Nós de profundidade ótica por coluna do mapa visto do sol (R11; 4 por camada do volume). */
export const CLOUD_SHADOW_KNOTS = 16;
/** As camadas do atlas do mapa visto do sol: os nós da coluna, 4 por camada. */
export const CLOUD_SHADOW_ATLAS_LAYERS = CLOUD_SHADOW_KNOTS / 4;

// O mapa visto do sol por páginas (R11 revisto; `cloud_shadow_pages.wgsl`, `reference/cloudShadowPages.ts`).
/** Texels por lado do interior de uma página. */
export const CLOUD_SHADOW_PAGE = 16;
/** Texels por lado de uma página física (o interior e a coluna da vizinha em +x e +y). */
export const CLOUD_SHADOW_STRIDE = CLOUD_SHADOW_PAGE + 1;
/** Páginas de um nível em cima (e à direita com o texel quadrado). */
export const CLOUD_SHADOW_PAGES = 8;
/**
 * Páginas físicas de um nível à direita: as janelas de dois degraus vizinhos da razão do texel à direita lado a lado (o
 * de 0,2 com 32, o de ½ com 14; o de 1, com 8, nas primeiras: `cloud_shadow_step_base`).
 */
export const CLOUD_SHADOW_PAGES_X = 46;
/** Níveis do mapa (o último cobre ~5900 texels do primeiro: ±294 km com texels de 50 m). */
export const CLOUD_SHADOW_LEVELS = 8;
/** Páginas físicas por linha do atlas. */
export const CLOUD_SHADOW_SLOTS_X = 55;
/** Páginas no atlas (os lugares dos degraus em todos os níveis). */
export const CLOUD_SHADOW_SLOT_COUNT =
    CLOUD_SHADOW_LEVELS * CLOUD_SHADOW_PAGES_X * CLOUD_SHADOW_PAGES;
/**
 * O registro do estado dos mapas (o degrau de onde, o para onde e o peso: `CloudShadowMaps`), logo depois dos das páginas
 * na série `shadowPages` (`page_x`, `page_y`, `time`); o carimbo é o do lugar do atlas de mesmo índice, que nenhuma página
 * usa.
 */
export const CLOUD_SHADOW_STATE_SLOT = CLOUD_SHADOW_SLOT_COUNT;
/** Lado do atlas em texels. */
export const CLOUD_SHADOW_ATLAS = CLOUD_SHADOW_SLOTS_X * CLOUD_SHADOW_STRIDE;

// O mapa de cobertura em níveis (R21 rodada 19, T077; `cloud_coverage_pages.wgsl`, `reference/cloudCoverageLevels.ts`).
/** Texels por lado do interior de uma página do mapa de cobertura. */
export const CLOUD_COVERAGE_PAGE = 16;
/** Páginas por lado de um nível (a janela de 512 texels em volta da câmera). */
export const CLOUD_COVERAGE_PAGES = 32;
/** Texels por lado de uma camada do volume do mapa (a janela de um nível, no endereço toroidal). */
export const CLOUD_COVERAGE_SIDE = CLOUD_COVERAGE_PAGE * CLOUD_COVERAGE_PAGES;
/** Palavras do registro de uma página física (a página global x e y, o quadro do desenho, a assinatura, a janela x e y). */
export const CLOUD_COVERAGE_RECORD_WORDS = 8;

/**
 * Os níveis do mapa de cobertura: do texel do nível 0 até o último cujo raio útil (`(255 − 16)` texels em volta da câmera:
 * `cloud_coverage_usable`) cobre a metade do lado do mapa — fora dele a densidade avalia o campo procedural no ponto
 * (com o último nível só até 119,5 km de 128, a marcha e os caminhos do cache custavam ~0,2 ms a mais: medido).
 */
export function cloudCoverageLevels(q: Pick<CloudQuality, 'coverage' | 'coverageExtent'>): number {
    const usable = (255 - CLOUD_COVERAGE_PAGE) * q.coverage.texel;
    return Math.max(1, Math.ceil(Math.log2(q.coverageExtent / 2 / usable)) + 1);
}

/** Páginas físicas do mapa de cobertura (as janelas de todos os níveis). */
export function cloudCoverageSlotCount(levels: number): number {
    return levels * CLOUD_COVERAGE_PAGES * CLOUD_COVERAGE_PAGES;
}

/**
 * Os campos do registro de uma página física do mapa visto do sol (`cloud_shadow.wgsl`), na ordem do struct: o sol do
 * desenho (`f32`), o tempo da forma no desenho (s), a página global, o quadro do desenho, a assinatura do conteúdo, as
 * medidas (o maior |ΔT| entre texels por metro, o maior ao longo da coluna por metro, o maior trecho e a maior alavanca,
 * em m), o trecho no centro da página (m), o erro medido pelas provas, a célula do pivô, o degrau da razão do texel à
 * direita com que foi desenhada e o custo do desenho (as amostras da densidade, as com nuvem × `CLOUD_SHADOW_CLOUDY_COST`;
 * T074); depois, os nós 4, 8, 12 e 16
 * de cada texel (o que as provas comparam).
 */
const SHADOW_PAGE_FIELDS: readonly (readonly [string, 'f' | 'i' | 'u'])[] = [
    ['sun_x', 'f'],
    ['sun_y', 'f'],
    ['sun_z', 'f'],
    ['time', 'f'],
    ['page_x', 'i'],
    ['page_y', 'i'],
    ['frame', 'u'],
    ['signature', 'u'],
    ['gradient', 'f'],
    ['along', 'f'],
    ['len', 'f'],
    ['lever', 'f'],
    ['center_len', 'f'],
    ['measured', 'f'],
    ['pivot_x', 'u'],
    ['pivot_y', 'u'],
    ['step', 'u'],
    ['cost', 'u'],
];

function shadowPageFields(view: boolean): Record<string, FieldSpec> {
    const scalar = { f: FieldType.f32, i: FieldType.i32, u: FieldType.u32 } as const;
    const fields: Record<string, FieldSpec> = {};
    for (const [name, kind] of SHADOW_PAGE_FIELDS)
        fields[name] = view ? scalar[kind] : FieldType.atomicU32;
    fields.knots = fieldArray(
        view ? FieldType.f32 : FieldType.atomicU32,
        4 * CLOUD_SHADOW_STRIDE * CLOUD_SHADOW_STRIDE,
    );
    return fields;
}

/**
 * O registro de uma página física do mapa visto do sol, escrito pelo desenho e pelas provas (`atomic<u32>`: as provas
 * somam o erro medido com `atomicMax` e a escolha lê o registro no mesmo quadro). Série por páginas `shadowPages`.
 */
export const CloudShadowPageSchema = new StructSchema('CloudShadowPage', shadowPageFields(false));
/** O mesmo registro, lido pelos consumidores do mapa (só leitura, os campos pelos tipos). */
export const CloudShadowPageViewSchema = new StructSchema(
    'CloudShadowPageView',
    shadowPageFields(true),
);
/** Lado (m) da grade do pivô do plano no referencial das nuvens: a câmera que cruza a linha refaz o mapa. */
export const CLOUD_SHADOW_PIVOT = 16_000;
/**
 * Tolerância da página: a mudança prevista da transmitância até o sol (e^(−τ), o fator da luz direta) num texel —
 * um nível de 8 bits da luz direta plena.
 */
export const CLOUD_SHADOW_TOLERANCE = 1 / 255;
/**
 * Tolerância do panorama (T074): a mudança medida nas provas (a luz relativa média, pela luminância, e a transmitância
 * média) além da qual ele é refeito.
 */
export const CLOUD_PANORAMA_TOLERANCE = 0.02;
/** Fração de erosão do detalhe (`CLOUD_EROSION` de `cloud_density.wgsl`): a evolução da forma pela deriva dele. */
export const CLOUD_EROSION = 0.35;
/** Colunas de prova por página por quadro: refeitas e comparadas com o que a página guarda (a medida da mudança). */
export const CLOUD_SHADOW_PROBES = 4;

/**
 * Coeficientes das oitavas do espalhamento múltiplo (R8: `Σ bⁱ σs e^(−aⁱ τ) p(cⁱ g)`), calibrados contra o traçador de
 * referência (T023, `octaves.calibration.test.ts`: o menor erro médio na grade, 31,9 % — o limite do modelo de oitavas
 * contra o transporte completo numa nuvem espessa; ver research.md, R8).
 */
export const CLOUD_OCTAVES = { a: 0.35, b: 0.95, c: 0.6 } as const;

/** Qualidade das nuvens num perfil do `Renderer` (spec 041, R15). */
export interface CloudQuality {
    /** Teto de passos de densidade da marcha principal. */
    readonly steps: number;
    /** Passos de luz por passo denso (o cone até o sol). */
    readonly lightSteps: number;
    /** Oitavas do espalhamento múltiplo. */
    readonly octaves: number;
    /** Texels do panorama (largura, altura). */
    readonly panorama: readonly [number, number];
    /** Passos da marcha do panorama. */
    readonly panoramaSteps: number;
    /**
     * Mapa visto do sol por páginas (R11 revisto): o texel do nível 0 (m; cada nível dobra, até ±~2000 texels dele) e o
     * orçamento de páginas refeitas por quadro (as que entram na janela ou mudam de conteúdo passam dele).
     */
    readonly shadow: { readonly texel: number; readonly budget: number };
    /**
     * Lado (m) do mapa de cobertura (o do último nível). O mapa cobre a grade do cache de espalhamento e quase todo o
     * alcance da marcha: fora dele a densidade avalia o campo da cobertura no ponto (o fBm procedural, ~4 × o custo
     * do passo da marcha e dos caminhos — medido: o mapa de 64 km deixava os caminhos das sondas distantes nele).
     */
    readonly coverageExtent: number;
    /**
     * O mapa de cobertura em níveis em volta da câmera (R21 rodada 19, T077): o texel do nível 0 (m; cada nível dobra,
     * até o lado `coverageExtent` no último) e o orçamento de páginas refeitas por quadro (as que entram na janela ou
     * mudam de conteúdo passam dele).
     */
    readonly coverage: { readonly texel: number; readonly budget: number };
    /**
     * Cache de espalhamento (T023, R8; páginas, R11 revisto): sondas por lado (x, altitude, z; múltiplos de
     * `CLOUD_SCATTER_PAGE`), o orçamento de páginas de sondas que caminham por quadro para encher a janela (as novas, as
     * que não encheram), o orçamento das que caminham pela mudança (o sol, a câmera, o vento que sobra, a evolução; T074:
     * o regime com o sol andando, no teto de tempo do perfil) e o teto de colisões por caminho.
     */
    readonly scatter: {
        readonly size: readonly [number, number, number];
        readonly budget: number;
        readonly motion: number;
        readonly collisions: number;
    };
    /**
     * Pixels da tela por lado de um texel do alvo reconstruído das nuvens (spec 041, T035): 2 (¼ da tela) ou 4 (1/16, o
     * perfil baixo). A marcha anda um texel por bloco 2 × 2 dele a cada quadro (1/16 ou 1/64 da tela), e o aumento leva
     * à tela pela profundidade.
     */
    readonly marchScale: 2 | 4;
}

/** Sondas por lado de uma página do cache de espalhamento (`cloud_scatter_pages.wgsl`). */
export const CLOUD_SCATTER_PAGE = 8;
/**
 * Palavras globais (a geração da grade e o registro do panorama) e do registro de cada página (o que o último caminho
 * viu: `cloud_scatter_pages.wgsl`) antes das sondas no cache de espalhamento (T074).
 */
export const CLOUD_SCATTER_GLOBAL_WORDS = 224;
export const CLOUD_SCATTER_HEADER_WORDS = 16;
/**
 * Palavras por sonda do cache de espalhamento (T074): a soma da parte do sol (por unidade da luz do sol que chega à
 * sonda) e a contagem, a soma da parte do céu (por unidade da irradiância do céu) e uma livre.
 */
export const CLOUD_SCATTER_PROBE_WORDS = 8;
/** Texels por lado do quadrado do tempo (R19): ~2 km no quadrado de 256 km, a escala sinótica com folga. */
export const CLOUD_WEATHER_SIZE = 128;
/** O lado do estêncil das derivadas da pressão: a escala dos sistemas sobre este número (O(h²/L²) ~ 2·10⁻⁴). */
export const CLOUD_WEATHER_STENCIL = 64;
/** Atrito linear da atmosfera livre (1/s), o mesmo `FREE_DRAG` da referência. */
export const CLOUD_WEATHER_FREE_DRAG = 1e-5;
/** Velocidade angular da Terra (rad/s). */
export const CLOUD_EARTH_OMEGA = 7.2921159e-5;

/** Teto de colisões por caminho do cache de espalhamento (o perfil escolhe até ele). */
export const CLOUD_SCATTER_MAX_COLLISIONS = 48;
/**
 * Peso (em caminhos) da estimativa das oitavas na luz da sonda: `(Σ caminhos + n0·oitavas)/(n + n0)` — a sonda sem
 * caminhos dá as oitavas, e a média dos caminhos domina à medida que eles chegam.
 */
export const CLOUD_SCATTER_PRIOR = 16;
/** Teto da média móvel da sonda (caminhos): a janela em que a luz acompanha o sol e as nuvens que mudam. */
export const CLOUD_SCATTER_WINDOW = 64;
/**
 * A memória da média das sondas no ângulo do sol (rad; T074): a média esquece `e^(−Δθ/memória)` a cada caminho. Pela
 * sensibilidade medida da luz guardada ao ângulo (`reference/__tests__/scatterMemory.ts`, f64; a parte do sol ÷ a luz do
 * sol que chega à sonda e a do céu ÷ a irradiância do céu): 4,1 %/° na média pela luminância com o sol entre 2° e 8° (2°
 * 4,4; 4° 2,5; 6° 3,6; 8° 6,0) — contra 26 %/° da luz em unidades do sol no topo, a forma de antes. O atraso da média é
 * ~a memória, e o erro dele, sensibilidade × memória: igualado ao ruído da sonda filtrada com a janela cheia (4,7 %: um
 * caminho 1,64 × a média, × √(Σw²/64) do binomial) — 4,7/4,13 = 1,14°. Com a forma de antes, os 0,25° davam 6,5 %.
 */
export const CLOUD_SCATTER_SUN_MEMORY = (1.14 * Math.PI) / 180;
/**
 * A memória no ângulo da câmera vista da sonda (rad; T074): a mesma medida com a câmera subindo — 5,2 %/° (2° 4,2; 4° 3,7;
 * 6° 4,8; 8° 8,2) — e o mesmo erro: 4,7/5,23 = 0,90°.
 */
export const CLOUD_SCATTER_VIEW_MEMORY = (0.9 * Math.PI) / 180;
/** Lado (m) do encaixe do centro da grade: a câmera que cruza esse lado recomeça as sondas. */
export const CLOUD_SCATTER_SNAP = 4000;
/** Escala (m) do asinh do plano da grade: perto da câmera, sondas de ~`2·escala·alcance/lado`. */
export const CLOUD_SCATTER_NEAR = 2000;
/** Alcance (m) da grade a partir da câmera (meio lado). */
export const CLOUD_SCATTER_EXTENT = 64_000;

// O volume de τ até o sol perto da câmera (T074; `cloud_sun_volume*.wgsl`, `reference/cloudSunVolume.ts`).
/** Células por lado de uma página do volume de τ até o sol (os nós de uma página física: `CLOUD_SUN_VOLUME_PAGE + 1`). */
export const CLOUD_SUN_VOLUME_PAGE = 8;
/** Nós por lado de uma página física: as células e o nó da vizinha em +x, +y e +z (a leitura filtra dentro da página). */
export const CLOUD_SUN_VOLUME_STRIDE = CLOUD_SUN_VOLUME_PAGE + 1;
/**
 * Páginas da janela de um nível em volta da câmera (x, altitude, z): no plano, o endereço toroidal; na altitude, a casca
 * inteira em todo nível.
 */
export const CLOUD_SUN_VOLUME_PAGES = [20, 8, 20] as const;
/**
 * Níveis do volume: o nível `k` tem células de `CLOUD_SUN_VOLUME_CELL · 2^k` m no plano (a altura igual em todos) e a
 * janela de ±4·2^k km — até ±64 km no último (medido: da marcha do `high-sun`, a luz até 8 km custa 0,04 ms, de 8 a 32
 * km 0,11 e de 32 a 128 km 0,15).
 */
export const CLOUD_SUN_VOLUME_LEVELS = 5;
/** Páginas de um nível e do volume (as físicas, uma por página da janela). */
export const CLOUD_SUN_VOLUME_LEVEL_PAGES =
    CLOUD_SUN_VOLUME_PAGES[0] * CLOUD_SUN_VOLUME_PAGES[1] * CLOUD_SUN_VOLUME_PAGES[2];
export const CLOUD_SUN_VOLUME_PAGE_COUNT = CLOUD_SUN_VOLUME_LEVELS * CLOUD_SUN_VOLUME_LEVEL_PAGES;
/**
 * O lado (m) da célula no plano do nível 0: o τ do cone filtrado entre nós a 50 m (39 m na altura, a casca padrão em 64
 * células) erra 2,5 % contra os 3,8 % do cone de 6 amostras que ele substitui; a 100 m, 5,3–6,2 %; a 200 m, 11 % (f64,
 * `cloudSunVolume.test.ts`).
 */
export const CLOUD_SUN_VOLUME_CELL = 50;
/**
 * O maior lado da célula do resto da luz, em pegadas do pixel da marcha no ponto lido (o nível 0 sempre): o resto carrega
 * a sombra de uma nuvem sobre a outra pelo mapa visto do sol, de bordas nítidas com o sol baixo, e a célula grossa a borra
 * (`sunset` 4,0 → 6,5 % com o resto em todos os níveis, 4,3 % até 2 pixels; com o cone só, 4,0 %). O cone, em todos.
 */
export const CLOUD_SUN_VOLUME_REST_FOOTPRINT = 1;
/**
 * O maior lado (m) da célula na altura (a casca em `CLOUD_SUN_VOLUME_PAGE · páginas` células): numa casca mais alta (o
 * tempo, que a leva à tropopausa) o volume erraria mais que o cone, e a marcha segue o cone.
 */
export const CLOUD_SUN_VOLUME_MAX_SPACING = 64;
/** Amostras da densidade por nó ao longo do trecho do cone (no meio de partes iguais; f64: 12 e 24 erram igual). */
export const CLOUD_SUN_VOLUME_SAMPLES = 12;
/** Páginas desenhadas por quadro (o orçamento constante). */
export const CLOUD_SUN_VOLUME_BUDGET = 128;
/** Palavras do registro de uma página (`cloud_sun_volume.wgsl`): a página, o que o desenho viu, as taxas e as provas. */
export const CLOUD_SUN_VOLUME_RECORD_WORDS = 80;
/** Nós de prova por página (o registro guarda as duas partes deles; o desenho seguinte compara). */
export const CLOUD_SUN_VOLUME_PROBES = 32;
/**
 * A mudança estimada de τ (a média nos nós de prova) a partir da qual a página entra na fila do desenho, e a partir da
 * qual ela não vale (a marcha segue o cone) no nível 0: ~⅓ e ~1 vez o erro de τ do próprio volume (~0,065 na média, f64);
 * cada nível dobra as duas, como o erro da interpolação.
 */
export const CLOUD_SUN_VOLUME_TOLERANCE = 0.02;
export const CLOUD_SUN_VOLUME_INVALID = 0.06;
/**
 * A taxa da mudança do τ do cone (|Δτ| médio por metro do deslocamento do fim do trecho: `L·Δθ_sol` mais a deriva do
 * detalhe) da página ainda sem medida, e o piso da medida (a página sem nuvem também muda quando o sol vira para a nuvem
 * vizinha): medida na f64, 0,025/° com o sol a 4° e 30° (trecho de 490 m: 0,0029/m) e 0,0029/m na deriva — o piso, ¼ dela.
 */
export const CLOUD_SUN_VOLUME_RATE = 0.0029;
export const CLOUD_SUN_VOLUME_RATE_FLOOR = 0.0007;
/**
 * O braço (m) do sol na mudança do resto da luz (o pedaço até o meio nó e o nó do mapa visto do sol, que percorrem a
 * coluna de quilômetros até o sol): o deslocamento dele é `braço·Δθ_sol` mais a deriva; a taxa é medida por página, e a
 * de partida põe 1° em ~0,5 de τ (o resto só vale depois de medido parado).
 */
export const CLOUD_SUN_VOLUME_REST_ARM = 10_000;
export const CLOUD_SUN_VOLUME_REST_RATE = 0.003;
/** A vida mínima (s) do resto redesenhado no ritmo medido da mudança dele para ele entrar na fila do desenho. */
export const CLOUD_SUN_VOLUME_REST_LIFE = 2;
/** As palavras do trabalho do quadro do volume: a contagem, as filas, a lista, as marcas das duas partes e as filas por página. */
export const CLOUD_SUN_VOLUME_WORK_HIST = 4;
export const CLOUD_SUN_VOLUME_WORK_LIST = CLOUD_SUN_VOLUME_WORK_HIST + 32;
export const CLOUD_SUN_VOLUME_WORK_VALID = CLOUD_SUN_VOLUME_WORK_LIST + CLOUD_SUN_VOLUME_BUDGET;
export const CLOUD_SUN_VOLUME_VALID_WORDS = Math.ceil(CLOUD_SUN_VOLUME_PAGE_COUNT / 32);
export const CLOUD_SUN_VOLUME_WORK_KEYS =
    CLOUD_SUN_VOLUME_WORK_VALID + 2 * CLOUD_SUN_VOLUME_VALID_WORDS;
export const CLOUD_SUN_VOLUME_WORK_WORDS =
    CLOUD_SUN_VOLUME_WORK_KEYS + Math.ceil(CLOUD_SUN_VOLUME_PAGE_COUNT / 4);
