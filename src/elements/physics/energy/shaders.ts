import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { slot } from '../../../scene/flows/slots';
import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { linalg, quat } from '../../gpu/shaders/math';
import bodyEnergySource from '../../gpu/wgsl/kernels/body_energy.wgsl?raw';
import softEnergySource from '../../gpu/wgsl/kernels/soft_energy.wgsl?raw';
import softEnergyPartialSource from '../../gpu/wgsl/kernels/soft_energy_partial.wgsl?raw';
import softEnergyReadySource from '../../gpu/wgsl/kernels/soft_energy_source_ready.wgsl?raw';
import softEnergyNodesSource from '../../gpu/wgsl/kernels/soft_energy_nodes.wgsl?raw';
import softEnergySourceNodes from '../../gpu/wgsl/kernels/soft_energy_source_nodes.wgsl?raw';
import softEnergySourceEdges from '../../gpu/wgsl/kernels/soft_energy_source_edges.wgsl?raw';
import softEnergySourceMpm from '../../gpu/wgsl/kernels/soft_energy_source_mpm.wgsl?raw';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { XPBDSoftSchema } from '../bodies/schemas/XPBDSoftSchema';
import { FEMSchema } from '../bodies/schemas/FEMSchema';
import { MPMSoftSchema } from '../bodies/schemas/MPMSoftSchema';
import { DistanceConstraint } from '../constraints/DistanceConstraint';
import {
    BODY_ENERGY_HISTORY,
    BodyEnergySchema,
    EnergyMeterSchema,
    SOFT_ENERGY_CHUNK,
    SoftBodyChunkSchema,
    SoftBodyEnergySchema,
    SoftBodyPartialSchema,
    SoftBodyRangeSchema,
    SoftEnergyParamsSchema,
} from './schemas';

// Módulos da energia dos corpos rígidos (spec 037): os corpos do LCP (lidos), a série `BodyEnergy` (canal temporal da C2:
// a fatia do passo, a anterior e a mais antiga da janela) e os parâmetros do medidor.

/** Os slots do estágio da energia: o canal do pool `BodyEnergy`. */
export const bodyEnergySlots = Object.freeze({
    bodyEnergy: slot.poolChannel(BodyEnergySchema.name),
});

const energy = (name: string, lag: number, access: 'read' | 'read_write') =>
    wgslResource({
        name,
        binding: { storage: access },
        type: { schema: BodyEnergySchema, array: true },
        frequency: 'stage',
        provider: { slot: 'bodyEnergy', lag },
    });

/** Recursos do kernel da energia. */
export const bodyEnergyResources = Object.freeze({
    meter: wgslResource({
        name: 'energy_meter',
        binding: { uniform: true },
        type: { schema: EnergyMeterSchema },
        frequency: 'frame',
        provider: { consumer: 'EnergyMeter.params' },
    }),
    bodies: wgslResource({
        name: 'energy_bodies',
        binding: { storage: 'read' },
        type: { schema: LCPSchema, array: true },
        frequency: 'stage',
        provider: { pool: LCPSchema.name },
    }),
    current: energy('body_energy', 0, 'read_write'),
    previous: energy('body_energy_previous', 1, 'read'),
    oldest: energy('body_energy_oldest', BODY_ENERGY_HISTORY - 1, 'read'),
});

/** O kernel da energia: uma invocação por corpo do pool do LCP. */
export const bodyEnergy = wgslModule({
    name: 'body_energy_kernel',
    source: bodyEnergySource,
    requires: [
        WORKGROUP_SIZE.module,
        quat,
        bodyEnergyResources.meter,
        bodyEnergyResources.bodies,
        bodyEnergyResources.current,
        bodyEnergyResources.previous,
        bodyEnergyResources.oldest,
    ],
    structs: [LCPSchema, BodyEnergySchema],
});

// Módulos da energia dos corpos moles (spec 037): os registros das faixas e dos blocos, as somas dos blocos, a série
// `SoftBodyEnergy` (canal da C2), os parâmetros por algoritmo (uma região por despacho) e o ponto da fonte das
// partículas, com as fontes de cada algoritmo. Duas passadas: um grupo por bloco (a soma dele, pela fonte do algoritmo)
// e um grupo por corpo (a soma dos blocos e a fatia da série).

/** Os slots do estágio da energia dos corpos moles: o canal do pool `SoftBodyEnergy`. */
export const softEnergySlots = Object.freeze({
    softEnergy: slot.poolChannel(SoftBodyEnergySchema.name),
});

const softEnergy = (name: string, lag: number, access: 'read' | 'read_write') =>
    wgslResource({
        name,
        binding: { storage: access },
        type: { schema: SoftBodyEnergySchema, array: true },
        frequency: 'stage',
        provider: { slot: 'softEnergy', lag },
    });

const particles = (name: string, schema: typeof XPBDSoftSchema) =>
    wgslResource({
        name,
        binding: { storage: 'read' },
        type: { schema, array: true },
        frequency: 'stage',
        provider: { pool: schema.name },
    });

/** Recursos do kernel da energia dos corpos moles. */
export const softEnergyResources = Object.freeze({
    /** Uma região por algoritmo (offset dinâmico): o despacho toma só os registros dele. */
    params: wgslResource({
        name: 'soft_energy_params',
        binding: { uniform: true },
        type: { schema: SoftEnergyParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    ranges: wgslResource({
        name: 'soft_ranges',
        binding: { storage: 'read' },
        type: { schema: SoftBodyRangeSchema, array: true },
        frequency: 'stage',
        provider: { pool: SoftBodyRangeSchema.name },
    }),
    chunks: wgslResource({
        name: 'soft_chunks',
        binding: { storage: 'read' },
        type: { schema: SoftBodyChunkSchema, array: true },
        frequency: 'stage',
        provider: { pool: SoftBodyChunkSchema.name },
    }),
    /** As somas dos blocos: escritas na passada 1, lidas na 2. */
    partials: wgslResource({
        name: 'soft_partials',
        binding: { storage: 'read_write' },
        type: { schema: SoftBodyPartialSchema, array: true },
        frequency: 'stage',
        provider: { pool: SoftBodyPartialSchema.name },
    }),
    partialsRead: wgslResource({
        name: 'soft_partials_read',
        binding: { storage: 'read' },
        type: { schema: SoftBodyPartialSchema, array: true },
        frequency: 'stage',
        provider: { pool: SoftBodyPartialSchema.name },
    }),
    current: softEnergy('soft_energy', 0, 'read_write'),
    previous: softEnergy('soft_energy_previous', 1, 'read'),
    oldest: softEnergy('soft_energy_oldest', BODY_ENERGY_HISTORY - 1, 'read'),
    /** As partículas do XPBD e os nós do FEM (o mesmo struct `Particle`, pools distintos: nunca no mesmo pipeline). */
    xpbdNodes: particles('soft_nodes', XPBDSoftSchema),
    femNodes: particles('soft_nodes', FEMSchema),
    edges: wgslResource({
        name: 'soft_edges',
        binding: { storage: 'read' },
        type: { schema: DistanceConstraint.schema, array: true },
        frequency: 'stage',
        provider: { pool: DistanceConstraint.schema.name },
    }),
    mpm: particles('soft_mpm_particles', MPMSoftSchema),
});

const SR = softEnergyResources;

/** Fonte pronta: sem partículas, sem energia. */
export const softEnergySourceReady = wgslModule({
    name: 'soft_energy_source_ready',
    source: softEnergyReadySource,
    structs: [SoftBodyRangeSchema],
});

/** Ponto da fonte das partículas: os três termos da fatia estriada de um corpo. */
export const softEnergySourcePoint: BindablePoint = {
    name: 'soft_energy_source',
    ready: softEnergySourceReady,
};

/** Passada 1: um grupo por bloco dos corpos do algoritmo, a soma dele pela fonte (o ponto `soft_energy_source`). */
export const softEnergyPartialKernel = wgslModule({
    name: 'soft_energy_partial_kernel',
    source: softEnergyPartialSource,
    requires: [
        WORKGROUP_SIZE.module,
        SR.params,
        SR.ranges,
        SR.chunks,
        SR.partials,
        softEnergySourceReady,
    ],
    structs: [SoftBodyRangeSchema, SoftBodyChunkSchema, SoftBodyPartialSchema],
});

/** Passada 2: um grupo por corpo, a soma dos blocos dele e a fatia da série. */
export const softEnergySeriesKernel = wgslModule({
    name: 'soft_energy_series_kernel',
    source: softEnergySource,
    requires: [
        WORKGROUP_SIZE.module,
        SR.params,
        SR.ranges,
        SR.partialsRead,
        SR.current,
        SR.previous,
        SR.oldest,
    ],
    structs: [SoftBodyRangeSchema, SoftBodyPartialSchema, SoftBodyEnergySchema],
});

const nodes = (name: string, resource: typeof SR.xpbdNodes) =>
    wgslModule({
        name,
        source: softEnergyNodesSource,
        requires: [WORKGROUP_SIZE.module, SOFT_ENERGY_CHUNK.module, SR.params, resource],
        structs: [SoftBodyRangeSchema],
    });

const xpbdNodes = nodes('soft_energy_nodes_xpbd', SR.xpbdNodes);
const femNodes = nodes('soft_energy_nodes_fem', SR.femNodes);

/** As fontes de cada algoritmo (o lugar do ponto `soft_energy_source`). */
export const softEnergySources = Object.freeze({
    /** XPBD com as arestas (o pool `DistanceConstraint` na cena). */
    xpbdEdges: wgslModule({
        name: 'soft_energy_source_edges',
        source: softEnergySourceEdges,
        requires: [
            WORKGROUP_SIZE.module,
            SOFT_ENERGY_CHUNK.module,
            xpbdNodes,
            SR.xpbdNodes,
            SR.edges,
        ],
        structs: [SoftBodyRangeSchema],
    }),
    /** XPBD sem restrições na cena. */
    xpbdNodes: wgslModule({
        name: 'soft_energy_source_nodes_xpbd',
        source: softEnergySourceNodes,
        requires: [xpbdNodes],
        structs: [SoftBodyRangeSchema],
    }),
    /** FEM (sem modelo elástico no motor). */
    femNodes: wgslModule({
        name: 'soft_energy_source_nodes_fem',
        source: softEnergySourceNodes,
        requires: [femNodes],
        structs: [SoftBodyRangeSchema],
    }),
    /** MPM: Neo-Hookean do material. */
    mpm: wgslModule({
        name: 'soft_energy_source_mpm',
        source: softEnergySourceMpm,
        requires: [WORKGROUP_SIZE.module, SOFT_ENERGY_CHUNK.module, linalg, SR.params, SR.mpm],
        structs: [SoftBodyRangeSchema],
    }),
});
