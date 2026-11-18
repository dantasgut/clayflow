import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/**
 * Uniforme da camada de nuvens (spec 041, R1–R12), escrito pelos estágios das nuvens a cada quadro (empacotamento dos
 * valores da `CloudLayer`, do `Sky` e da câmera): a casca (raio do chão da cena, base, topo, espessura; m), a camada
 * (cobertura, tipo, extinção, albedo), a fase (g_HG, g_D, α, w_D), as oitavas (quantas, a, b, c), os deslocamentos do
 * vento da forma e do detalhe (m, reduzidos módulo o período em f64; `w` a escala), o vento (direção unitária xz e
 * velocidade xz em m/s), o mapa de cobertura (centro xz, lado, tempo) e o deslocamento dele, o referencial do mapa
 * visto do sol (centro e lado; direita e cima, com o índice do encaixe do centro em `w` — a linha de cada coluna no reticulado do mundo; a origem de cada coluna é a saída da casca do lado do sol, calculada no shader —; a direção do sol; a deformação: escala e
 * alcance em asinh na direita e em cima), a marcha (passos,
 * passos de luz, quadro de Bayer, slot da câmera), as marcas (histórico válido, slots das funções de forma e de
 * cobertura), os tempos (Δt, passos do panorama), a posição da câmera do panorama e o cache de espalhamento (T023): a
 * grade das sondas (centro xz, escala e alcance do asinh), os parâmetros (peso da estimativa das oitavas, teto da média,
 * validade do histórico, lado do encaixe do centro), a truncagem da fase (cosseno do corte, fração do núcleo, chance da
 * HG, acumulada da HG até o corte) e o trabalho (passo da escolha dos grupos, colisões, quadro); o tempo (R19): f
 * (1/s), o atrito da atmosfera livre e o da camada limite (1/s) e o tempo de formação (s); o padrão de sistemas (lado
 * das células, amplitude das baixas e teto das altas em Pa, vida em s); o quadrado do tempo (o topo do tempo bom como
 * fração da casca — 1 sem o tempo —, texels por lado, lado em m, lado do estêncil em m); as marcas (tempo ligado, slot
 * da função de pressão, histórico do estado válido, semente).
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
        sunFrame: FieldType.vec4f,
        sunRight: FieldType.vec4f,
        sunUp: FieldType.vec4f,
        sunDir: FieldType.vec4f,
        sunWarp: FieldType.vec4f,
        march: FieldType.vec4u,
        flags: FieldType.vec4u,
        timing: FieldType.vec4f,
        eye: FieldType.vec4f,
        scatterGrid: FieldType.vec4f,
        scatterParams: FieldType.vec4f,
        phaseCut: FieldType.vec4f,
        scatterWork: FieldType.vec4u,
        weather: FieldType.vec4f,
        weatherPattern: FieldType.vec4f,
        weatherMap: FieldType.vec4f,
        weatherFlags: FieldType.vec4u,
    },
    { addressSpace: 'uniform' },
);

/** Lado dos volumes de ruído (texels por eixo): a forma e o detalhe (spec 041, R3). */
export const CLOUD_SHAPE_SIZE = 128;
export const CLOUD_DETAIL_SIZE = 32;
/** Nós de profundidade ótica por coluna do mapa visto do sol (R11; 4 por camada do volume). */
export const CLOUD_SHADOW_KNOTS = 16;

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
     * Mapa visto do sol: texels por lado, o lado coberto (m) e a escala perto da câmera (m): as coordenadas do plano do sol
     * são deformadas por `asinh(x/near)` — texels de ~`2·near·asinh(extent/2/near)/size` perto da câmera, crescendo com a
     * distância (como o pixel da câmera), até as nuvens do horizonte.
     */
    readonly shadow: { readonly size: number; readonly extent: number; readonly near: number };
    /**
     * Lado (m) e texels por lado do mapa de cobertura. O mapa cobre a grade do cache de espalhamento e quase todo o
     * alcance da marcha: fora dele a densidade avalia o campo da cobertura no ponto (o fBm procedural, ~4 × o custo
     * do passo da marcha e dos caminhos — medido: o mapa de 64 km deixava os caminhos das sondas distantes nele).
     */
    readonly coverageExtent: number;
    readonly coverageSize: number;
    /**
     * Cache de espalhamento (T023, R8): sondas por lado (x, altitude, z), a fração dos grupos de sondas que caminham por
     * quadro (1/`stride`, até `CLOUD_SCATTER_SUN_RING`) e o teto de colisões por caminho.
     */
    readonly scatter: {
        readonly size: readonly [number, number, number];
        readonly stride: number;
        readonly collisions: number;
    };
    /**
     * Pixels da tela por lado de um texel do alvo reconstruído das nuvens (spec 041, T035): 2 (¼ da tela) ou 4 (1/16, o
     * perfil baixo). A marcha anda um texel por bloco 2 × 2 dele a cada quadro (1/16 ou 1/64 da tela), e o aumento leva
     * à tela pela profundidade.
     */
    readonly marchScale: 2 | 4;
}

/**
 * Teto de `stride` do cache de espalhamento: o anel da série `scatterSun` guarda o sol com que cada fase de grupos
 * caminhou pela última vez (um texel por fase).
 */
export const CLOUD_SCATTER_SUN_RING = 16;
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
/** Lado (m) do encaixe do centro da grade: a câmera que cruza esse lado recomeça as sondas. */
export const CLOUD_SCATTER_SNAP = 4000;
/** Escala (m) do asinh do plano da grade: perto da câmera, sondas de ~`2·escala·alcance/lado`. */
export const CLOUD_SCATTER_NEAR = 2000;
/** Alcance (m) da grade a partir da câmera (meio lado). */
export const CLOUD_SCATTER_EXTENT = 64_000;
