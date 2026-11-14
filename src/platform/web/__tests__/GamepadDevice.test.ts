import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../../../presentation/input/Input';
import { GamepadDevice } from '../input/GamepadDevice';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('GamepadDevice (spec 038)', () => {
    it('ligado, o Input lê os gamepads do navegador; desligado, nenhum', () => {
        const pad = { axes: [0.5, -1], buttons: [{ pressed: false }, { pressed: true }] };
        vi.stubGlobal('navigator', { getGamepads: () => [pad] });
        const input = new Input();
        expect(input.gamepadAxis(0, 0)).toBe(0);
        const device = new GamepadDevice(input);
        device.attach();
        expect(input.gamepadAxis(0, 0)).toBe(0.5);
        expect(input.gamepadButton(0, 1)).toBe(true);
        expect(input.gamepadAxis(1, 0)).toBe(0);
        device.detach();
        expect(input.gamepadAxis(0, 0)).toBe(0);
        expect(input.gamepadButton(0, 1)).toBe(false);
    });
});
