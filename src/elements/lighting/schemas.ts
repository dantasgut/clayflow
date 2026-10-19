import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Sondas por cascata em cada eixo (x, y, z). */
export const GI_GRID = [16, 8, 16] as const;
/** Cascatas no máximo. */
export const GI_MAX_CASCADES = 4;
/** Sondas no máximo (todas as cascatas). */
export const GI_MAX_PROBES = GI_GRID[0] * GI_GRID[1] * GI_GRID[2] * GI_MAX_CASCADES;
/** Texels por lado do mapa octaédrico de irradiância (e de radiância especular), sem a borda. */
export const GI_IRRADIANCE_TEXELS = 8;
/** Textura do estado das sondas (duas texels por sonda, 128 sondas por linha). */
export const GI_PROBE_TEXTURE_SIZE = [256, GI_MAX_PROBES / 128] as const;
/** Texels por lado do mapa octaédrico de visibilidade, sem a borda. */
export const GI_VISIBILITY_TEXELS = 16;
/**
 * Menor ladrilho de sonda de tela em pixels (R2 adendo): as texturas das sondas de tela têm um texel por ladrilho desse
 * tamanho; ladrilhos maiores usam o canto delas.
 */
export const GI_SCREEN_TILE_MIN = 4;
/** Baldes do hash das cáusticas por fótons (US5): 2¹⁹ células (um chão de 4 × 4 m todo aceso em células de 1,25 cm ocupa ~40 %), 8 palavras cada, mais o cabeçalho. */
export const GI_PHOTON_SLOTS = 1 << 19;
/** Palavras do buffer das cáusticas. */
export const GI_PHOTON_BUFFER_WORDS = 8 + GI_PHOTON_SLOTS * 8;
/** Palavra de 32 bits (o tamanho do descritor do hash das cáusticas). */
export const GiWordSchema = new StructSchema('GiWord', { value: FieldType.u32 });

/**
 * Parâmetros da iluminação global (uniform, spec 033, R2/R5/R6): a grade (sondas por eixo, cascatas), o canto de cada
 * cascata em mundo com o espaçamento em `w`, os raios (por sonda, quadro, primeira sonda e sondas atualizadas), o
 * ajuste (histerese, vieses de normal e de vista, distância máxima), os rebatimentos e a rotação dos raios do quadro.
 */
export const GlobalIlluminationSchema = new StructSchema(
    'GlobalIllumination',
    {
        grid: FieldType.vec4u,
        cascade0: FieldType.vec4f,
        cascade1: FieldType.vec4f,
        cascade2: FieldType.vec4f,
        cascade3: FieldType.vec4f,
        rays: FieldType.vec4u,
        tuning: FieldType.vec4f,
        /** (rebatimentos, ligado, refração traçada pronta, cáusticas). */
        bounces: FieldType.vec4u,
        rotation0: FieldType.vec4f,
        rotation1: FieldType.vec4f,
        rotation2: FieldType.vec4f,
        /** (intensidade das cáusticas, raio do hash, fótons, tempo simulado). */
        extra: FieldType.vec4f,
        /** (slots usados do pool `Light`, 0, 0, 0). */
        counts: FieldType.vec4u,
        /** Coleta final na tela (R2 adendo): (ladrilhos em x, em y, raios por sonda de tela, slot da câmera ativa). */
        screen: FieldType.vec4u,
        /** (período do rodízio das sondas de tela, metade do histórico escrita no quadro, ligada, 0). */
        screen1: FieldType.vec4u,
        /** (largura e altura do alvo em pixels, pixels por lado do ladrilho, teto da histerese das sondas de tela). */
        screenSize: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);

/**
 * Estado de uma sonda: o deslocamento da relocação (xyz) e o estado em `w` (0 ativa, 1 dentro da geometria — desligada,
 * 2 nova); `coord` = a célula de mundo que a sonda ocupa (com o endereçamento circular, a sonda que muda de célula
 * recomeça o histórico) e, em `w`, o quadro da última grande mudança.
 */
export const ProbeStateSchema = new StructSchema('ProbeState', {
    offset: FieldType.vec4f,
    coord: FieldType.vec4i,
    /** Estado da histerese adaptativa (`gi_response`): média rápida e lenta do maior canal, ruído e quadros. */
    response: FieldType.vec4f,
});
