import type { Flow } from '../../flows/Flow';
import type { RegisterOptions } from '../../flows/FlowRegistry';
import type { Unsubscribe } from '../../events/EventBus';
import { FlowRuntime, type FlowRuntimeHost } from './FlowRuntime';
import { ScenePoints } from './ScenePoints';

/**
 * Os Flows alocados pela C2 e a sua reação a eventos da cena: entidades (slots `entities`, entregues agregadas por
 * quadro), pools recriados, canvas redimensionado, `resourceReady`/`poolWritten` dos schemas escutados e mudanças de
 * recursos (slots e fontes). A
 * reconciliação (slots → pipelines → bind groups → ciclo de vida) roda na alocação, no redimensionamento e antes de
 * cada gravação de quadro, só para os Flows com mudanças.
 */
export class FlowBinder {
    private readonly runtimes = new Map<Flow, FlowRuntime>();
    private readonly subscriptions: Unsubscribe[];
    private readonly host: FlowRuntimeHost;

    constructor(host: Omit<FlowRuntimeHost, 'scenePoints'>) {
        const scenePoints = new ScenePoints(host.core, host.world, host.resources);
        this.host = { ...host, scenePoints };
        const events = host.events;
        this.subscriptions = [
            events.on('resourcesChanged', (e) => {
                this.markAll();
                if (scenePoints.resourcesChanged(e.added, e.removed)) this.sceneChanged();
            }),
            events.on('entitiesInserted', (e) => {
                for (const rt of this.runtimes.values())
                    if (rt.hasEntities) rt.entitiesInserted(e.entityIds);
            }),
            events.on('entitiesRemoved', (e) => {
                for (const rt of this.runtimes.values())
                    if (rt.hasEntities) rt.entitiesRemoved(e.entityIds);
            }),
            events.on('entitiesRecomposed', (e) => {
                for (const rt of this.runtimes.values())
                    if (rt.hasEntities) rt.entitiesRecomposed(e.entityIds);
            }),
            events.on('poolReallocated', (e) => {
                for (const rt of this.runtimes.values()) {
                    rt.dirty = true;
                    if (rt.slotPools.has(e.poolKey))
                        rt.deliverDomain({ type: 'poolReallocated', poolKey: e.poolKey });
                }
            }),
            events.on('canvasReconfigured', (e) => {
                this.markAll();
                this.reconcile();
                for (const rt of this.runtimes.values()) {
                    if (rt.hasTarget) {
                        rt.deliverDomain({
                            type: 'canvasReconfigured',
                            width: e.width,
                            height: e.height,
                        });
                    }
                }
            }),
            events.on('frameComplete', () => {
                for (const rt of this.runtimes.values()) rt.frameRecorded();
            }),
            events.on('resourceReady', (e) => {
                const resource = e.payload.resource;
                if (scenePoints.resourceUploaded(resource)) this.sceneChanged();
                for (const rt of this.runtimes.values()) {
                    rt.resourceUploaded(resource);
                    const schema = rt.listenedSchema(resource);
                    if (schema !== undefined)
                        rt.deliverDomain({ type: 'resourceReady', schema, resource });
                }
            }),
            events.on('poolWritten', (e) => {
                if (scenePoints.poolWritten(e.schema.name)) this.sceneChanged();
                for (const rt of this.runtimes.values()) {
                    rt.poolWritten(e.poolKey, e.schema.name, e.ranges, e.fields);
                    if (rt.listens(e.schema)) {
                        rt.deliverDomain({
                            type: 'poolWritten',
                            poolKey: e.poolKey,
                            schema: e.schema,
                            ranges: e.ranges,
                        });
                    }
                }
            }),
        ];
    }

    /** Cria o runtime do Flow e o reconcilia (fica pronto agora se os slots existem e a compilação é síncrona). */
    ensure(flow: Flow, options: RegisterOptions): void {
        if (this.runtimes.has(flow)) return;
        const runtime = new FlowRuntime(this.host, flow, options);
        this.runtimes.set(flow, runtime);
        runtime.reconcile(true);
    }

    /** Descarta o runtime e o Flow. */
    release(flow: Flow): void {
        const runtime = this.runtimes.get(flow);
        if (runtime === undefined) return;
        this.runtimes.delete(flow);
        runtime.dispose();
    }

    /** Reconcilia os Flows com mudanças. */
    reconcile(): void {
        for (const rt of [...this.runtimes.values()]) rt.reconcile();
    }

    /**
     * Antes da gravação do quadro: entrega as mudanças de entidades acumuladas (um `entitiesChanged` por slot),
     * reconcilia e entrega `framePrepare` (escritas por quadro). Uma escrita que mude
     * fontes (ex.: `ctx.bind`) entra na reconciliação seguinte, ainda antes da gravação.
     */
    prepareFrame(): void {
        for (const rt of [...this.runtimes.values()]) rt.deliverEntityChanges();
        this.reconcile();
        for (const rt of [...this.runtimes.values()]) rt.framePrepare();
        this.reconcile();
    }

    /** Descarta todos os runtimes e desfaz as inscrições. */
    dispose(): void {
        for (const flow of [...this.runtimes.keys()]) this.release(flow);
        for (const off of this.subscriptions) off();
        this.subscriptions.length = 0;
        this.host.scenePoints.dispose();
    }

    /** As funções de cena mudaram: cada runtime prepara de novo os pipelines com pontos de cena. */
    private sceneChanged(): void {
        for (const rt of this.runtimes.values()) rt.sceneChanged();
    }

    private markAll(): void {
        for (const rt of this.runtimes.values()) rt.dirty = true;
    }
}
