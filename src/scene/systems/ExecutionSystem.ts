import type { EngineCore, FrameGpuTiming } from '../../core/contracts/index';
import type { GpuFrameTimedPayload } from '../events/EventMap';
import type { EventBus, Unsubscribe } from '../events/EventBus';
import type { FlowRegistry } from '../flows/FlowRegistry';
import type { Flow } from '../flows/Flow';
import type { BoundFlow } from '../flows/FlowBinding';

/**
 * ExecutionSystem grava o quadro: a cada `frameTick` emite `frameRecording` (a C2 envia os recursos sujos e
 * reconcilia os Flows), grava os Flows ativos por fase na ordem da regra única (fase → prioridade decrescente →
 * ordem de registro), faz `submit` e emite `frameComplete`.
 *
 * Os Flows ativos são os anunciados por `flowReady` (com o `BoundFlow` que o `dispatch` recebe) e ainda não
 * suspensos (`flowSuspended`); os eventos de domínio chegam a eles pela C2 (transições), não por aqui.
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

    private onFrameTick(dt: number, elapsed: number): void {
        this.elapsed = elapsed;
        // `dt` cobre o quadro inteiro de CPU: o envio dos dados alterados também conta.
        const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
        // Ordem explícita: dados sujos vão à GPU e os Flows são reconciliados antes de qualquer gravação.
        this.events.emit('frameRecording', { elapsed });
        const recordAndSubmit = (): void => {
            this.core.record('frame', (frame) => {
                // Um grupo de depuração por fase e por Flow (spec 034): nomeia o quadro nas capturas e dá o escopo dos
                // tempos de GPU de cada passe.
                for (const phase of this.flows.phasesInOrder()) {
                    const flows = this.flows
                        .flowsInPhase(phase)
                        .filter((flow) => this.active.has(flow));
                    if (flows.length === 0) continue;
                    frame.marker(phase, () => {
                        for (const flow of flows) {
                            const bound = this.active.get(flow)!;
                            frame.marker(flow.type, () => {
                                flow.dispatch(frame, bound);
                            });
                        }
                    });
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
        for (const timing of this.core.takeFrameTimings()) {
            this.events.emit('gpuFrameTimed', gpuFrameTimedOf(timing));
        }
        void dt;
    }

    /** Timestamp (ms) do último `frameComplete` emitido. Útil para sleep detection. */
    lastFrameTimestamp(): number {
        return this.lastFrameAt;
    }
}

/**
 * Agrega uma leitura de GPU pelos escopos da gravação (`fase/Flow/rótulo`): tempos por fase, por Flow e por passe, em
 * ms. Passes gravados fora dos grupos da C2 (ex.: cópias de crescimento de pool) entram em `outros`.
 */
export function gpuFrameTimedOf(timing: FrameGpuTiming): GpuFrameTimedPayload {
    const phasesMs: Record<string, number> = {};
    const flowsMs: Record<string, number> = {};
    const passesMs: Record<string, number> = {};
    for (const [path, ns] of Object.entries(timing.scopesNs)) {
        const ms = ns / 1e6;
        const parts = path.split('/');
        passesMs[path] = (passesMs[path] ?? 0) + ms;
        if (parts.length < 3) {
            phasesMs.outros = (phasesMs.outros ?? 0) + ms;
            continue;
        }
        const [phase, flow] = parts;
        phasesMs[phase!] = (phasesMs[phase!] ?? 0) + ms;
        flowsMs[flow!] = (flowsMs[flow!] ?? 0) + ms;
    }
    return { gpuFrame: timing.gpuFrame, totalMs: timing.gpuTimeMs, phasesMs, flowsMs, passesMs };
}
