import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import skyAtmosphereSource from '../../gpu/wgsl/sky/sky_atmosphere.wgsl?raw';
import skyLookupSource from '../../gpu/wgsl/sky/sky_lookup.wgsl?raw';
import skyTransmittanceSource from '../../gpu/wgsl/sky/sky_transmittance.wgsl?raw';
import skyMultiscatterSource from '../../gpu/wgsl/sky/sky_multiscatter.wgsl?raw';
import skyViewSource from '../../gpu/wgsl/sky/sky_view.wgsl?raw';
import skySource from '../../gpu/wgsl/sky/sky.wgsl?raw';
import { SkySchema } from './SkySchema';

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

/** Saídas dos kernels das tabelas (as texturas do `Sky`), privadas do `SkyFlow`. */
export const skyOutputs = Object.freeze({
    transmittance: out('sky_transmittance_out'),
    multiscatter: out('sky_multiscatter_out'),
    view: out('sky_view_out'),
});

/** O meio, as fases, as distâncias e as parametrizações das tabelas. */
export const skyAtmosphere = wgslModule({
    name: 'sky_atmosphere',
    source: skyAtmosphereSource,
    requires: [skyParamsResource],
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
    requires: [WORKGROUP_SIZE.module, skyAtmosphere, skyLookup, skyParamsResource, skyOutputs.view],
});

/**
 * Consulta do céu: `sky_radiance(dir)`, `sky_sun_transmittance(p)` e `sky_background(dir)` (com o disco do sol).
 */
export const sky = wgslModule({
    name: 'sky_query',
    source: skySource,
    requires: [skyAtmosphere, skyLookup, skyParamsResource, skyViewLut, skySampler],
});
