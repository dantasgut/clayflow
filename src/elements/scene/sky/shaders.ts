import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { sharedConstant } from '../../../scene/shaders/SharedConstant';
import { slot } from '../../../scene/flows/slots';
import { SKY_AERIAL_RANGE_KM, SkySchema } from './SkySchema';
import skyAtmosphereSource from '../../gpu/wgsl/sky/sky_atmosphere.wgsl?raw';
import skyLookupSource from '../../gpu/wgsl/sky/sky_lookup.wgsl?raw';
import skyTransmittanceSource from '../../gpu/wgsl/sky/sky_transmittance.wgsl?raw';
import skyMultiscatterSource from '../../gpu/wgsl/sky/sky_multiscatter.wgsl?raw';
import skyViewSource from '../../gpu/wgsl/sky/sky_view.wgsl?raw';
import skySource from '../../gpu/wgsl/sky/sky.wgsl?raw';
import skyAerialSource from '../../gpu/wgsl/sky/sky_aerial.wgsl?raw';
import skyAerialLookupSource from '../../gpu/wgsl/sky/sky_aerial_lookup.wgsl?raw';
import skyAmbientSource from '../../gpu/wgsl/sky/sky_ambient.wgsl?raw';
import { lightTransmissionReady, sceneEnvironmentReady } from '../points/lighting';
import { camerasResource } from '../resources';
import { constants, viewSpace } from '../../gpu/shaders/math';

// Módulos do céu físico (spec 033, R4): a atmosfera, a leitura das tabelas, os três kernels das tabelas (saídas
// privadas do `SkyFlow`) e a consulta `sky` (radiância, transmitância do sol, fundo). Os descritores do `Sky` são
// fornecidos pelos resolvers `Sky.*`.

/** Parâmetros do céu (resolver `Sky.params`). */
export const skyParamsResource = wgslResource({
    name: 'sky',
    binding: { uniform: true },
    type: { schema: SkySchema },
    frequency: 'frame',
    provider: { consumer: 'Sky.params' },
});

const lut = (name: string, consumer: string): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: { consumer },
    });

/** Tabela de transmitância (resolver `Sky.transmittance`). */
export const skyTransmittanceLut = lut('sky_transmittance_lut', 'Sky.transmittance');
/** Tabela de múltiplo espalhamento (resolver `Sky.multiscatter`). */
export const skyMultiscatterLut = lut('sky_multiscatter_lut', 'Sky.multiscatter');
/** Tabela da vista do céu (resolver `Sky.view`). */
export const skyViewLut = lut('sky_view_lut', 'Sky.view');

const lut3d = (name: string, consumer: string): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { texture: { sample: 'f32', dimension: '3d' } },
        frequency: 'frame',
        provider: { consumer },
    });

/** Tabela da perspectiva aérea: a luz espalhada (resolver `Sky.aerial`) e a transmitância (`Sky.aerialTransmittance`). */
export const skyAerialLut = lut3d('sky_aerial_lut', 'Sky.aerial');
export const skyAerialTransmittanceLut = lut3d(
    'sky_aerial_transmittance_lut',
    'Sky.aerialTransmittance',
);
/**
 * O déficit da sombra no fundo (resolver `Sky.aerialShadow`, spec 041): por coluna da tabela, a luz simples que o ar
 * sombreado deixa de espalhar da câmera até o fim da atmosfera.
 */
export const skyAerialShadowLut = lut('sky_aerial_shadow_lut', 'Sky.aerialShadow');

/** Amostrador linear das tabelas (resolver `Sky.sampler`). */
export const skySampler = wgslResource({
    name: 'sky_sampler',
    binding: { sampler: 'filtering' },
    frequency: 'frame',
    provider: { consumer: 'Sky.sampler' },
});

const out = (name: string): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'stage',
        provider: 'private',
    });

const out3d = (name: string): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storageTexture: { format: 'rgba16float', access: 'write', dimension: '3d' } },
        frequency: 'stage',
        provider: 'private',
    });

/** Slot do canal temporal da direção do sol (`Sky.sunTrack`, spec 037/041). */
export const skySunTrackSlots = Object.freeze({
    skySunTrack: slot.channel(SkySchema, 'sunTrack'),
});

/**
 * A direção para o sol pela série `Sky.sunTrack` (spec 041): a escrita do quadro (pela vista do céu) e a do quadro
 * anterior (lida por quem guarda entre quadros o que o disco mostrava).
 */
export const skySunTrack = Object.freeze({
    out: wgslResource({
        name: 'sky_sun_track_out',
        binding: { storageTexture: { format: 'rgba32float', access: 'write' } },
        frequency: 'stage',
        provider: { slot: 'skySunTrack', lag: 0 },
    }),
    previous: wgslResource({
        name: 'sky_sun_track_prev',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: 'skySunTrack', lag: 1 },
    }),
});

/** Slot do canal temporal da fração visível do disco do sol (`Sky.sunVisibility`, spec 037/041). */
export const skySunVisibilitySlots = Object.freeze({
    skySunVisibility: slot.channel(SkySchema, 'sunVisibility'),
});

/**
 * A fração visível do disco do sol pela série `Sky.sunVisibility` (spec 041): a escrita do quadro, a lida dele (pelo
 * excesso do disco) e a do quadro anterior (acumulada).
 */
export const skySunVisibility = Object.freeze({
    out: wgslResource({
        name: 'sky_sun_visibility_out',
        binding: { storageTexture: { format: 'rgba32float', access: 'write' } },
        frequency: 'stage',
        provider: { slot: 'skySunVisibility', lag: 0 },
    }),
    current: wgslResource({
        name: 'sky_sun_visibility',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: 'skySunVisibility', lag: 0 },
    }),
    previous: wgslResource({
        name: 'sky_sun_visibility_prev',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: 'skySunVisibility', lag: 1 },
    }),
});

/** Saídas dos kernels das tabelas (as texturas do `Sky`), privadas do `SkyFlow`. */
export const skyOutputs = Object.freeze({
    transmittance: out('sky_transmittance_out'),
    multiscatter: out('sky_multiscatter_out'),
    view: out('sky_view_out'),
    aerial: out3d('sky_aerial_out'),
    aerialTransmittance: out3d('sky_aerial_transmittance_out'),
    aerialShadow: out('sky_aerial_shadow_out'),
    ambient: out('sky_ambient_out'),
});

/** O meio, as fases, as distâncias e as parametrizações das tabelas. */
export const skyAtmosphere = wgslModule({
    name: 'sky_atmosphere',
    source: skyAtmosphereSource,
    requires: [skyParamsResource, constants],
});

/** Leitura da transmitância e do múltiplo espalhamento. */
export const skyLookup = wgslModule({
    name: 'sky_lookup',
    source: skyLookupSource,
    requires: [
        skyAtmosphere,
        skyParamsResource,
        skyTransmittanceLut,
        skyMultiscatterLut,
        skySampler,
    ],
});

/** Kernel da tabela de transmitância. */
export const skyTransmittanceKernel = wgslModule({
    name: 'sky_transmittance',
    source: skyTransmittanceSource,
    requires: [WORKGROUP_SIZE.module, skyAtmosphere, skyParamsResource, skyOutputs.transmittance],
});

/** Kernel da tabela de múltiplo espalhamento. */
export const skyMultiscatterKernel = wgslModule({
    name: 'sky_multiscatter',
    source: skyMultiscatterSource,
    requires: [
        WORKGROUP_SIZE.module,
        skyAtmosphere,
        skyLookup,
        skyParamsResource,
        skyOutputs.multiscatter,
    ],
});

/** Kernel da tabela da vista do céu. */
export const skyViewKernel = wgslModule({
    name: 'sky_view',
    source: skyViewSource,
    requires: [
        WORKGROUP_SIZE.module,
        skyAtmosphere,
        skyLookup,
        skyParamsResource,
        skyOutputs.view,
        skySunTrack.out,
    ],
});

/**
 * Consulta do céu: `sky_radiance(dir)`, `sky_sun_transmittance(p)` e `sky_background(dir)` (com o disco do sol).
 */
export const sky = wgslModule({
    name: 'sky_query',
    source: skySource,
    requires: [skyAtmosphere, skyLookup, skyParamsResource, skyViewLut, skySampler],
});

/** Alcance (km) da tabela da perspectiva aérea, compartilhado pelo kernel e pela leitura. */
const SKY_AERIAL_RANGE = sharedConstant('SKY_AERIAL_RANGE', SKY_AERIAL_RANGE_KM, 'f32');

/**
 * A visibilidade do sol num ponto do ar (spec 041, raios crepusculares): a luz do sol que chega a `p` pelo ponto
 * `light_transmission` (a atmosfera do `Sky` e o que mais tapa o sol: a sombra das nuvens) sem a parte da atmosfera
 * (`sky_sun_transmittance`, a contribuição do `Sky` ao mesmo ponto) — a tabela da perspectiva aérea já integra a
 * atmosfera até o sol pela curvatura do planeta. Onde a atmosfera não deixa o sol chegar (abaixo do horizonte), a luz
 * simples já é 0 e a visibilidade fica 1.
 */
export const skyAerialVisibility = wgslModule({
    name: 'sky_aerial_visibility',
    requires: [sky, skyParamsResource, lightTransmissionReady],
    source: `fn sky_aerial_visibility(p: vec3f) -> vec3f {
    let atmosphere = sky_sun_transmittance(p);
    let all = light_transmission(sky.sunSlot, p);
    let ratio = clamp(all / max(atmosphere, vec3f(1e-12)), vec3f(0.0), vec3f(1.0));
    return select(vec3f(1.0), ratio, atmosphere > vec3f(1e-9));
}

fn sky_aerial_shadowed() -> bool {
    return true;
}`,
});

/**
 * A visibilidade do sol no ar sem nada além da atmosfera que o tape (nenhuma camada de nuvens): 1, e a tabela não integra
 * o déficit da sombra no fundo (zero).
 */
const skyAerialVisibilityClear = wgslModule({
    name: 'sky_aerial_visibility_clear',
    source: `fn sky_aerial_visibility(p: vec3f) -> vec3f {
    return vec3f(1.0);
}

fn sky_aerial_shadowed() -> bool {
    return false;
}`,
});

/**
 * Kernel da tabela da perspectiva aérea (spec 041, R10): pela câmera ativa (`sky.cameraSlot`), com a sombra do que tapa
 * o sol no ar e o déficit dela no fundo.
 */
const skyAerialKernelOf = (name: string, visibility: WgslModule): WgslModule =>
    wgslModule({
        name,
        source: skyAerialSource,
        requires: [
            SKY_AERIAL_RANGE.module,
            viewSpace,
            skyAtmosphere,
            skyLookup,
            skyParamsResource,
            camerasResource,
            visibility,
            skyOutputs.aerial,
            skyOutputs.aerialTransmittance,
            skyOutputs.aerialShadow,
        ],
    });

/** O kernel com a sombra do que tapa o sol no ar. */
export const skyAerialKernel = skyAerialKernelOf('sky_aerial', skyAerialVisibility);
/** O kernel sem nada além da atmosfera que tape o sol (nenhuma camada de nuvens): sem a sombra e sem o déficit. */
export const skyAerialKernelClear = skyAerialKernelOf('sky_aerial_clear', skyAerialVisibilityClear);

/**
 * A visibilidade do sol no ar do trecho além da tabela (`sky_aerial_far`; spec 041, R18/R19): pronta, 1 (sem o que tapa o
 * sol). Quem tem a sombra das nuvens à mão (a marcha e o panorama das nuvens) troca pelo mapa visto do sol — as nuvens
 * além de 32 km com o ar na frente delas sombreado como a tabela faz até 32 km.
 */
const skyAerialFarVisibilityReady = wgslModule({
    name: 'sky_aerial_far_visibility_ready',
    source: 'fn sky_aerial_far_visibility(dir: vec3f, t_km: f32) -> f32 {\n    return 1.0;\n}',
});

/** Lugar da visibilidade do sol no trecho além da tabela (`bindPoints`). */
export const skyAerialFarVisibilityPoint: BindablePoint = {
    name: 'sky_aerial_far_visibility',
    ready: skyAerialFarVisibilityReady,
};

/**
 * Leitura da perspectiva aérea (spec 041, R10): `sky_aerial(uv, dir, d)` pela tabela até 32 km e pela razão das
 * transmitâncias além; `sky_aerial_far` sem a tabela.
 */
export const skyAerialLookup = wgslModule({
    name: 'sky_aerial_lookup',
    source: skyAerialLookupSource,
    requires: [
        SKY_AERIAL_RANGE.module,
        skyAtmosphere,
        skyLookup,
        skyParamsResource,
        skyViewLut,
        skyAerialLut,
        skyAerialTransmittanceLut,
        skySampler,
        skyAerialFarVisibilityReady,
    ],
});

/** A luz do céu (resolver `Sky.ambient`): o céu e o chão médios, lidos pelas superfícies sem iluminação global. */
export const skyAmbientTexture = lut('sky_ambient_tex', 'Sky.ambient');

/** Kernel da luz do céu nas superfícies (spec 041): pelo ambiente da cena, com o que cobre o céu. */
export const skyAmbientKernel = wgslModule({
    name: 'sky_ambient',
    source: skyAmbientSource,
    requires: [
        WORKGROUP_SIZE.module,
        constants,
        sky,
        skyParamsResource,
        sceneEnvironmentReady,
        skyOutputs.ambient,
    ],
});
