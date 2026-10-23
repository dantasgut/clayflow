import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import sourceReadySource from '../../gpu/wgsl/denoise/traced_denoise_source_ready.wgsl?raw';
import commonSource from '../../gpu/wgsl/denoise/traced_denoise_common.wgsl?raw';
import temporalSource from '../../gpu/wgsl/denoise/traced_denoise_temporal.wgsl?raw';
import atrousSource from '../../gpu/wgsl/denoise/traced_denoise_atrous.wgsl?raw';
import { color } from '../../gpu/shaders/math';
import { TRACED_DENOISE_FORMAT, TracedDenoiser } from './TracedDenoiser';

// Módulos do filtro de sinal traçado (spec 034, R3): o uniform do `TracedDenoiser` (resolver `TracedDenoiser.params`),
// os alvos dele e as entradas ligados pelo estágio que filtra (privados do estágio), o ponto da fonte do sinal e as
// passadas temporal e à-trous.

/** Parâmetros do filtro (resolver `TracedDenoiser.params`). */
export const tracedDenoiseParamsResource = wgslResource({
    name: 'traced_denoise',
    binding: { uniform: true },
    type: { schema: TracedDenoiser.schema },
    frequency: 'frame',
    provider: { consumer: 'TracedDenoiser.params' },
});

const texture = (name: string): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    });

const storageTexture = (name: string): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storageTexture: { format: TRACED_DENOISE_FORMAT, access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    });

/**
 * Entradas e alvos do filtro ligados pelo estágio que filtra: o movimento da superfície de cada pixel (UV do quadro
 * anterior − UV de agora), o guia do quadro anterior, o histórico, a média deste quadro, as passadas à-trous (de onde e
 * para onde) e a cor filtrada, lida por quem compõe.
 */
export const tracedDenoiseResources = Object.freeze({
    surfaceMotion: texture('traced_denoise_surface_motion'),
    guidePrevious: texture('traced_denoise_guide_previous'),
    historyColor: texture('traced_denoise_history_color'),
    historyMoments: texture('traced_denoise_history_moments'),
    accumulatedOut: storageTexture('traced_denoise_accumulated_out'),
    momentsOut: storageTexture('traced_denoise_moments_out'),
    filterIn: texture('traced_denoise_filter_in'),
    filterOut: storageTexture('traced_denoise_filter_out'),
    output: texture('traced_denoise_output'),
});

const R = tracedDenoiseResources;

/** A fonte pronta: sem sinal (quem produz o sinal troca pela sua, com `bindPoints`). */
export const tracedDenoiseSourceReady = wgslModule({
    name: 'traced_denoise_source_ready',
    source: sourceReadySource,
});

/** Ponto da fonte do sinal: o sinal, o guia, o ponto anterior, a largura do pixel e a mudança da cena. */
export const tracedDenoiseSourcePoint: BindablePoint = {
    name: 'traced_denoise_source',
    ready: tracedDenoiseSourceReady,
};

/** Comum às passadas: o pixel da invocação. */
export const tracedDenoiseCommon = wgslModule({
    name: 'traced_denoise_common',
    source: commonSource,
    requires: [WORKGROUP_SIZE.module, tracedDenoiseSourceReady],
});

/** A passada temporal (SVGF com o gradiente do A-SVGF). */
export const tracedDenoiseTemporal = wgslModule({
    name: 'traced_denoise_temporal',
    source: temporalSource,
    requires: [
        color,
        tracedDenoiseParamsResource,
        tracedDenoiseCommon,
        tracedDenoiseSourceReady,
        R.surfaceMotion,
        R.guidePrevious,
        R.historyColor,
        R.historyMoments,
        R.accumulatedOut,
        R.momentsOut,
    ],
});

/** As passadas à-trous (passos 1, 2, 4, 8 e 16: `traced_denoise_atrous_<passo>_main`). */
export const tracedDenoiseAtrous = wgslModule({
    name: 'traced_denoise_atrous',
    source: atrousSource,
    requires: [color, tracedDenoiseCommon, tracedDenoiseSourceReady, R.filterIn, R.filterOut],
});

/** Passos das passadas à-trous, na ordem. */
export const TRACED_DENOISE_ATROUS_STEPS = [1, 2, 4, 8, 16] as const;
