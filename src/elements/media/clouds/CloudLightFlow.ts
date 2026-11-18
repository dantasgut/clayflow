import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { Frame, TextureViewSpec } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { Sky } from '../../scene/sky/Sky';
import { CloudLayer } from './CloudLayer';
import {
    cloudAmbientKernel,
    cloudCoverageAt,
    cloudCoverageAtPoint,
    cloudCoverageKernel,
    cloudOutputs,
    cloudPanoramaKernel,
    cloudScatterFilterKernel,
    cloudScatterKernel,
    cloudScatterSlots,
    cloudScatterSunSlots,
    cloudShadowKernel,
} from './shaders';

/** Slots do estágio da luz das nuvens. */
export interface CloudLightSlots extends SlotMap {
    readonly cloud: SingletonSlot<false>;
    readonly sky: SingletonSlot<true>;
    /** O cache de espalhamento (spec 037; T023): a fatia anterior lida, a do quadro escrita. */
    readonly cloudScatter: ChannelSlot<false>;
    /** O sol do cache de espalhamento no quadro anterior (T023). */
    readonly cloudScatterSun: ChannelSlot<false>;
}

type Ctx = TransitionContext<CloudLightSlots>;

const compute = (
    id: string,
    shader: PipelineDescriptor['shader'],
    entry: string,
): PipelineDescriptor => ({
    id,
    role: 'compute',
    shader,
    entryPoints: [entry],
});

const AMBIENT = compute('cloud_ambient', cloudAmbientKernel, 'cloud_ambient_main');
const SHADOW = compute('cloud_shadow', cloudShadowKernel, 'cloud_shadow_main');
const PANORAMA = compute('cloud_panorama', cloudPanoramaKernel, 'cloud_panorama_main');
const SCATTER = compute('cloud_scatter', cloudScatterKernel, 'cloud_scatter_main');
const SCATTER_FILTER = compute(
    'cloud_scatter_filter',
    cloudScatterFilterKernel,
    'cloud_scatter_filter_main',
);

/** Ids dos alvos que o estágio escreve, na ordem das saídas. */
const TARGETS = ['coverage', 'ambient', 'shadow', 'panorama'] as const;

/**
 * CloudLightFlow — a luz das nuvens que outros estágios leem (spec 041, R4, R9, R11, R12; fase `shadow`, antes das sondas
 * da GI e da névoa): o mapa de cobertura pela função de cobertura (ou os valores globais), as irradiâncias do céu e do
 * chão, o mapa de transmitância visto do sol (a sombra das nuvens em `light_transmission`) e o panorama das nuvens (o
 * céu coberto em `sky_cover`), cada um inteiro a cada quadro. Com tudo pronto, liga as contribuições da camada e a
 * leitura de `sky_cover` no ambiente do `Sky`. Sem `Sky`, nada.
 */
export class CloudLightFlow extends Flow<CloudLightSlots, 'idle'> {
    readonly type = 'CloudLightFlow';
    readonly slots: CloudLightSlots = {
        cloud: slot.singleton(CloudLayer.schema),
        sky: slot.singleton(Sky.schema, { optional: true }),
        ...cloudScatterSlots,
        ...cloudScatterSunSlots,
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private views: readonly (TextureViewSpec | undefined)[] = [];
    private coverage: string | undefined;
    private prepared = false;
    private active = false;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.transitions = {
            '*': {
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
                slotsResolved: 'ignore',
                entitiesChanged: 'ignore',
                slotChanged: 'ignore',
                // A camada saiu: os pipelines e as saídas privadas ligadas às texturas dela saem junto (o filtro do
                // cache lê a série, que some com ela — a C2 refaria o grupo com a saída destruída).
                slotLost: {
                    to: 'idle',
                    run: (_e, c) => {
                        for (const p of [AMBIENT, SHADOW, SCATTER, SCATTER_FILTER, PANORAMA])
                            c.release(p.id);
                        if (this.coverage !== undefined) c.release(this.coverage);
                        this.coverage = undefined;
                        this.prepared = false;
                        this.views = [];
                        this.active = false;
                    },
                },
                pipelinesCompiled: 'ignore',
                pipelineRejected: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
            },
        };
    }

    /**
     * A cobertura, as irradiâncias, a sombra, o cache filtrado (da fatia do quadro anterior), o panorama e, por último,
     * os caminhos do cache. Os caminhos são longos e em série (a latência de cada um, não a vazão, faz o tempo do
     * passe): com a marcha e o panorama lendo o cache do quadro anterior, nada do quadro espera por eles, e a GPU os
     * sobrepõe ao resto do quadro.
     */
    dispatch(frame: Frame, bound: BoundFlow<CloudLightSlots>): void {
        if (!this.active || this.coverage === undefined) return;
        const cloud = bound.slots.cloud.resource as CloudLayer;
        const q = cloud.quality;
        // Despacho linear (um texel por invocação); as irradiâncias, um grupo só.
        const steps: [string, string, number][] = [
            [this.coverage, 'CloudLightFlow.coverage', q.coverageSize * q.coverageSize],
            [AMBIENT.id, 'CloudLightFlow.ambient', WORKGROUP_SIZE.value],
            [SHADOW.id, 'CloudLightFlow.shadow', q.shadow.size * q.shadow.size],
            [
                SCATTER_FILTER.id,
                'CloudLightFlow.scatterFilter',
                q.scatter.size[0] * q.scatter.size[1] * q.scatter.size[2],
            ],
            [PANORAMA.id, 'CloudLightFlow.panorama', q.panorama[0] * q.panorama[1]],
            [
                SCATTER.id,
                'CloudLightFlow.scatter',
                q.scatter.size[0] * q.scatter.size[1] * q.scatter.size[2],
            ],
        ];
        const ready = steps.map(([id]) => bound.pipelines.get(id));
        if (ready.some((p) => p?.role !== 'compute' || !p.ready)) return;
        steps.forEach(([id, label, count], k) => {
            const p = ready[k]!;
            if (p.role !== 'compute') return;
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind);
                pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
            });
            // O cache de espalhamento escrito: a série gira (o panorama e a marcha leem a fatia do quadro).
            if (id === SCATTER.id) {
                bound.slots.cloudScatter.written();
                bound.slots.cloudScatterSun.written();
            }
        });
        // Os alvos do quadro existem: as contribuições (a sombra, o céu coberto) passam a valer.
        cloud.setActive(true);
        (bound.slots.sky?.resource as Sky | undefined)?.setCovered(true);
    }

    override dispose(): void {}

    private prepare(c: Ctx): void {
        const cloud = c.bound.slots.cloud.resource as CloudLayer;
        const sky = c.bound.slots.sky?.resource as Sky | undefined;
        this.active = sky !== undefined;
        if (sky === undefined) {
            cloud.setActive(false);
            return;
        }
        for (const id of TARGETS) this.resources.ensureAllocated(cloud, id);
        this.resources.ensureAllocated(cloud, 'scatter');
        this.resources.ensureAllocated(cloud, 'scatterSun');
        this.resources.ensureAllocated(cloud, 'scatterFiltered');
        const views = TARGETS.map((id) => c.bound.slots.cloud.textureViewOf(id));
        if (views.some((v) => v === undefined)) {
            this.active = false;
            return;
        }
        if (views.some((v, k) => v !== this.views[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [cloudOutputs.coverage, views[0]!],
                    [cloudOutputs.ambient, views[1]!],
                    [cloudOutputs.shadow, views[2]!],
                    [cloudOutputs.panorama, views[3]!],
                ]),
            );
            this.views = views;
            if (!this.prepared) {
                for (const p of [AMBIENT, SHADOW, SCATTER, SCATTER_FILTER, PANORAMA]) c.prepare(p);
                this.prepared = true;
            }
        }
        // O mapa de cobertura composto com a função de cobertura da camada (ou o pronto: os valores globais).
        const composite = cloud.coverageFunction?.composite;
        const id =
            composite === undefined ? 'cloud_coverage' : `cloud_coverage:${composite.module.name}`;
        if (id !== this.coverage) {
            if (this.coverage !== undefined) c.release(this.coverage);
            const shader =
                composite === undefined
                    ? cloudCoverageKernel
                    : bindPoints(
                          cloudCoverageKernel,
                          new Map([[cloudCoverageAtPoint, cloudCoverageAt(composite)]]),
                      );
            c.prepare(compute(id, shader, 'cloud_coverage_main'));
            this.coverage = id;
        }
    }
}
