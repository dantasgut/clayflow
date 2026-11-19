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
import { CLOUD_SCATTER_PAGE, CLOUD_SHADOW_SLOT_COUNT, CLOUD_WEATHER_SIZE } from './schemas';
import {
    cloudAmbientKernel,
    cloudCoverageAt,
    cloudCoverageAtPoint,
    cloudCoverageKernel,
    cloudCoverageWeatherKernel,
    cloudOutputs,
    cloudPressureAt,
    cloudPressureAtPoint,
    cloudPanoramaKernel,
    cloudScatterFilterKernel,
    cloudScatterKernel,
    cloudScatterSlots,
    CLOUD_SHADOW_PAGE_GROUP,
    cloudShadowKernel,
    cloudShadowSlots,
    cloudWeatherKernel,
    cloudWeatherSlots,
} from './shaders';

/** Slots do estágio da luz das nuvens. */
export interface CloudLightSlots extends SlotMap {
    readonly cloud: SingletonSlot<false>;
    readonly sky: SingletonSlot<true>;
    /** O cache de espalhamento por páginas (T023; série por páginas: os registros e as sondas, os carimbos). */
    readonly cloudScatter: ChannelSlot<false>;
    /** O cache filtrado (série por páginas: os carimbos). */
    readonly cloudScatterFiltered: ChannelSlot<false>;
    /** O estado do tempo (spec 037; R19): a fatia anterior lida no lugar trazido pelo vento, a do quadro escrita. */
    readonly cloudWeather: ChannelSlot<false>;
    /** O atlas do mapa visto do sol, série por páginas (os carimbos e o relógio; R11 revisto). */
    readonly cloudShadow: ChannelSlot<false>;
    /** O registro das páginas do mapa visto do sol, série por páginas. */
    readonly cloudShadowPages: ChannelSlot<false>;
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
/** As partes do mapa visto do sol por páginas (a escolha do quadro; o desenho e as provas), sem e com o tempo. */
const shadowParts = (weather: boolean): readonly PipelineDescriptor[] => {
    const shader = weather ? cloudShadowKernel.weather : cloudShadowKernel.plain;
    const tag = weather ? ':weather' : '';
    return [
        compute(`cloud_shadow_select${tag}`, shader, 'cloud_shadow_select_main'),
        compute(`cloud_shadow${tag}`, shader, 'cloud_shadow_main'),
    ];
};
const PANORAMA = compute('cloud_panorama', cloudPanoramaKernel, 'cloud_panorama_main');
const SCATTER_SELECT = compute(
    'cloud_scatter_select',
    cloudScatterKernel,
    'cloud_scatter_select_main',
);
const SCATTER = compute('cloud_scatter', cloudScatterKernel, 'cloud_scatter_main');
/** Sondas por página do cache de espalhamento (8³). */
const SCATTER_PAGE_PROBES = CLOUD_SCATTER_PAGE ** 3;
const SCATTER_FILTER = compute(
    'cloud_scatter_filter',
    cloudScatterFilterKernel,
    'cloud_scatter_filter_main',
);

/** Ids dos alvos que o estágio escreve, na ordem das saídas. */
const TARGETS = ['coverage', 'ambient', 'shadow', 'panorama'] as const;

/**
 * CloudLightFlow — a luz das nuvens que outros estágios leem (spec 041, R4, R9, R11, R12, R19; fase `shadow`, antes das
 * sondas da GI e da névoa): com o tempo, o estado dele (série da 037) e o vento das nuvens pelo campo de pressão; o mapa
 * de cobertura pelo tempo, pela função de cobertura ou pelos valores globais, as irradiâncias do céu e do
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
        ...cloudWeatherSlots,
        ...cloudShadowSlots,
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private views: readonly (TextureViewSpec | undefined)[] = [];
    private coverage: string | undefined;
    /** O pipeline do tempo (pelo módulo composto com a função de pressão), ou `undefined` sem o tempo (R19). */
    private weather: string | undefined;
    private weatherView: TextureViewSpec | undefined;
    /** As partes do mapa visto do sol preparadas (sem ou com o tempo), ou `undefined`. */
    private shadow: readonly PipelineDescriptor[] | undefined;
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
                // A camada redescrita (o perfil mudou o tamanho dos alvos): as saídas privadas são religadas às texturas novas
                // antes de os grupos serem refeitos (o `framePrepare` viria depois, com o grupo já pedindo a vista destruída).
                slotChanged: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
                // A camada saiu: os pipelines e as saídas privadas ligadas às texturas dela saem junto (o filtro do
                // cache lê a série, que some com ela — a C2 refaria o grupo com a saída destruída).
                slotLost: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.release(c);
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
     * A cobertura, as irradiâncias, o mapa visto do sol por páginas, a escolha e os caminhos das páginas do cache, o cache
     * filtrado (as sondas cuja vizinhança caminhou) e o panorama, nesta ordem.
     */
    dispatch(frame: Frame, bound: BoundFlow<CloudLightSlots>): void {
        if (!this.active || this.coverage === undefined) return;
        const cloud = bound.slots.cloud.resource as CloudLayer;
        const q = cloud.quality;
        // Despacho linear (um texel por invocação); as irradiâncias, um grupo só.
        const weather: [string, string, number][] =
            this.weather === undefined
                ? []
                : [
                      [
                          this.weather,
                          'CloudLightFlow.weather',
                          CLOUD_WEATHER_SIZE * CLOUD_WEATHER_SIZE,
                      ],
                  ];
        const steps: [string, string, number][] = [
            ...weather,
            [this.coverage, 'CloudLightFlow.coverage', q.coverageSize * q.coverageSize],
            [AMBIENT.id, 'CloudLightFlow.ambient', WORKGROUP_SIZE.value],
            // A escolha das páginas do cache (um grupo) e os caminhos das escolhidas (até o orçamento).
            [SCATTER_SELECT.id, 'CloudLightFlow.scatterSelect', 0],
            [SCATTER.id, 'CloudLightFlow.scatter', q.scatter.budget * SCATTER_PAGE_PROBES],
            [
                SCATTER_FILTER.id,
                'CloudLightFlow.scatterFilter',
                q.scatter.size[0] * q.scatter.size[1] * q.scatter.size[2],
            ],
            [PANORAMA.id, 'CloudLightFlow.panorama', q.panorama[0] * q.panorama[1]],
        ];
        const ready = steps.map(([id]) => bound.pipelines.get(id));
        const parts = (this.shadow ?? []).map((d) => bound.pipelines.get(d.id));
        if (
            this.shadow === undefined
            || [...ready, ...parts].some((p) => p?.role !== 'compute' || !p.ready)
        )
            return;
        const [select, draw] = parts;
        steps.forEach(([id, label, count], k) => {
            const p = ready[k]!;
            if (p.role !== 'compute') return;
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind);
                if (count === 0) pass.dispatch.workgroups(1);
                else pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
            });
            // O mapa visto do sol por páginas depois das irradiâncias (antes dos caminhos do cache, que o leem): a escolha
            // marca as páginas do quadro (as provas do quadro anterior entram nela), e um grupo por página física desenha
            // as marcadas e prova as demais.
            if (id === AMBIENT.id && select?.role === 'compute' && draw?.role === 'compute') {
                frame.compute('CloudLightFlow.shadowSelect', (pass) => {
                    pass.bind.setPipeline(select.spec);
                    select.bindTo(pass.bind);
                    pass.dispatch.workgroups(1);
                });
                frame.compute('CloudLightFlow.shadow', (pass) => {
                    pass.bind.setPipeline(draw.spec);
                    draw.bindTo(pass.bind);
                    pass.dispatch.invocations(
                        CLOUD_SHADOW_SLOT_COUNT * CLOUD_SHADOW_PAGE_GROUP.value,
                        CLOUD_SHADOW_PAGE_GROUP.value,
                    );
                });
                bound.slots.cloudShadow.written();
                bound.slots.cloudShadowPages.written();
            }
            // As páginas do cache e do cache filtrado escritas no quadro (carimbadas na época da série).
            if (id === SCATTER_FILTER.id) {
                bound.slots.cloudScatter.written();
                bound.slots.cloudScatterFiltered.written();
            }
            // O estado do tempo escrito: a série gira (o mapa de cobertura lê a fatia do quadro).
            if (id === this.weather) bound.slots.cloudWeather.written();
        });
        // Os alvos do quadro existem: as contribuições (a sombra, o céu coberto) passam a valer.
        cloud.setActive(true);
        (bound.slots.sky?.resource as Sky | undefined)?.setCovered(true);
    }

    override dispose(): void {}

    /**
     * Solta os pipelines e as saídas ligadas (a camada ou o céu saiu): nenhum fica esperando o que saiu — o uniforme do
     * céu, as texturas da camada —, e o motor fica pronto; voltando, tudo é preparado de novo.
     */
    private release(c: Ctx): void {
        if (this.prepared)
            for (const p of [AMBIENT, SCATTER_SELECT, SCATTER, SCATTER_FILTER, PANORAMA])
                c.release(p.id);
        for (const p of this.shadow ?? []) c.release(p.id);
        this.shadow = undefined;
        if (this.coverage !== undefined) c.release(this.coverage);
        if (this.weather !== undefined) c.release(this.weather);
        this.coverage = undefined;
        this.weather = undefined;
        this.weatherView = undefined;
        this.prepared = false;
        this.views = [];
        this.active = false;
    }

    private prepare(c: Ctx): void {
        const cloud = c.bound.slots.cloud.resource as CloudLayer;
        const sky = c.bound.slots.sky?.resource as Sky | undefined;
        if (sky === undefined) {
            cloud.setActive(false);
            if (this.prepared || this.coverage !== undefined) this.release(c);
            return;
        }
        this.active = true;
        for (const id of TARGETS) this.resources.ensureAllocated(cloud, id);
        this.resources.ensureAllocated(cloud, 'scatter');
        this.resources.ensureAllocated(cloud, 'scatterWork');
        this.resources.ensureAllocated(cloud, 'scatterFiltered');
        this.resources.ensureAllocated(cloud, 'shadowPages');
        this.resources.ensureAllocated(cloud, 'shadowWork');
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
                for (const p of [AMBIENT, SCATTER_SELECT, SCATTER, SCATTER_FILTER, PANORAMA])
                    c.prepare(p);
                this.prepared = true;
            }
        }
        this.syncWeather(c, cloud);
        // O mapa visto do sol pelo vento local das nuvens com o tempo (a escolha do quadro lê o vento que sobra).
        const parts = shadowParts(cloud.weather !== undefined);
        if (this.shadow?.[0]?.id !== parts[0]!.id) {
            for (const p of this.shadow ?? []) c.release(p.id);
            for (const p of parts) c.prepare(p);
            this.shadow = parts;
        }
        // O mapa de cobertura pelo tempo (R19), ou composto com a função de cobertura da camada (ou o pronto: os valores
        // globais).
        const composite = cloud.coverageFunction?.composite;
        const weather = cloud.weather !== undefined;
        const id = weather
            ? 'cloud_coverage:weather'
            : composite === undefined
              ? 'cloud_coverage'
              : `cloud_coverage:${composite.module.name}`;
        if (id !== this.coverage) {
            if (this.coverage !== undefined) c.release(this.coverage);
            if (weather)
                c.prepare(compute(id, cloudCoverageWeatherKernel, 'cloud_coverage_weather_main'));
            else {
                const shader =
                    composite === undefined
                        ? cloudCoverageKernel
                        : bindPoints(
                              cloudCoverageKernel,
                              new Map([[cloudCoverageAtPoint, cloudCoverageAt(composite)]]),
                          );
                c.prepare(compute(id, shader, 'cloud_coverage_main'));
            }
            this.coverage = id;
        }
    }

    /**
     * O tempo (R19): com ele, o estado e o vento das nuvens alocados, a saída do vento ligada e o kernel do tempo composto
     * com a função de pressão da camada (ou o pronto: o padrão de sistemas); sem ele, nada (o pipeline solto).
     */
    private syncWeather(c: Ctx, cloud: CloudLayer): void {
        if (cloud.weather === undefined) {
            if (this.weather !== undefined) c.release(this.weather);
            this.weather = undefined;
            this.weatherView = undefined;
            return;
        }
        this.resources.ensureAllocated(cloud, 'weather');
        this.resources.ensureAllocated(cloud, 'weatherWind');
        const view = c.bound.slots.cloud.textureViewOf('weatherWind');
        if (view === undefined) return;
        if (view !== this.weatherView) {
            c.bind(new Map<WgslResource, BindingSource>([[cloudOutputs.weatherWind, view]]));
            this.weatherView = view;
        }
        const composite = cloud.pressureFunction?.composite;
        const id =
            composite === undefined ? 'cloud_weather' : `cloud_weather:${composite.module.name}`;
        if (id === this.weather) return;
        if (this.weather !== undefined) c.release(this.weather);
        const shader =
            composite === undefined
                ? cloudWeatherKernel
                : bindPoints(
                      cloudWeatherKernel,
                      new Map([[cloudPressureAtPoint, cloudPressureAt(composite)]]),
                  );
        c.prepare(compute(id, shader, 'cloud_weather_main'));
        this.weather = id;
    }
}
