import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import sourceReadySource from '../../gpu/wgsl/temporal/temporal_filter_source_ready.wgsl?raw';
import commonSource from '../../gpu/wgsl/temporal/temporal_filter_common.wgsl?raw';
import temporalSource from '../../gpu/wgsl/temporal/temporal_filter_temporal.wgsl?raw';
import atrousSource from '../../gpu/wgsl/temporal/temporal_filter_atrous.wgsl?raw';
import { color, temporal as temporalPieces } from '../../gpu/shaders/math';
import type { HistoryPrecision } from '../../scene/TemporalAntialiasing';
import { slot } from '../../../scene/flows/slots';
import {
    TEMPORAL_FILTER_GUIDE_FORMAT,
    temporalFilterFormat,
    TemporalFilter,
} from './TemporalFilter';

// Módulos do filtro de sinal traçado (spec 034, R3): o uniform do `TemporalFilter` (resolver `TemporalFilter.params`),
// os alvos dele e as entradas ligados pelo estágio que filtra (privados do estágio), o ponto da fonte do sinal e as
// passadas temporal e à-trous.

/** Parâmetros do filtro (resolver `TemporalFilter.params`). */
export const temporalFilterParamsResource = wgslResource({
    name: 'temporal_filter',
    binding: { uniform: true },
    type: { schema: TemporalFilter.schema },
    frequency: 'frame',
    provider: { consumer: 'TemporalFilter.params' },
});

const texture = (name: string): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    });

const storageTexture = (name: string, format: GPUTextureFormat): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storageTexture: { format, access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    });

/**
 * Os slots dos canais temporais do filtro (spec 037) no estágio que filtra: a média, os momentos e o guia do
 * `TemporalFilter` (o quadro anterior pelo atraso 1, o de agora pelo 0).
 */
export const temporalFilterSlots = Object.freeze({
    temporalFilterAccumulated: slot.channel(TemporalFilter.schema, 'accumulated', {
        optional: true,
    }),
    temporalFilterMoments: slot.channel(TemporalFilter.schema, 'accumulatedMoments', {
        optional: true,
    }),
    temporalFilterGuide: slot.channel(TemporalFilter.schema, 'guide', { optional: true }),
});
type ChannelSlotName = keyof typeof temporalFilterSlots;

/** Fatia de um canal do filtro lida (atraso 1: o quadro anterior). */
const previous = (
    name: string,
    channel: ChannelSlotName,
    sample: 'f32' | 'u32' = 'f32',
): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { texture: { sample } },
        frequency: 'stage',
        provider: { slot: channel, lag: 1 },
    });

/** Fatia de agora de um canal do filtro, escrita. */
const current = (
    name: string,
    channel: ChannelSlotName,
    format: GPUTextureFormat,
): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storageTexture: { format, access: 'write' } },
        frequency: 'stage',
        provider: { slot: channel, lag: 0 },
    });

/** As entradas lidas do filtro (as mesmas nas duas precisões: lidas sem filtragem). */
const inputs = Object.freeze({
    surfaceMotion: texture('temporal_filter_surface_motion'),
    guidePrevious: previous('temporal_filter_guide_previous', 'temporalFilterGuide', 'u32'),
    historyColor: previous('temporal_filter_history_color', 'temporalFilterAccumulated'),
    historyMoments: previous('temporal_filter_history_moments', 'temporalFilterMoments'),
    filterIn: texture('temporal_filter_filter_in'),
    output: texture('temporal_filter_output'),
});

/** A fonte pronta: sem sinal (quem produz o sinal troca pela sua, com `bindPoints`). */
export const temporalFilterSourceReady = wgslModule({
    name: 'temporal_filter_source_ready',
    source: sourceReadySource,
});

/** Ponto da fonte do sinal: o sinal, o guia, o ponto anterior, a largura do pixel e a mudança da cena. */
export const temporalFilterSourcePoint: BindablePoint = {
    name: 'temporal_filter_source',
    ready: temporalFilterSourceReady,
};

/** Comum às passadas: o pixel da invocação. */
export const temporalFilterCommon = wgslModule({
    name: 'temporal_filter_common',
    source: commonSource,
    requires: [WORKGROUP_SIZE.module, temporalFilterSourceReady],
});

/** Os recursos e as passadas do filtro numa precisão (spec 037, R6: o formato dos alvos escritos é parte do WGSL). */
export interface TemporalFilterVariant {
    /**
     * Entradas e alvos ligados pelo estágio que filtra: o movimento da superfície de cada pixel (UV do quadro anterior
     * − UV de agora), o guia do quadro anterior, o histórico, a média deste quadro, as passadas à-trous (de onde e para
     * onde) e a cor filtrada, lida por quem compõe.
     */
    readonly resources: typeof inputs & {
        readonly accumulatedOut: ReturnType<typeof wgslResource>;
        readonly momentsOut: ReturnType<typeof wgslResource>;
        readonly guideOut: ReturnType<typeof wgslResource>;
        readonly workOut: ReturnType<typeof wgslResource>;
        readonly filterOut: ReturnType<typeof wgslResource>;
    };
    /** A passada temporal (SVGF com o gradiente do A-SVGF). */
    readonly temporal: ReturnType<typeof wgslModule>;
    /** As passadas à-trous (passos 1, 2, 4, 8 e 16: `temporal_filter_atrous_<passo>_main`). */
    readonly atrous: ReturnType<typeof wgslModule>;
}

const variants = new Map<HistoryPrecision, TemporalFilterVariant>();

/** Os recursos e as passadas do filtro na precisão dada (criados uma vez por precisão). */
export function temporalFilterVariant(precision: HistoryPrecision): TemporalFilterVariant {
    const known = variants.get(precision);
    if (known !== undefined) return known;
    const format = temporalFilterFormat(precision);
    const suffix = precision === 'full' ? '_full' : '';
    const resources = Object.freeze({
        ...inputs,
        accumulatedOut: current(
            'temporal_filter_accumulated_out',
            'temporalFilterAccumulated',
            format,
        ),
        momentsOut: current('temporal_filter_moments_out', 'temporalFilterMoments', format),
        guideOut: current(
            'temporal_filter_guide_out',
            'temporalFilterGuide',
            TEMPORAL_FILTER_GUIDE_FORMAT,
        ),
        workOut: storageTexture('temporal_filter_work_out', format),
        filterOut: storageTexture('temporal_filter_filter_out', format),
    });
    const variant: TemporalFilterVariant = {
        resources,
        temporal: wgslModule({
            name: `temporal_filter_temporal${suffix}`,
            source: temporalSource,
            requires: [
                temporalPieces,
                color,
                temporalFilterParamsResource,
                temporalFilterCommon,
                temporalFilterSourceReady,
                resources.surfaceMotion,
                resources.guidePrevious,
                resources.historyColor,
                resources.historyMoments,
                resources.accumulatedOut,
                resources.momentsOut,
                resources.guideOut,
                resources.workOut,
            ],
        }),
        atrous: wgslModule({
            name: `temporal_filter_atrous${suffix}`,
            source: atrousSource,
            requires: [
                color,
                temporalFilterCommon,
                temporalFilterSourceReady,
                resources.filterIn,
                resources.filterOut,
            ],
        }),
    };
    variants.set(precision, variant);
    return variant;
}

/** Os recursos do filtro na precisão padrão (`half`). */
export const temporalFilterResources = temporalFilterVariant('half').resources;

/** A passada temporal na precisão padrão. */
export const temporalFilterTemporal = temporalFilterVariant('half').temporal;

/** As passadas à-trous na precisão padrão. */
export const temporalFilterAtrous = temporalFilterVariant('half').atrous;

/** Passos das passadas à-trous, na ordem. */
export const TEMPORAL_FILTER_ATROUS_STEPS = [1, 2, 4, 8, 16] as const;
