import { wgslModule } from '../../../scene/shaders/WgslModule';
import { NONE } from '../../../scene/shaders/engineConstants';
import { slot } from '../../../scene/flows/slots';
import { wgslResource, type WgslResource } from '../../../scene/shaders/WgslResource';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import areaShadowTraceSource from '../../gpu/wgsl/area_shadow/area_shadow_trace.wgsl?raw';
import areaShadowDepthSingleSource from '../../gpu/wgsl/area_shadow/area_shadow_depth_single.wgsl?raw';
import areaShadowDepthMsSource from '../../gpu/wgsl/area_shadow/area_shadow_depth_ms.wgsl?raw';
import areaShadowTemporalSource from '../../gpu/wgsl/area_shadow/area_shadow_temporal.wgsl?raw';
import areaShadowFilterSource from '../../gpu/wgsl/area_shadow/area_shadow_filter.wgsl?raw';
import areaShadowAtrousASource from '../../gpu/wgsl/area_shadow/area_shadow_atrous_a.wgsl?raw';
import areaShadowAtrousBSource from '../../gpu/wgsl/area_shadow/area_shadow_atrous_b.wgsl?raw';
import areaShadowReadSource from '../../gpu/wgsl/area_shadow/area_shadow_read.wgsl?raw';
import areaShadowLookupSource from '../../gpu/wgsl/area_shadow/area_shadow_lookup.wgsl?raw';
import areaShadowThicknessSource from '../../gpu/wgsl/area_shadow/area_shadow_thickness.wgsl?raw';
import { random, viewSpace } from '../../gpu/shaders/math';
import { rayScene } from '../../raytrace/shaders';
import { Camera } from '../../scene/Camera';
import { Light } from '../../scene/Light';
import { camerasResource, lightsResource } from '../../scene/resources';
import { AREA_SHADOW_FORMAT, AREA_SHADOW_POINT_FORMAT, AreaShadowSchema } from './areaShadowSchema';

/**
 * Parâmetros do `AreaShadowFlow` (uniform): a câmera, as luzes de área com sombra (quantas e o slot de cada uma no pool
 * `Light`, na ordem dos canais), o quadro (a posição da sequência do sorteio) e os quadros da média temporal de cada luz.
 */
export const AreaShadowParamsSchema = new StructSchema(
    'AreaShadowParams',
    {
        cameraSlot: FieldType.u32,
        count: FieldType.u32,
        frame: FieldType.u32,
        _pad0: FieldType.u32,
        lights: FieldType.vec4u,
        history: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);

/** Os canais temporais da sombra das luzes de área (spec 037): a média e o ponto com os quadros. */
export const areaShadowSlots = Object.freeze({
    areaShadowAccumulated: slot.channel(AreaShadowSchema, 'accumulated', { optional: true }),
    areaShadowHistory: slot.channel(AreaShadowSchema, 'history', { optional: true }),
});

const read = (name: string): WgslResource =>
    wgslResource({
        name,
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: 'private',
    });

const write = (name: string, format: GPUTextureFormat): WgslResource =>
    wgslResource({
        name,
        binding: { storageTexture: { format, access: 'write' } },
        frequency: 'stage',
        provider: 'private',
    });

const series = (
    name: string,
    channel: keyof typeof areaShadowSlots,
    lag: 0 | 1,
    format?: GPUTextureFormat,
): WgslResource =>
    wgslResource({
        name,
        binding:
            format === undefined
                ? { texture: { sample: 'f32' } }
                : { storageTexture: { format, access: 'write' } },
        frequency: 'stage',
        provider: { slot: channel, lag },
    });

/** Recursos do `AreaShadowFlow` (privados dele, salvo os canais temporais, pelos slots). */
export const areaShadowResources = Object.freeze({
    params: wgslResource({
        name: 'asp',
        binding: { uniform: true },
        type: { schema: AreaShadowParamsSchema },
        frequency: 'stage',
        provider: 'private',
    }),
    depth: wgslResource({
        name: 'scene_depth',
        binding: { texture: { sample: 'depth' } },
        frequency: 'stage',
        provider: 'private',
    }),
    depthMs: wgslResource({
        name: 'scene_depth',
        binding: { texture: { sample: 'depth', multisampled: true } },
        frequency: 'stage',
        provider: 'private',
    }),
    tracedOut: write('as_traced_out', AREA_SHADOW_FORMAT),
    pointOut: write('as_point_out', AREA_SHADOW_POINT_FORMAT),
    traced: read('as_traced'),
    point: read('as_point'),
    accumulatedPrev: series('as_accumulated_prev', 'areaShadowAccumulated', 1),
    accumulatedOut: series('as_accumulated_out', 'areaShadowAccumulated', 0, AREA_SHADOW_FORMAT),
    accumulatedNow: series('as_accumulated_now', 'areaShadowAccumulated', 0),
    historyPrev: series('as_history_prev', 'areaShadowHistory', 1),
    historyOut: series('as_history_out', 'areaShadowHistory', 0, AREA_SHADOW_POINT_FORMAT),
    historyNow: series('as_history_now', 'areaShadowHistory', 0),
    workOut: write('as_work_out', AREA_SHADOW_FORMAT),
    work: read('as_work'),
    outputOut: write('as_output_out', AREA_SHADOW_FORMAT),
    thicknessOut: write('as_thickness_out', AREA_SHADOW_FORMAT),
    entryOut: write('as_entry_out', AREA_SHADOW_FORMAT),
});

const R = areaShadowResources;

const depthOf = (multisampled: boolean) =>
    wgslModule({
        name: multisampled ? 'area_shadow_depth_ms' : 'area_shadow_depth_single',
        source: multisampled ? areaShadowDepthMsSource : areaShadowDepthSingleSource,
        requires: [multisampled ? R.depthMs : R.depth],
    });

const traceOf = (multisampled: boolean) =>
    wgslModule({
        name: multisampled ? 'area_shadow_trace_ms' : 'area_shadow_trace',
        source: areaShadowTraceSource,
        requires: [
            viewSpace,
            random,
            camerasResource,
            lightsResource,
            rayScene,
            R.params,
            depthOf(multisampled),
            R.tracedOut,
            R.pointOut,
            R.thicknessOut,
            R.entryOut,
            NONE.module,
        ],
        structs: [AreaShadowParamsSchema, Camera.matricesSchema, Light.schema],
    });

const filter = wgslModule({
    name: 'area_shadow_filter',
    source: areaShadowFilterSource,
    requires: [R.point, R.historyNow],
});

/** Os kernels da sombra das luzes de área: o traçado (sem e com amostras na profundidade), a média no tempo e o filtro. */
export const areaShadow = Object.freeze({
    trace: traceOf(false),
    traceMs: traceOf(true),
    temporal: wgslModule({
        name: 'area_shadow_temporal',
        source: areaShadowTemporalSource,
        requires: [
            viewSpace,
            camerasResource,
            R.params,
            R.traced,
            R.point,
            R.accumulatedPrev,
            R.historyPrev,
            R.accumulatedOut,
            R.historyOut,
        ],
        structs: [AreaShadowParamsSchema, Camera.matricesSchema],
    }),
    atrousA: wgslModule({
        name: 'area_shadow_atrous_a',
        source: areaShadowAtrousASource,
        requires: [filter, R.accumulatedNow, R.workOut],
    }),
    atrousB: wgslModule({
        name: 'area_shadow_atrous_b',
        source: areaShadowAtrousBSource,
        requires: [filter, R.work, R.outputOut],
    }),
});

const consumed = (name: string, descId: string): WgslResource =>
    wgslResource({
        name,
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: { consumer: `AreaShadow.${descId}` },
    });

/** Os texels que valem para um ponto de mundo e o canal de cada luz: o comum às leituras do desenho. */
const areaShadowLookup = wgslModule({
    name: 'area_shadow_lookup',
    source: areaShadowLookupSource,
    requires: [
        viewSpace,
        camerasResource,
        lightsResource,
        wgslResource({
            name: 'area_shadow',
            binding: { uniform: true },
            type: { schema: AreaShadowSchema },
            frequency: 'frame',
            provider: { consumer: 'AreaShadow.params' },
        }),
        consumed('area_shadow_point', 'point'),
    ],
    structs: [AreaShadowSchema],
});

/** O que o desenho lê: a fração filtrada (a do quadro anterior, pelo ponto de mundo). */
export const areaShadowRead = wgslModule({
    name: 'area_shadow_read',
    source: areaShadowReadSource,
    requires: [areaShadowLookup, rayScene, consumed('area_shadow_output', 'output')],
});

/** A espessura atravessada pela luz de área e o cosseno na saída, no desenho. */
export const areaShadowThickness = wgslModule({
    name: 'area_shadow_thickness',
    source: areaShadowThicknessSource,
    requires: [
        areaShadowLookup,
        consumed('area_shadow_thickness_map', 'thickness'),
        consumed('area_shadow_entry', 'entry'),
    ],
});
