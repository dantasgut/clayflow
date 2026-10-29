import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { basis, bsdf, constants, hashAddress, random, sampling } from '../../gpu/shaders/math';
import { closure, closureEval } from '../../material/pbr/shaders';
import { rayHit, rayScene } from '../../raytrace/shaders';
import { rayWave } from '../../raytrace/wave/shaders';
import {
    rayVolumeBoundsReady,
    rayVolumeOccupiedReady,
    rayVolumeTransmittanceReady,
} from '../../raytrace/points';
import { lightTransmissionReady } from '../../scene/points/lighting';
import { LIGHT_LIMIT } from '../../scene/points/lightContributions';
import { lightsResource } from '../../scene/resources';
import { refractionScene } from '../refraction/shaders';
import causticsCapableSource from '../../gpu/wgsl/caustics/caustics_capable.wgsl?raw';
import causticsInstancesSource from '../../gpu/wgsl/caustics/caustics_instances.wgsl?raw';
import causticsCommonSource from '../../gpu/wgsl/caustics/caustics_common.wgsl?raw';
import causticsGatherSource from '../../gpu/wgsl/caustics/caustics_gather.wgsl?raw';
import causticsTraceSource from '../../gpu/wgsl/caustics/caustics_trace.wgsl?raw';
import causticsResolveSource from '../../gpu/wgsl/caustics/caustics_resolve.wgsl?raw';
import causticsLightSource from '../../gpu/wgsl/caustics/caustics_light.wgsl?raw';
import { CausticsPhotonSchema, CausticsSchema } from './schemas';

// Módulos das cáusticas (spec 034, T067c): o hash dos fótons (do recurso `Caustics`), os fótons, o acúmulo e as
// contribuições ao desenho.

/** Recursos das cáusticas. */
export const causticsResources = Object.freeze({
    params: wgslResource({
        name: 'caustics',
        binding: { uniform: true },
        type: { schema: CausticsSchema },
        frequency: 'frame',
        provider: { consumer: 'Caustics.params' },
    }),
    /** O hash em mundo: leitura no desenho. */
    hash: wgslResource({
        name: 'caustics_hash',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'frame',
        provider: { consumer: 'Caustics.hash' },
    }),
    /** O hash com atômicos: os fótons e o acúmulo. */
    hashAtomic: wgslResource({
        name: 'caustics_hash_atomic',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'frame',
        provider: { consumer: 'Caustics.hash' },
    }),
    /** Os alvos dos fótons e as áreas das projeções (privado do `CausticsFlow`). */
    targets: wgslResource({
        name: 'caustics_targets',
        binding: { storage: 'read_write' },
        type: { wgsl: 'f32', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Por instância da estrutura de raios: 1 se faz cáustica (`caustics_instances_main`), 0 se não (privado do `CausticsFlow`). */
    instanceCapable: wgslResource({
        name: 'caustics_instance_capable',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Os fótons entre as rodadas (privado do `CausticsFlow`). */
    photons: wgslResource({
        name: 'caustics_photons',
        binding: { storage: 'read_write' },
        type: { schema: CausticsPhotonSchema, array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** A fila dos fótons vivos: o cabeçalho e as duas listas (privado do `CausticsFlow`). */
    queue: wgslResource({
        name: 'caustics_queue',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** O despacho do bloco de fótons e quantos ele tem: escrito no começo do bloco, lido pelos kernels do bloco. */
    argsOut: wgslResource({
        name: 'caustics_args_out',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    args: wgslResource({
        name: 'caustics_args',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
});

const R = causticsResources;

/** O que faz cáustica (transmissão lisa, metal liso): os fótons e a coleta da luz rebatida (a GI). */
export const causticsCapable = wgslModule({
    name: 'caustics_capable',
    source: causticsCapableSource,
    requires: [closure],
});

/** Chave, balde, endereços do hash e a tenda 2D no plano tangente. */
const causticsCommon = wgslModule({
    name: 'caustics_common',
    source: causticsCommonSource,
    requires: [R.params, hashAddress],
});

/** Irradiância das cáusticas num ponto (o desenho). */
const causticsGather = wgslModule({
    name: 'caustics_gather',
    source: causticsGatherSource,
    requires: [R.params, causticsCommon, R.hash],
});

/**
 * As instâncias que fazem cáustica pela onda dos acertos (spec 039): o acerto sintético do centro de cada uma e, depois
 * do material avaliado por classe, a marca de cada instância. Sem a composição das funções `material`.
 */
export const causticsInstances = wgslModule({
    name: 'caustics_instances',
    source: causticsInstancesSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        causticsCapable,
        R.instanceCapable,
        rayScene,
        rayWave,
    ],
});

/** Fótons das fontes pelos caminhos especulares até a primeira difusa (com a composição das funções `material`). */
export const causticsTrace = wgslModule({
    name: 'caustics_trace',
    source: causticsTraceSource,
    requires: [
        constants,
        bsdf,
        random,
        basis,
        sampling,
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        causticsCommon,
        causticsCapable,
        R.hashAtomic,
        R.targets,
        R.instanceCapable,
        R.photons,
        R.queue,
        R.argsOut,
        R.args,
        rayWave,
        LIGHT_LIMIT.module,
        lightsResource,
        lightTransmissionReady,
        rayScene,
        rayHit,
        refractionScene,
        rayVolumeTransmittanceReady,
        rayVolumeBoundsReady,
        rayVolumeOccupiedReady,
    ],
});

/** Acúmulo das cáusticas no hash. */
export const causticsResolve = wgslModule({
    name: 'caustics_resolve',
    source: causticsResolveSource,
    requires: [WORKGROUP_SIZE.module, R.params, causticsCommon, R.hashAtomic],
});

/** A luz das cáusticas num ponto (`caustics_lighting`). */
const causticsLighting = wgslModule({
    name: 'caustics_lighting',
    source: causticsLightSource,
    requires: [constants, causticsGather, closureEval],
});

/** Contribuição ao ponto `scene_direct_lighting`: a luz das cáusticas no desenho. */
export const causticsLight = wgslModule({
    name: 'caustics_light',
    requires: [causticsLighting],
    source: 'fn scene_direct_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {\n    return caustics_lighting(c, p, n, v);\n}',
});

/** Contribuição ao ponto `scene_caustic_lighting`: a luz das cáusticas nos acertos dos raios. */
export const causticsRayLight = wgslModule({
    name: 'caustics_ray_light',
    requires: [causticsLighting],
    source: 'fn scene_caustic_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {\n    return caustics_lighting(c, p, n, v);\n}',
});
