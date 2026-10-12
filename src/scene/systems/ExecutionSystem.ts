import type { EngineCore } from '../../core/contracts/index';
import type { EventBus, Unsubscribe } from '../events/EventBus';
import type { FlowRegistry } from '../flows/FlowRegistry';
import type { Flow } from '../flows/Flow';
import type { BoundFlow } from '../flows/FlowBinding';
import { LegacyFlow } from '../flows/LegacyFlow';

/**
 * ExecutionSystem grava o quadro: a cada `frameTick` emite `frameRecording` (a C2 envia os recursos sujos e
 * reconcilia os Flows), grava os Flows ativos por fase na ordem da regra única (fase → prioridade decrescente →
 * ordem de registro), faz `submit` e emite `frameComplete`.
 *
 * Os Flows ativos são os anunciados por `flowReady` (com o `BoundFlow` que o `dispatch` recebe) e ainda não
 * suspensos (`flowSuspended`). Os estágios de migração (`LegacyFlow`) rodam quando `isReady()` e recebem os
 * broadcasts antigos (`onPoolReallocated`, `onCanvasResized`, `onEntities*`) até migrarem.
 *
 * Modo `captureErrors=true` envolve cada quadro em error scope GPU; erros viram `engineError` sem propagar.
 */
export class ExecutionSystem {
    private elapsed = 0;
    private lastFrameAt = 0;
    /**
     * Quando true, cada frame envolve record+submit em `core.withErrorScope('validation')`
     * e emite `engineError` em vez de propagar exception. GameLoop continua o próximo
     * frame normalmente. Ativado via `Application.create({ captureErrors: true })`.
     */
    captureErrors = false;
    private readonly subscriptions: Unsubscribe[];
    /** Flows prontos e o que o `dispatch` de cada um recebe. */
    private readonly active = new Map<Flow, BoundFlow>();

    constructor(
        private readonly core: EngineCore,
        private readonly events: EventBus,
        private readonly flows: FlowRegistry,
    ) {
        this.subscriptions = [
            this.events.on('frameTick', (e) => {
                this.onFrameTick(e.dt, e.elapsed);
            }),
            this.events.on('flowReady', (e) => {
                this.active.set(e.payload.flow, e.payload.bound);
            }),
            this.events.on('flowSuspended', (e) => {
                this.active.delete(e.payload.flow);
            }),
            this.events.on('poolReallocated', (e) => {
                for (const flow of this.legacyFlows()) flow.onPoolReallocated(e.poolKey);
            }),
            this.events.on('canvasReconfigured', (e) => {
                for (const flow of this.legacyFlows()) flow.onCanvasResized(e.width, e.height);
            }),
            this.events.on('entitiesInserted', (e) => {
                if (e.entityIds.length === 0) return;
                for (const flow of this.legacyFlows()) flow.onEntitiesInserted(e.entityIds);
            }),
            this.events.on('entitiesRemoved', (e) => {
                if (e.entityIds.length === 0) return;
                for (const flow of this.legacyFlows()) flow.onEntitiesRemoved(e.entityIds);
            }),
        ];
    }

    /** Desfaz as inscrições no EventBus (descarte da cena). */
    dispose(): void {
        for (const off of this.subscriptions) off();
        this.subscriptions.length = 0;
        this.active.clear();
    }

    /** O Flow está entre os ativos (anunciado por `flowReady` e não suspenso)? */
    isActive(flow: Flow): boolean {
        return this.active.has(flow);
    }

    private *legacyFlows(): IterableIterator<LegacyFlow> {
        for (const entry of this.flows.allFlows()) if (entry instanceof LegacyFlow) yield entry;
    }

    private onFrameTick(dt: number, elapsed: number): void {
        this.elapsed = elapsed;
        // `dt` cobre o quadro inteiro de CPU: o envio dos dados alterados também conta.
        const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
        // Ordem explícita: dados sujos vão à GPU e os Flows são reconciliados antes de qualquer gravação.
        this.events.emit('frameRecording', { elapsed });
        const recordAndSubmit = (): void => {
            this.core.record('frame', (frame) => {
                for (const phase of this.flows.phasesInOrder()) {
                    for (const entry of this.flows.phaseEntries(phase)) {
                        if (entry instanceof LegacyFlow) {
                            if (entry.isReady()) entry.dispatch(frame);
                            continue;
                        }
                        const bound = this.active.get(entry);
                        if (bound !== undefined) entry.dispatch(frame, bound);
                    }
                }
            });
            this.core.submit();
        };
        if (this.captureErrors) {
            // Fire-and-forget: error capturado vira evento, GameLoop continua.
            void this.core.withErrorScope('validation', recordAndSubmit).catch((e: unknown) => {
                const message = e instanceof Error ? e.message : String(e);
                this.events.emit('engineError', { stage: 'frame', filter: 'validation', message });
            });
        } else {
            recordAndSubmit();
        }
        const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this.lastFrameAt = finishedAt;
        this.events.emit('frameComplete', {
            timestamp: finishedAt,
            dt: finishedAt - start,
            elapsed: this.elapsed,
            stats: this.core.lastFrameStats(),
        });
        void dt;
    }

    /** Timestamp (ms) do último `frameComplete` emitido. Útil para sleep detection. */
    lastFrameTimestamp(): number {
        return this.lastFrameAt;
    }
}
