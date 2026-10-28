import type { Input } from '../../../presentation/input/Input';
import type { InputDevice } from '../../../presentation/input/InputDevice';

/**
 * Gamepads do navegador (spec 038): ligado, registra no `Input` a leitura da Gamepad API (`navigator.getGamepads`, por
 * consulta — a API não emite eventos de eixo nem de botão); desligado, a tira. `poll()` devolve os conectados.
 */
export class GamepadDevice implements InputDevice {
    constructor(private readonly input?: Input) {}

    attach(): void {
        this.input?.setGamepadSource((pad) => {
            if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function')
                return null;
            return navigator.getGamepads()[pad] ?? null;
        });
    }

    detach(): void {
        this.input?.setGamepadSource(undefined);
    }

    /** Snapshot dos gamepads atualmente conectados (filtra slots vazios). */
    poll(): readonly Gamepad[] {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
        return Array.from(navigator.getGamepads()).filter((g): g is Gamepad => g !== null);
    }
}
