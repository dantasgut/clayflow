export class GamepadDevice {
    poll(): readonly Gamepad[] {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
        return Array.from(navigator.getGamepads()).filter((g): g is Gamepad => g !== null);
    }
}
