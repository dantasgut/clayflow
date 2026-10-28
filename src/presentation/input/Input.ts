import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import './InputEvents';

/**
 * Estado agregado de entrada — teclado, ponteiro, roda e pinça — escrito pelos dispositivos
 * (`KeyboardDevice`, `PointerDevice`, `TouchDevice`) e lido pelos controllers. Deltas (`pointerDeltaX/Y`, `wheel`,
 * `pinchDelta`) acumulam entre quadros e são zerados por `consumeFrameDeltas()` no fim de cada tick.
 */
export interface InputState {
    /** Conjunto de codes (KeyboardEvent.code) atualmente pressionadas. */
    keys: Set<string>;
    /** Posição X do pointer em coords de canvas (último move). */
    pointerX: number;
    /** Posição Y do pointer em coords de canvas. */
    pointerY: number;
    /** Delta X acumulado desde o último consumeFrameDeltas. */
    pointerDeltaX: number;
    /** Delta Y acumulado. */
    pointerDeltaY: number;
    /** Bitmask de botões pressionados (1=left, 2=middle, 4=right — bit `1 << PointerEvent.button`). */
    pointerButtons: number;
    /** Wheel delta acumulado (positivo = rolar para baixo). */
    wheel: number;
    /** Variação de pinch (distance delta entre 2 dedos) consumida por frame. */
    pinchDelta: number;
}

/** Botão do ponteiro pela posição (`PointerEvent.button`). */
const BUTTONS = { left: 0, middle: 1, right: 2 } as const;

/**
 * Input — Resource singleton da cena (spec 007; uma instância por cena, inserida pela `Application`) que normaliza os
 * eventos do DOM e os expõe por duas APIs:
 *
 * - **consulta** — estado a qualquer momento: `isKeyDown('KeyW')`, `isButtonDown('left')`, `pointerPosition()`,
 *   `pointerDelta()`, `wheelDelta()`, `gamepadAxis(pad, eixo)`, `gamepadButton(pad, botão)`;
 * - **push** — eventos no barramento da cena: `keyDown`/`keyUp`, `pointerDown`/`pointerUp`/`pointerMove`, `wheel`.
 *
 * Não vai para a GPU (sem descritores); estágios o recebem por `slot.singleton(Input.schema)`. Os controllers de
 * câmera, componentes da entidade da câmera, o leem a cada quadro e mutam o `Transform`.
 */
export class Input extends Entity<Record<string, never>> implements Resource {
    private gamepads: GamepadSource = noGamepads;
    /** Marcador do Resource (não vai para a GPU). */
    static readonly schema = new StructSchema('Input', {});

    state: ResourceState = ResourceState.Uninitialized;

    /** Estado atual compartilhado — dispositivos escrevem, controllers leem (`state` é o do ciclo de vida). */
    readonly current: InputState = {
        keys: new Set(),
        pointerX: 0,
        pointerY: 0,
        pointerDeltaX: 0,
        pointerDeltaY: 0,
        pointerButtons: 0,
        wheel: 0,
        pinchDelta: 0,
    };

    /** Tecla pressionada agora (`KeyboardEvent.code`). */
    isKeyDown(code: string): boolean {
        return this.current.keys.has(code);
    }

    /** Botão do ponteiro pressionado agora. */
    isButtonDown(button: keyof typeof BUTTONS): boolean {
        return (this.current.pointerButtons & (1 << BUTTONS[button])) !== 0;
    }

    /** Última posição do ponteiro em coordenadas do canvas. */
    pointerPosition(): {
        /** Horizontal, em pixels do canvas. */
        readonly x: number;
        /** Vertical, em pixels do canvas (para baixo). */
        readonly y: number;
    } {
        return { x: this.current.pointerX, y: this.current.pointerY };
    }

    /** Deslocamento do ponteiro desde o último quadro. */
    pointerDelta(): {
        /** Deslocamento horizontal acumulado no quadro, em pixels. */
        readonly dx: number;
        /** Deslocamento vertical acumulado no quadro, em pixels. */
        readonly dy: number;
    } {
        return { dx: this.current.pointerDeltaX, dy: this.current.pointerDeltaY };
    }

    /** Roda acumulada desde o último quadro. */
    wheelDelta(): number {
        return this.current.wheel;
    }

    /** Variação da pinça (dois dedos) desde o último quadro. */
    pinchDelta(): number {
        return this.current.pinchDelta;
    }

    /** Eixo de um gamepad (−1..1), ou 0 sem gamepad. */
    gamepadAxis(pad: number, axis: number): number {
        return this.gamepads(pad)?.axes[axis] ?? 0;
    }

    /** Botão de um gamepad pressionado. */
    gamepadButton(pad: number, button: number): boolean {
        return this.gamepads(pad)?.buttons[button]?.pressed ?? false;
    }

    /**
     * Quem lê os gamepads do ambiente (spec 038): o dispositivo de gamepad do ponto de entrada o registra ao ligar e
     * o tira ao desligar (`undefined`); sem ele, nenhum gamepad.
     */
    setGamepadSource(source: GamepadSource | undefined): void {
        this.gamepads = source ?? noGamepads;
    }

    /** Zera os deltas do quadro (chamado pelo `InteractionSystem` depois dos controllers). */
    consumeFrameDeltas(): void {
        this.current.pointerDeltaX = 0;
        this.current.pointerDeltaY = 0;
        this.current.wheel = 0;
        this.current.pinchDelta = 0;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

/** O estado de um gamepad que o `Input` consulta (os eixos e os botões). */
export interface GamepadState {
    readonly axes: readonly number[];
    readonly buttons: readonly { readonly pressed: boolean }[];
}

/** Lê o gamepad `pad` do ambiente (`null` sem ele). */
export type GamepadSource = (pad: number) => GamepadState | null;

const noGamepads: GamepadSource = () => null;
