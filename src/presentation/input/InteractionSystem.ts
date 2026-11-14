import type { EventBus, Unsubscribe } from '../../scene/events/EventBus';
import type { World } from '../../scene/world/World';
import type { EntityId } from '../../scene/world/EntityId';
import { Transform } from '../../elements/scene/Transform';
import type { Input } from './Input';
import type { InputDevice } from './InputDevice';
import { InputDrivenController } from './InputDrivenController';

/** Controller na cena e o `Transform` da mesma entidade, que ele muta. */
interface Driven {
    readonly controller: InputDrivenController;
    readonly transform: Transform;
}

/**
 * InteractionSystem (spec 007) — liga os dispositivos de entrada do ambiente (spec 038: os do DOM no navegador, os da
 * janela no Deno) ao `Input` da cena e, a cada
 * `frameTick`, chama `tick(input, dt, transform)` de cada controller do World (componente da entidade da câmera) com o
 * `Transform` da mesma entidade; depois zera os deltas do quadro. Os controllers são mantidos por eventos do World
 * (`entitiesInserted`/`entitiesRemoved`) — o quadro não percorre a cena. Um controller sem `Transform` na entidade é
 * erro (nomeia a entidade); o que sai da cena é descartado (ouvintes de DOM).
 *
 * Criado pela `Application` (um por cena).
 */
export class InteractionSystem {
    /** Os dispositivos de entrada do ambiente (o ponto de entrada os dá). */
    readonly devices: readonly InputDevice[];
    private readonly driven = new Map<EntityId, Driven[]>();
    private subscriptions: Unsubscribe[] = [];

    constructor(
        devices: readonly InputDevice[],
        private readonly events: EventBus,
        private readonly world: World,
        /** `Input` da cena (inserido no World pela `Application`). */
        readonly input: Input,
    ) {
        this.devices = devices;
        for (const record of world.allRecords()) this.track(record.id);
        this.subscribe();
    }

    private subscribe(): void {
        if (this.subscriptions.length > 0) return;
        this.subscriptions = [
            this.events.on('frameTick', (e) => {
                this.tick(e.dt);
            }),
            this.events.on('entitiesInserted', (e) => {
                for (const id of e.entityIds) this.track(id);
            }),
            this.events.on('entitiesRemoved', (e) => {
                for (const id of e.entityIds) this.untrack(id);
            }),
            this.events.on('entitiesRecomposed', (e) => {
                for (const id of e.entityIds) {
                    this.untrack(id);
                    this.track(id);
                }
            }),
        ];
    }

    /** Liga os dispositivos (e reativa a atualização por quadro depois de um `detach`). */
    attach(): void {
        this.subscribe();
        for (const d of this.devices) d.attach();
    }

    /** Desliga os dispositivos e as inscrições no barramento. Chamar antes de descartar o InteractionSystem. */
    detach(): void {
        for (const off of this.subscriptions) off();
        this.subscriptions = [];
        for (const d of this.devices) d.detach();
    }

    /** Descarte: `detach` e descarte dos controllers da cena (ouvintes de DOM deles). */
    dispose(): void {
        this.detach();
        for (const list of this.driven.values()) for (const d of list) d.controller.dispose();
        this.driven.clear();
    }

    /** Controllers da entidade e o `Transform` que eles mutam. */
    private track(id: EntityId): void {
        const resources = this.world.resourcesOf(id);
        const controllers = resources.filter(
            (r): r is InputDrivenController => r instanceof InputDrivenController,
        );
        if (controllers.length === 0) return;
        const transform = resources.find((r): r is Transform => r instanceof Transform);
        if (transform === undefined) {
            throw new Error(
                `InteractionSystem: o controller da entidade ${id} não tem Transform — o controller muta o Transform `
                    + 'da entidade (ex.: a câmera).',
            );
        }
        this.driven.set(
            id,
            controllers.map((controller) => ({ controller, transform })),
        );
    }

    private untrack(id: EntityId): void {
        const list = this.driven.get(id);
        if (list === undefined) return;
        this.driven.delete(id);
        for (const d of list) d.controller.dispose();
    }

    private tick(dt: number): void {
        for (const list of this.driven.values()) {
            for (const d of list) d.controller.tick(this.input, dt, d.transform);
        }
        this.input.consumeFrameDeltas();
    }
}
