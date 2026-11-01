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
/** Um vec4f do histórico das sondas de tela (o canal temporal `GlobalIllumination.screenHistory`, spec 037). */
export const GiScreenRecordSchema = new StructSchema('GiScreenRecord', { value: FieldType.vec4f });

/**
 * Um passe do filtro à-trous das sondas de tela (spec 034, T054): (passo em ladrilhos, metade lida, metade escrita,
 * 1 no último — escreve a textura do desenho). Uma região por passe, por offset dinâmico.
 */
export const GiScreenFilterStepSchema = new StructSchema(
    'GiScreenFilterStep',
    { step: FieldType.vec4u },
    { addressSpace: 'uniform' },
);

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
        /** (rebatimentos, ligado, 0, as cáusticas ativas na cena: as sondas não leem o especular direto de vidro e metal liso). */
        bounces: FieldType.vec4u,
        rotation0: FieldType.vec4f,
        rotation1: FieldType.vec4f,
        rotation2: FieldType.vec4f,
        /** (1, 0, 0, tempo simulado). */
        extra: FieldType.vec4f,
        /** (slots usados do pool `Light`, 0, 0, 0). */
        counts: FieldType.vec4u,
        /** Coleta final na tela (R2 adendo): (ladrilhos em x, em y, raios por sonda de tela, slot da câmera ativa). */
        screen: FieldType.vec4u,
        /** (período do rodízio das sondas de tela, 0, ligada, 0). */
        screen1: FieldType.vec4u,
        /** (largura e altura do alvo em pixels, pixels por lado do ladrilho, histerese das sondas de tela). */
        screenSize: FieldType.vec4f,
        /**
         * Deslocamento da grade das sondas de tela no ladrilho (em ladrilhos, [0, 1)): o do quadro (xy) e o do anterior
         * (zw) — a mesma sequência de Halton (2, 3) para a grade inteira (spec 034, T055).
         */
        screenJitter: FieldType.vec4f,
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
