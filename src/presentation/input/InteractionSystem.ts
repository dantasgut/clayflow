import type { EventBus, Unsubscribe } from '../../scene/events/EventBus';
import type { World } from '../../scene/world/World';
import type { EntityId } from '../../scene/world/EntityId';
import { Transform } from '../../elements/scene/Transform';
import type { Input } from './Input';
import { KeyboardDevice } from './KeyboardDevice';
import { PointerDevice } from './PointerDevice';
import { TouchDevice } from './TouchDevice';
import { GamepadDevice } from './GamepadDevice';
import { InputDrivenController } from './InputDrivenController';

/**
 * Configuração do InteractionSystem. `window` permite injeção em tests
 * (jsdom) ou para múltiplos canvases compartilharem o mesmo Window.
 */
export interface InteractionSystemOptions {
    /** Canvas onde pointer/touch events são capturados. */
    readonly canvas: HTMLCanvasElement;
    /** Window onde keyboard events são capturados. Null = fallback para canvas. */
    readonly window: Window | null;
}

/** Controller na cena e o `Transform` da mesma entidade, que ele muta. */
interface Driven {
    readonly controller: InputDrivenController;
    readonly transform: Transform;
}

/**
 * InteractionSystem (spec 007) — liga os dispositivos (teclado, ponteiro, toque, gamepad) ao `Input` da cena e, a cada
 * `frameTick`, chama `tick(input, dt, transform)` de cada controller do World (componente da entidade da câmera) com o
 * `Transform` da mesma entidade; depois zera os deltas do quadro. Os controllers são mantidos por eventos do World
 * (`entitiesInserted`/`entitiesRemoved`) — o quadro não percorre a cena. Um controller sem `Transform` na entidade é
 * erro (nomeia a entidade); o que sai da cena é descartado (ouvintes de DOM).
 *
 * Criado pela `Application` (um por cena).
 */
export class InteractionSystem {
    /** KeyboardDevice — captura keydown/keyup no `window`. */
    readonly keyboard: KeyboardDevice;
    /** PointerDevice — captura pointer events no canvas (mouse, pen). */
    readonly pointer: PointerDevice;
    /** TouchDevice — captura touch events (multi-touch + pinch). */
    readonly touch: TouchDevice;
    /** GamepadDevice — polling-based (Gamepad API não dispatch events). */
    readonly gamepad: GamepadDevice;
    private readonly driven = new Map<EntityId, Driven[]>();
    private subscriptions: Unsubscribe[] = [];

    constructor(
        private readonly options: InteractionSystemOptions,
        private readonly events: EventBus,
        private readonly world: World,
        /** `Input` da cena (inserido no World pela `Application`). */
        readonly input: Input,
    ) {
        const w = options.window ?? (typeof window !== 'undefined' ? window : null);
        this.keyboard = new KeyboardDevice(w ?? options.canvas, input, events);
        this.pointer = new PointerDevice(options.canvas, input, events);
        this.touch = new TouchDevice(options.canvas, input);
        this.gamepad = new GamepadDevice();
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
        ];
    }

    /** Registra DOM event listeners (e reativa a atualização por quadro depois de um `detach`). */
    attach(): void {
        this.subscribe();
        this.keyboard.attach();
        this.pointer.attach();
        this.touch.attach();
    }

    /** Remove os ouvintes de DOM e as inscrições no barramento. Chamar antes de descartar o InteractionSystem. */
    detach(): void {
        for (const off of this.subscriptions) off();
        this.subscriptions = [];
        this.keyboard.detach();
        this.pointer.detach();
        this.touch.detach();
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
