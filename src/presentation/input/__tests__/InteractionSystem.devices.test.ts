import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { World } from '../../../scene/world/World';
import { Input } from '../Input';
import type { InputDevice } from '../InputDevice';
import { InteractionSystem } from '../InteractionSystem';

describe('InteractionSystem — dispositivos do ambiente (spec 038)', () => {
    it('liga e desliga os dispositivos que recebe; sem dispositivos, só os controllers', () => {
        const events = new DefaultEventBus();
        const world = new World(events);
        const input = new Input();
        world.insert(input);
        const device: InputDevice = { attach: vi.fn(), detach: vi.fn() };
        const system = new InteractionSystem([device], events, world, input);
        expect(system.devices).toEqual([device]);
        system.attach();
        expect(device.attach).toHaveBeenCalledOnce();
        system.detach();
        expect(device.detach).toHaveBeenCalledOnce();
        const empty = new InteractionSystem([], events, world, input);
        empty.attach();
        expect(events.listenerCount('frameTick')).toBe(1);
        empty.dispose();
    });
});
