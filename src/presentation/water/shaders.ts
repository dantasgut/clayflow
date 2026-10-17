import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import {
    wgslResource,
    type BindingFrequency,
    type WgslResource,
    type WgslResourceType,
} from '../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { FluidSurfaceMaterialSchema } from '../../elements/material/FluidSurfaceMaterialSchema';
import { sceneLightingReady } from '../../elements/scene/points/lighting';
import {
    camerasResource,
    lightsResource,
    shadowMatricesResource,
} from '../../elements/scene/resources';
import { closure, closureEval } from '../../elements/material/pbr/shaders';
import { WATER_DEPTH_LIMIT, WATER_NO_DEPTH } from './constants';
import { fields } from '../../elements/fields/shaders';
import {
    CausticParamsSchema,
    WaterCompositeParamsSchema,
    WaterLightMatrixSchema,
    WaterStateSchema,
    WaterViewParamsSchema,
} from './schemas';
import waterViewSource from './wgsl/water_view.wgsl?raw';
import waterSceneSource from './wgsl/water_scene.wgsl?raw';
import waterFieldSource from './wgsl/water_field.wgsl?raw';
import causticsSource from './wgsl/caustics.wgsl?raw';
import waterLightSource from './wgsl/water_light.wgsl?raw';
import waterRippleSource from './wgsl/water_ripple.wgsl?raw';
import waterCompositeSource from './wgsl/water_composite.wgsl?raw';
import waterTransmissionSource from './wgsl/water_transmission.wgsl?raw';

// Shaders da água e das cáusticas (spec 017) com recursos declarados (spec 031). Uniforms de parâmetros, texturas e
// rascunhos são do estágio que os cria (`private`, frequência `stage`). Câmeras e matrizes de sombra são os recursos de
// cena compartilhados; o pool `FluidSurfaceMaterial` vem da C2; o campo dos fluidos (spec 033), do `FluidField`.

const uniform = (
    name: string,
    type: WgslResourceType,
    frequency: BindingFrequency = 'stage',
): WgslResource =>
    wgslResource({ name, binding: { uniform: true }, type, frequency, provider: 'private' });
const storage = (
    name: string,
    access: 'read' | 'read_write',
    type: WgslResourceType,
    frequency: BindingFrequency = 'stage',
): WgslResource =>
    wgslResource({ name, binding: { storage: access }, type, frequency, provider: 'private' });
const texture = (name: string, sample: 'f32' | 'u32'): WgslResource =>
    wgslResource({
        name,
        binding: { texture: { sample } },
        frequency: 'stage',
        provider: 'private',
    });
const storageTexture = (name: string, format: GPUTextureFormat): WgslResource =>
    wgslResource({
        name,
        binding: { storageTexture: { format, access: 'write' } },
        frequency: 'stage',
        provider: 'private',
    });

/** Recursos dos estágios da água (produtor da superfície pelo campo, vista da luz, cáusticas e composição). */
export const waterResources = Object.freeze({
    /** Materiais de água (pool `FluidSurfaceMaterial`). */
    materials: wgslResource({
        name: 'water_materials',
        binding: { storage: 'read' },
        type: { schema: FluidSurfaceMaterialSchema, array: true },
        frequency: 'stage',
        provider: { pool: FluidSurfaceMaterialSchema.name },
    }),
    /** Matriz da vista da luz da água (leitura; o substituto antes de ela existir é do estágio). */
    lightMatrix: storage('water_light_matrix', 'read', { schema: WaterLightMatrixSchema }),
    // Superfície pelo campo.
    view: uniform('water_view', { schema: WaterViewParamsSchema }),
    outDepth: storageTexture('field_out_depth', 'r32float'),
    outMaterial: storageTexture('field_out_material', 'r32uint'),
    outNormal: storageTexture('field_out_normal', 'rgba16float'),
    /** Profundidade da cena de amostra única. */
    sceneDepth: wgslResource({
        name: 'water_scene_depth',
        binding: { texture: { sample: 'depth' } },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Profundidade da cena multiamostrada (MSAA). */
    sceneDepthMs: wgslResource({
        name: 'water_scene_depth',
        binding: { texture: { sample: 'depth', multisampled: true } },
        frequency: 'stage',
        provider: 'private',
    }),
    // Enquadramento da vista da luz.
    lightMatrixWrite: storage('light_matrix', 'read_write', { schema: WaterLightMatrixSchema }),
    // Cáusticas.
    causticParams: uniform('caustic_params', { schema: CausticParamsSchema }),
    lightDepth: texture('light_depth', 'f32'),
    lightMaterial: texture('light_material', 'u32'),
    lightNormal: texture('light_normal', 'f32'),
    causticShadow: wgslResource({
        name: 'caustic_shadow',
        binding: { texture: { sample: 'depth' } },
        frequency: 'stage',
        provider: 'private',
    }),
    photons: storage('photons', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    photonSums: storage('photon_sums', 'read_write', { wgsl: 'u32', array: true }),
    causticOut: storageTexture('caustic_out', 'rgba16float'),
    // Composição.
    composite: uniform('water_composite', { schema: WaterCompositeParamsSchema }),
    depth: texture('water_depth', 'f32'),
    material: texture('water_material', 'u32'),
    normal: texture('water_normal', 'f32'),
    background: texture('water_background', 'f32'),
});
const R = waterResources;

/**
 * Recursos da contribuição da água à transmissão da luz (`light_transmission`, spec 031): o estado da superfície, o
 * mapa de cáusticas, a profundidade da água vista pela luz e a matriz dessa vista — lidos dos descritores do
 * `WaterSurface` da cena pelos resolvers `WaterSurface.*` (`water/consumers.ts`), em qualquer desenho que chame o ponto.
 */
export const waterTransmissionResources = Object.freeze({
    state: wgslResource({
        name: 'water_state',
        binding: { uniform: true },
        type: { schema: WaterStateSchema },
        frequency: 'frame',
        provider: { consumer: 'WaterSurface.state' },
    }),
    causticMap: wgslResource({
        name: 'caustic_map',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: { consumer: 'WaterSurface.caustics' },
    }),
    lightDepth: wgslResource({
        name: 'water_light_depth',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: { consumer: 'WaterSurface.lightDepth' },
    }),
    lightMatrix: wgslResource({
        name: 'water_light_matrix',
        binding: { storage: 'read' },
        type: { schema: WaterLightMatrixSchema },
        frequency: 'frame',
        provider: { consumer: 'WaterSurface.lightMatrix' },
    }),
});

/** Vista de um produtor de superfície de água (spec 017): escalas da matriz da luz, profundidade linear e NDC. */
export const waterView = wgslModule({ name: 'water_view_fns', source: waterViewSource });

/** Profundidade da cena de amostra única: oclusão e profundidade linear da cena no pixel. */
const waterSceneSingle = wgslModule({
    name: 'water_scene',
    source: waterSceneSource,
    requires: [waterView, WATER_NO_DEPTH.module, R.sceneDepth],
});

/** A mesma, com a profundidade da cena multiamostrada (MSAA): a amostra 0 do pixel. */
const waterSceneMs = wgslModule({
    name: 'water_scene_ms',
    source: waterSceneSource,
    requires: [waterView, WATER_NO_DEPTH.module, R.sceneDepthMs],
});

/** Ondulações capilares procedurais do material de água (inclinação somada à normal; spec 017). */
const waterRipple = wgslModule({
    name: 'water_ripple',
    source: waterRippleSource,
    structs: [FluidSurfaceMaterialSchema],
});

/** Cáusticas por fótons em espaço da luz: limpar, depositar, resolver (spec 017). */
export const caustics = wgslModule({
    name: 'caustics',
    source: causticsSource,
    requires: [
        waterView,
        waterRipple,
        WATER_DEPTH_LIMIT.module,
        WORKGROUP_SIZE.module,
        shadowMatricesResource,
        R.lightMatrix,
        R.materials,
        R.causticParams,
        R.lightDepth,
        R.lightMaterial,
        R.lightNormal,
        R.causticShadow,
        R.photons,
        R.photonSums,
        R.causticOut,
    ],
});

/** Enquadramento da vista da luz da água (spec 017): a base da luz e a matriz ortográfica ajustada a uma caixa. */
const waterLight = wgslModule({ name: 'water_light', source: waterLightSource });

function waterFieldModule(name: string, scene: WgslModule): WgslModule {
    return wgslModule({
        name,
        source: waterFieldSource,
        requires: [
            waterView,
            scene,
            fields,
            waterLight,
            WATER_NO_DEPTH.module,
            camerasResource,
            shadowMatricesResource,
            R.materials,
            R.view,
            R.lightMatrix,
            R.lightMatrixWrite,
            R.outDepth,
            R.outMaterial,
            R.outNormal,
        ],
    });
}

/**
 * Superfície da água pelo campo dos fluidos (spec 033, R11): a marcha da câmera (profundidade da cena sem e com MSAA),
 * a da luz e o enquadramento da vista da luz pela caixa do campo.
 */
export const waterField = {
    scene: waterFieldModule('water_field', waterSceneSingle),
    sceneMs: waterFieldModule('water_field_ms', waterSceneMs),
} as const;

function waterCompositeModule(name: string, scene: WgslModule): WgslModule {
    return wgslModule({
        name,
        source: waterCompositeSource,
        requires: [
            waterView,
            scene,
            closure,
            closureEval,
            waterRipple,
            sceneLightingReady,
            WATER_DEPTH_LIMIT.module,
            camerasResource,
            R.materials,
            R.composite,
            R.depth,
            R.material,
            R.normal,
            R.background,
        ],
    });
}

/**
 * Composição óptica da água nos alvos da cena, sem e com MSAA (spec 017). A luz vem do ponto de cena `scene_lighting`
 * (spec 011): a C2 troca o pronto pelas contribuições das luzes, do hemisfério, da sombra e das cáusticas.
 */
export const waterComposite = {
    scene: waterCompositeModule('water_composite_pass', waterSceneSingle),
    sceneMs: waterCompositeModule('water_composite_pass_ms', waterSceneMs),
} as const;

/**
 * Contribuição da água ao ponto `light_transmission` (por luz, spec 011): `fn light_transmission(light, p)` devolve o mapa
 * de cáusticas para a luz que projeta sombra abaixo da superfície (com as cáusticas ligadas no estado do
 * `WaterSurface`) e 1 para as outras luzes e a ambiente.
 */
export const waterTransmission = wgslModule({
    name: 'water_transmission',
    source: waterTransmissionSource,
    requires: [
        waterTransmissionResources.state,
        waterTransmissionResources.causticMap,
        waterTransmissionResources.lightDepth,
        waterTransmissionResources.lightMatrix,
        lightsResource,
        NONE.module,
    ],
});
