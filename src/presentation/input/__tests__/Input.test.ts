/**
 * `Input` como Resource da cena (spec 007): singleton inserido pela aplicação, consulta pelo estado dos dispositivos,
 * eventos no barramento (`keyDown`, `pointerMove`, `wheel`, …) e acesso por slot de estágio.
 */
import { describe, expect, it, vi } from 'vitest';
import { Application } from '../../../platform/web/Application';
import { Input } from '../Input';
import { createScene } from '../../../scene/SceneContext';
import { fakeSceneCore } from '../../../scene/__tests__/helpers/fakeSceneCore';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { KeyboardDevice } from '../../../platform/web/input/KeyboardDevice';
import { PointerDevice } from '../../../platform/web/input/PointerDevice';

describe('Input (spec 007)', () => {
    it('a aplicação insere um Input por cena no World; aplicações da mesma cena compartilham', async () => {
        const scene = createScene({ core: fakeSceneCore().core });
        const canvas = () => document.createElement('canvas');
        const a = await Application.create({ canvas: canvas(), scene, autoResize: false });
        const b = await Application.create({ canvas: canvas(), scene, autoResize: false });
        expect(a.input).toBeInstanceOf(Input);
        expect(b.input).toBe(a.input);
        expect(scene.world.entityIdOfResource(a.input)).toBeDefined();
        expect(a.input.getDescriptors()).toEqual([]); // não vai para a GPU
        b.dispose();
        expect(scene.world.entityIdOfResource(a.input)).toBeDefined();
        a.dispose();
        expect(scene.world.entityIdOfResource(a.input)).toBeUndefined();
    });

    it('consulta: teclas, botões, ponteiro, roda e pinça; deltas zerados por quadro', () => {
        const input = new Input();
        input.current.keys.add('KeyW');
        input.current.pointerButtons = 1;
        input.current.pointerDeltaX = 4;
        input.current.wheel = -2;
        input.current.pinchDelta = 3;
        expect(input.isKeyDown('KeyW')).toBe(true);
        expect(input.isButtonDown('left')).toBe(true);
        expect(input.isButtonDown('right')).toBe(false);
        expect(input.pointerDelta()).toEqual({ dx: 4, dy: 0 });
        expect(input.wheelDelta()).toBe(-2);
        expect(input.pinchDelta()).toBe(3);
        expect(input.gamepadAxis(0, 0)).toBe(0);
        input.consumeFrameDeltas();
        expect(input.pointerDelta()).toEqual({ dx: 0, dy: 0 });
        expect(input.isKeyDown('KeyW')).toBe(true);
    });

    it('dispositivos emitem keyDown/keyUp, pointerMove e wheel no barramento', () => {
        const events = new DefaultEventBus();
        const input = new Input();
        const canvas = document.createElement('canvas');
        const keyboard = new KeyboardDevice(canvas, input, events);
        const pointer = new PointerDevice(canvas, input, events);
        keyboard.attach();
        pointer.attach();
        const seen = vi.fn();
        events.on('keyDown', (e) => seen('keyDown', e.code));
        events.on('keyUp', (e) => seen('keyUp', e.code));
        events.on('wheel', (e) => seen('wheel', e.delta));
        canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
        canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 7 }));
        expect(seen.mock.calls).toEqual([
            ['keyDown', 'KeyA'],
            ['keyUp', 'KeyA'],
            ['wheel', 7],
        ]);
        expect(input.wheelDelta()).toBe(7);
        keyboard.detach();
        pointer.detach();
    });
});
