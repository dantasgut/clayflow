import type { EventBus } from '../events/EventBus';
import type { PendingWork } from '../events/EventMap';

/** Estado da prontidão. */
export type ReadinessState = 'preparing' | 'ready';

/**
 * Quadros seguidos com o mesmo binding sem fonte num Flow ativo até o aviso `consumerMissing` (2 s a 60 Hz): uma fonte
 * que chega por upload aparece em um ou dois quadros; uma que nunca chega é um consumidor sem resolvedor (H2).
 */
export const CONSUMER_MISSING_FRAMES = 120;

/**
 * Prontidão do motor (C2, spec 034): avaliada a cada quadro pela reconciliação dos Flows. `ready` quando nenhum Flow
 * ativo tem pipeline sem fonte, em conferência, compilando ou trocando; senão `preparing`, com a lista do que falta.
 * As transições saem como eventos (`enginePreparing`, `engineReady`); um binding sem fonte que persiste vira
 * `consumerMissing`, uma vez por Flow, pipeline e nome. A prontidão só informa: não bloqueia o quadro nem mexe no
 * tempo da simulação.
 */
export class EngineReadiness {
    private current: ReadinessState = 'preparing';
    private list: readonly PendingWork[] = [];
    private rev = 0;
    private evaluated = 0;
    /** Quadros seguidos de cada binding sem fonte (`flow/pipeline/name`). */
    private readonly waiting = new Map<string, number>();
    private readonly warned = new Set<string>();

    constructor(private readonly events: EventBus) {}

    /** `ready` ou `preparing`. */
    get state(): ReadinessState {
        return this.current;
    }

    /** O que falta (vazio quando pronto). */
    get pending(): readonly PendingWork[] {
        return this.list;
    }

    /** Sobe a cada transição. */
    get revision(): number {
        return this.rev;
    }

    /** Quantas vezes foi avaliada (um por quadro gravado). */
    get evaluations(): number {
        return this.evaluated;
    }

    /** Avalia com o que os Flows ainda esperam neste quadro e emite as transições. */
    update(pending: readonly PendingWork[]): void {
        this.evaluated++;
        this.list = pending;
        this.trackWaiting(pending);
        const next: ReadinessState = pending.length === 0 ? 'ready' : 'preparing';
        if (next === this.current && this.evaluated > 1) return;
        this.current = next;
        this.rev++;
        if (next === 'ready') this.events.emit('engineReady', { revision: this.rev });
        else this.events.emit('enginePreparing', { revision: this.rev, pending });
    }

    private trackWaiting(pending: readonly PendingWork[]): void {
        const seen = new Set<string>();
        for (const p of pending) {
            if (p.reason !== 'waiting' || p.name === undefined) continue;
            const key = `${p.flow}/${p.pipeline}/${p.name}`;
            seen.add(key);
            const frames = (this.waiting.get(key) ?? 0) + 1;
            this.waiting.set(key, frames);
            if (frames >= CONSUMER_MISSING_FRAMES && !this.warned.has(key)) {
                this.warned.add(key);
                this.events.emit('consumerMissing', {
                    flow: p.flow,
                    pipeline: p.pipeline,
                    name: p.name,
                });
            }
        }
        for (const key of [...this.waiting.keys()]) if (!seen.has(key)) this.waiting.delete(key);
    }
}
