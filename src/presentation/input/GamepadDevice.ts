/**
 * Gamepad polling — Gamepad API não emite eventos para axis/button
 * changes, então o app deve chamar `poll()` a cada frame para ler estado
 * atual de todos os gamepads conectados.
 */
export class GamepadDevice {
    /** Snapshot dos gamepads atualmente conectados (filtra slots vazios). */
    poll(): readonly Gamepad[] {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
        return Array.from(navigator.getGamepads()).filter((g): g is Gamepad => g !== null);
    }
}
