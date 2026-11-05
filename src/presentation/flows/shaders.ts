import { wgslModule } from '../../scene/shaders/WgslModule';
import { wgslResource } from '../../scene/shaders/WgslResource';
import { slot } from '../../scene/flows/slots';
import { TemporalAntialiasing } from '../../elements/scene/TemporalAntialiasing';
import shadowDepthSource from './shadow_depth.wgsl?raw';
import shadowDepthClipSource from './shadow_depth_clip.wgsl?raw';
import shadowPagesSource from './shadow_pages.wgsl?raw';
import shadowPagesConstantsSource from './shadow_pages_constants.wgsl?raw';
import shadowRequestSource from './shadow_request.wgsl?raw';
import shadowRequestSingleSource from './shadow_request_single.wgsl?raw';
import shadowRequestMsSource from './shadow_request_ms.wgsl?raw';
import effectsSource from './effects/effects.wgsl?raw';
import fullscreenSource from './effects/fullscreen.wgsl?raw';
import presentSource from './effects/present.wgsl?raw';
import presentSingleSource from './effects/present_single.wgsl?raw';
import presentMsSource from './effects/present_ms.wgsl?raw';
import uiSource from './ui.wgsl?raw';
import temporalResolveSource from './effects/temporal_resolve.wgsl?raw';
import temporalPresentSource from './effects/temporal_present.wgsl?raw';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { Camera } from '../../elements/scene/Camera';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import {
    color,
    shadowVirtual,
    xformRigid,
    present,
    temporal as temporalPieces,
    viewSpace,
    xformProjective,
} from '../../elements/gpu/shaders/math';
import {
    camerasResource,
    shadowMatricesResource,
    worldsResource,
} from '../../elements/scene/resources';
import {
    EffectParamsSchema,
    PresentationParamsSchema,
    ScreenParamsSchema,
    ShadowBoundsGeometrySchema,
    ShadowGroupDrawSchema,
    ShadowInstanceSchema,
    ShadowPagesParamsSchema,
    ShadowRequestParamsSchema,
    TemporalResolveParamsSchema,
    UiQuadSchema,
} from './renderSchemas';

const privateStorage = (
    name: string,
    access: 'read' | 'read_write',
    wgsl: 'u32' | 'atomic<u32>' | 'f32',
    frequency: 'stage' | 'draw' = 'stage',
) =>
    wgslResource({
        name,
        binding: { storage: access },
        type: { wgsl, array: true },
        frequency,
        provider: 'private',
    });

const privateUniform = (
    name: string,
    schema: typeof ShadowPagesParamsSchema,
    frequency: 'stage' | 'draw',
) =>
    wgslResource({
        name,
        binding: { uniform: true },
        type: { schema },
        frequency,
        provider: 'private',
    });

/** Slots das séries do mapa virtual no estágio de sombra (spec 037): a tabela, os pedidos, o atlas, os retângulos. */
export const shadowPageChannels = Object.freeze({
    pages: 'pages',
    requests: 'requests',
    atlas: 'atlas',
    rects: 'rects',
});

/** Recursos das páginas do mapa de sombra virtual (spec 034, T060), privados do `ShadowFlow` salvo as séries. */
export const shadowResources = {
    /** Parâmetros do quadro (`ShadowPagesParams`). */
    params: privateUniform('sp', ShadowPagesParamsSchema, 'stage'),
    /** O espaço de trabalho do quadro, em palavras (contadores, filas, sujas, dinâmicas, caixas, retângulos). */
    scratch: privateStorage('sp_scratch', 'read_write', 'atomic<u32>'),
    /** O mesmo, lido no desenho. */
    scratchRead: privateStorage('sp_scratch_read', 'read', 'u32'),
    /** Os grupos (primeira instância, contagem, deformação, registro dos argumentos) e o grupo de cada instância. */
    groups: privateStorage('sp_groups', 'read', 'u32'),
    /** Os argumentos dos desenhos indiretos (5 palavras por registro; a contagem de instâncias por atômico). */
    args: privateStorage('sp_args', 'read_write', 'atomic<u32>'),
    /** Os pares instância × página suja, por grupo. */
    pairs: privateStorage('sp_pairs', 'read_write', 'u32'),
    /** Os pares, lidos no desenho. */
    pairsRead: privateStorage('sp_pairs_read', 'read', 'u32'),
    /** Os vértices de uma geometria (a caixa; 8 palavras por vértice, a posição nas 3 primeiras). */
    vertices: privateStorage('sp_vertices', 'read', 'f32', 'draw'),
    /** O grupo da geometria da caixa (por despacho). */
    geometry: privateUniform('sp_geometry', ShadowBoundsGeometrySchema, 'draw'),
    /** O início dos pares do grupo (por desenho). */
    group: privateUniform('shadow_group', ShadowGroupDrawSchema, 'draw'),
    /** A tabela de agora (escrita) e a do quadro anterior. */
    pages: wgslResource({
        name: 'sp_pages',
        binding: { storageTexture: { format: 'rgba32uint', access: 'write' } },
        frequency: 'stage',
        provider: { slot: shadowPageChannels.pages, lag: 0 },
    }),
    pagesPrevious: wgslResource({
        name: 'sp_pages_previous',
        binding: { texture: { sample: 'u32' } },
        frequency: 'stage',
        provider: { slot: shadowPageChannels.pages, lag: 1 },
    }),
    /** Os pedidos do quadro anterior. */
    requestsPrevious: wgslResource({
        name: 'sp_requests_previous',
        binding: { texture: { sample: 'u32' } },
        frequency: 'stage',
        provider: { slot: shadowPageChannels.requests, lag: 1 },
    }),
    /** Os retângulos das instâncias: os de agora (escritos) e os do quadro anterior. */
    rects: wgslResource({
        name: 'sp_rects_out',
        binding: { storageTexture: { format: 'rgba32float', access: 'write' } },
        frequency: 'stage',
        provider: { slot: shadowPageChannels.rects, lag: 0 },
    }),
    rectsPrevious: wgslResource({
        name: 'sp_rects_previous',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: shadowPageChannels.rects, lag: 1 },
    }),
    /** Os carimbos das páginas do atlas (a série por páginas: a época em que cada uma foi escrita). */
    atlasStamps: wgslResource({
        name: 'sp_atlas_stamps',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: shadowPageChannels.atlas, part: 'stamps' },
    }),
    /** O relógio da série do atlas (`vec4u`: a época). */
    atlasClock: wgslResource({
        name: 'sp_atlas_clock',
        binding: { uniform: true },
        type: { wgsl: 'vec4u' },
        frequency: 'stage',
        provider: { slot: shadowPageChannels.atlas, part: 'clock' },
    }),
    /** Lista de instâncias dos grupos de profundidade (slot `casters`). */
    instances: wgslResource({
        name: 'instances',
        binding: { storage: 'read' },
        type: { schema: ShadowInstanceSchema, array: true },
        frequency: 'stage',
        provider: { slot: 'casters', part: 'instances' },
    }),
} as const;

const shadowPagesConstants = wgslModule({
    name: 'shadow_pages_constants',
    source: shadowPagesConstantsSource,
});

/** Os kernels das páginas (uma entrada por etapa; a caixa por geometria em `sp_bounds_main`). */
export const shadowPages = wgslModule({
    name: 'shadow_pages',
    source: shadowPagesSource,
    requires: [
        shadowVirtual,
        shadowPagesConstants,
        xformRigid,
        WORKGROUP_SIZE.module,
        shadowMatricesResource,
        worldsResource,
        shadowResources.params,
        shadowResources.scratch,
        shadowResources.groups,
        shadowResources.args,
        shadowResources.pairs,
        shadowResources.vertices,
        shadowResources.geometry,
        shadowResources.pages,
        shadowResources.pagesPrevious,
        shadowResources.requestsPrevious,
        shadowResources.rects,
        shadowResources.rectsPrevious,
        shadowResources.atlasStamps,
        shadowResources.atlasClock,
        shadowResources.instances,
    ],
    structs: [ShadowMap.matrixSchema, ShadowInstanceSchema],
});

/** Profundidade das páginas sujas (vértice, fragmento que descarta fora da página e o fundo). */
export const shadowDepth = wgslModule({
    name: 'shadow_depth',
    source: shadowDepthSource,
    requires: [
        shadowVirtual,
        shadowPagesConstants,
        viewSpace,
        shadowMatricesResource,
        worldsResource,
        shadowResources.params,
        shadowResources.scratchRead,
        shadowResources.pairsRead,
        shadowResources.group,
        shadowResources.instances,
    ],
});

/** O vértice das páginas recortado pelo hardware (a feature `clip-distances`). */
export const shadowDepthClip = wgslModule({
    name: 'shadow_depth_clip',
    source: shadowDepthClipSource,
    requires: [shadowDepth],
});

/** Recursos dos pedidos de páginas (o `ShadowRequestFlow`). */
export const shadowRequestResources = {
    params: privateUniform('sr', ShadowRequestParamsSchema, 'stage'),
    /** Os pedidos de agora (escritos). */
    requests: wgslResource({
        name: 'sr_requests',
        binding: { storageTexture: { format: 'r32uint', access: 'write' } },
        frequency: 'stage',
        provider: { slot: 'requests', lag: 0 },
    }),
    cameras: wgslResource({
        name: 'sr_cameras',
        binding: { storage: 'read' },
        type: { schema: Camera.matricesSchema, array: true },
        frequency: 'stage',
        provider: { pool: Camera.matricesSchema.name },
    }),
    /** A profundidade da cena (sem amostras e com amostras). */
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
} as const;

const shadowRequestCommon = wgslModule({
    name: 'shadow_request',
    source: shadowRequestSource,
    requires: [
        shadowVirtual,
        viewSpace,
        WORKGROUP_SIZE.module,
        shadowMatricesResource,
        shadowRequestResources.params,
        shadowRequestResources.requests,
        shadowRequestResources.cameras,
    ],
    structs: [ShadowMap.matrixSchema, Camera.matricesSchema],
});

/** Pedidos de páginas pela profundidade da cena (sem e com amostras); `shadow_request_clear_main` zera. */
export const shadowRequest = {
    single: wgslModule({
        name: 'shadow_request_single',
        source: shadowRequestSingleSource,
        requires: [shadowRequestCommon, shadowRequestResources.depth],
    }),
    multisampled: wgslModule({
        name: 'shadow_request_ms',
        source: shadowRequestMsSource,
        requires: [shadowRequestCommon, shadowRequestResources.depthMs],
    }),
} as const;

/**
 * Recursos do pós-processamento (spec 031, R1), todos privados do `PostFlow`: a textura de origem e os parâmetros por
 * passe (`{ pipeline, resource }`), o amostrador comum à cadeia.
 */
export const effectResources = {
    /** Textura de origem do passe (a cena ou o pingue-pongue anterior). */
    source: wgslResource({
        name: 'src_tex',
        binding: { texture: { sample: 'f32' } },
        frequency: 'draw',
        provider: 'private',
    }),
    /** Amostrador linear da origem. */
    sampler: wgslResource({
        name: 'src_smp',
        binding: { sampler: 'filtering' },
        frequency: 'draw',
        provider: 'private',
    }),
    /** Parâmetros do efeito (`EffectParams`). */
    params: wgslResource({
        name: 'params',
        binding: { uniform: true },
        type: { schema: EffectParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
} as const;

/** Triângulo de tela cheia (`VsOut`, `vs_fullscreen`) dos passes de tela. */
export const fullscreen = wgslModule({
    name: 'fullscreen',
    source: fullscreenSource,
    requires: [viewSpace],
});

/**
 * Base do pós-processamento: recursos da textura de origem, do amostrador e dos parâmetros, `vs_fullscreen` e os
 * fragmentos dos efeitos padrão. Efeitos próprios declaram um módulo com `requires: [effectsBase]` e o seu fragmento.
 */
export const effectsBase = wgslModule({
    name: 'effects_base',
    source: effectsSource,
    requires: [
        fullscreen,
        color,
        effectResources.source,
        effectResources.sampler,
        effectResources.params,
    ],
});

/** Recursos da apresentação (spec 011), privados do `PostFlow`. */
export const presentResources = {
    /** Parâmetros (`PresentationParams`), empacotados do `ToneMapping` da cena. */
    params: wgslResource({
        name: 'presentation',
        binding: { uniform: true },
        type: { schema: PresentationParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    /** A cor multiamostrada da cena (`FrameTargets.samples`), para o resolve mapeado por amostra. */
    samples: wgslResource({
        name: 'src_ms',
        binding: { texture: { sample: 'f32', multisampled: true } },
        frequency: 'draw',
        provider: 'private',
    }),
} as const;

/** Mapeamento e saída da apresentação (comum às duas entradas). */
const presentCommon = wgslModule({
    name: 'present_common',
    source: presentSource,
    requires: [present, presentResources.params],
});

/** Apresentação de uma imagem resolvida (a cor da cena sem MSAA, ou a saída do último efeito). */
export const presentSingle = wgslModule({
    name: 'present_single',
    source: presentSingleSource,
    requires: [fullscreen, presentCommon, effectResources.source],
});

/** Apresentação com resolve mapeado por amostra (MSAA, sem efeitos). */
export const presentMultisampled = wgslModule({
    name: 'present_ms',
    source: presentMsSource,
    requires: [fullscreen, presentCommon, presentResources.samples],
});

/** Recursos da resolução temporal (spec 034), privados do `PostFlow`. */
export const temporalResources = {
    /** Parâmetros (`TemporalResolveParams`). */
    params: wgslResource({
        name: 'taa_params',
        binding: { uniform: true },
        type: { schema: TemporalResolveParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    /** A luz que chega a cada pixel neste quadro (`FrameTargets.light`: r direta, g total). */
    light: wgslResource({
        name: 'taa_light',
        binding: { texture: { sample: 'f32' } },
        frequency: 'draw',
        provider: 'private',
    }),
    /** Os vetores de movimento (`FrameTargets.motion`). */
    motion: wgslResource({
        name: 'taa_motion',
        binding: { texture: { sample: 'f32' } },
        frequency: 'draw',
        provider: 'private',
    }),
    /** A máscara reativa (`FrameTargets.reactive`): 1 = o histórico do pixel recomeça. */
    reactive: wgslResource({
        name: 'taa_reactive',
        binding: { texture: { sample: 'f32' } },
        frequency: 'draw',
        provider: 'private',
    }),
    /** A profundidade da cena (`FrameTargets.depth`, sem MSAA). */
    depth: wgslResource({
        name: 'taa_depth',
        binding: { texture: { sample: 'depth' } },
        frequency: 'draw',
        provider: 'private',
    }),
} as const;

/**
 * Os slots das séries da resolução temporal (spec 037): os canais temporais do `TemporalAntialiasing` — a cor, o estado
 * (distância à câmera, movimento e quadros: a desoclusão e a contagem exata) e a luz que chegava a cada pixel.
 */
export const temporalSlots = Object.freeze({
    taaHistory: slot.channel(TemporalAntialiasing.schema, 'history', { optional: true }),
    taaState: slot.channel(TemporalAntialiasing.schema, 'state', { optional: true }),
    taaLight: slot.channel(TemporalAntialiasing.schema, 'light', { optional: true }),
});

/** As séries lidas pela resolução (atraso 1: o quadro anterior) ou pela nitidez (0: o quadro, recém-resolvido). */
const taaSeries = (lag: 0 | 1) => {
    const read = (name: string, channel: keyof typeof temporalSlots) =>
        wgslResource({
            name,
            binding: { texture: { sample: 'f32' } },
            frequency: 'draw',
            provider: { slot: channel, lag },
        });
    return Object.freeze({
        history: read('taa_history', 'taaHistory'),
        historyDistance: read('taa_history_distance', 'taaState'),
        historyLight: read('taa_history_light', 'taaLight'),
    });
};
const taaPrevious = taaSeries(1);
const taaCurrent = taaSeries(0);

/** Resolução temporal: a cor deslocada do quadro mais o histórico reprojetado e recortado (spec 034, R3). */
export const temporalResolve = wgslModule({
    name: 'temporal_resolve',
    source: temporalResolveSource,
    requires: [
        fullscreen,
        color,
        viewSpace,
        xformProjective,
        temporalPieces,
        camerasResource,
        temporalResources.params,
        effectResources.source,
        taaPrevious.history,
        taaPrevious.historyDistance,
        temporalResources.light,
        taaPrevious.historyLight,
        temporalResources.depth,
        temporalResources.motion,
        temporalResources.reactive,
        effectResources.sampler,
    ],
});

/** Nitidez adaptativa ao movimento depois da resolução (spec 034): o mesmo módulo, outra entrada. */
export const temporalSharpen = wgslModule({
    name: 'temporal_sharpen',
    source: temporalResolveSource,
    requires: [
        fullscreen,
        color,
        viewSpace,
        xformProjective,
        temporalPieces,
        camerasResource,
        temporalResources.params,
        effectResources.source,
        taaCurrent.history,
        taaCurrent.historyDistance,
        temporalResources.light,
        taaCurrent.historyLight,
        temporalResources.depth,
        temporalResources.motion,
        temporalResources.reactive,
        effectResources.sampler,
    ],
});

/** Nitidez e apresentação no mesmo passe, sem efeitos de pós (spec 034, G2): a imagem resolvida vai direto ao canvas. */
export const temporalPresent = wgslModule({
    name: 'temporal_present',
    source: temporalPresentSource,
    requires: [temporalSharpen, presentCommon],
});

/** Recursos da UI (spec 031, R1), privados do `UIFlow` (`UiGpuPipeline`). */
export const uiResources = {
    /** Tamanho da tela em pixels. */
    screen: wgslResource({
        name: 'screen',
        binding: { uniform: true },
        type: { schema: ScreenParamsSchema },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Quads achatados da árvore. */
    quads: wgslResource({
        name: 'quads',
        binding: { storage: 'read' },
        type: { schema: UiQuadSchema, array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Atlas da fonte (ou um texel branco). */
    atlas: wgslResource({
        name: 'atlas',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Amostrador do atlas. */
    sampler: wgslResource({
        name: 'atlas_smp',
        binding: { sampler: 'filtering' },
        frequency: 'stage',
        provider: 'private',
    }),
} as const;

/** Quads de UI (painéis e glifos). */
export const ui = wgslModule({
    name: 'ui',
    source: uiSource,
    requires: [
        viewSpace,
        uiResources.screen,
        uiResources.quads,
        uiResources.atlas,
        uiResources.sampler,
    ],
});
