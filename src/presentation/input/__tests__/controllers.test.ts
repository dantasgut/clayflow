/**
 * Controllers de câmera como componentes da entidade (spec 007): só mutam posição e rotação do `Transform` a partir do
 * `Input`; nenhum calcula matriz de câmera; o `InteractionSystem` os mantém por eventos do World.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { World } from '../../../scene/world/World';
import { Input } from '../Input';
import { InteractionSystem } from '../InteractionSystem';
import { FlyController } from '../controllers/FlyController';
import { FpsController } from '../../../platform/web/input/FpsController';
import { OrbitController } from '../controllers/OrbitController';

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const input = new Input();
    world.insert(input);
    const system = new InteractionSystem([], events, world, input);
    const frame = () => {
        events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: 1 });
    };
    return { events, world, input, system, frame };
}

describe('controllers de câmera (spec 007)', () => {
    it('orbit: posiciona na esfera em torno do alvo e olha para ele; só toca posição e rotação', () => {
        const s = setup();
        const transform = new Transform({ scale: [2, 2, 2, 1] });
        s.world.insert(
            new Camera()
                .add(transform)
                .add(new OrbitController({ target: [1, 0, 0], distance: 4 })),
        );
        s.frame();
        const p = transform.data.position;
        expect(Math.hypot(p[0]! - 1, p[1]!, p[2]!)).toBeCloseTo(4, 6);
        const [x, y, z, w] = transform.data.rotation;
        const forward = [
            -(2 * (x! * z! + w! * y!)),
            -(2 * (y! * z! - w! * x!)),
            -(1 - 2 * (x! * x! + y! * y!)),
        ];
        const toTarget = [1 - p[0]!, -p[1]!, -p[2]!].map((v) => v / 4);
        forward.forEach((v, i) => {
            expect(v).toBeCloseTo(toTarget[i]!, 5);
        });
        expect(transform.data.scale).toEqual([2, 2, 2, 1]);
    });

    it('arrasto gira a órbita; deltas do quadro são consumidos', () => {
        const s = setup();
        const transform = new Transform();
        s.world.insert(new Camera().add(transform).add(new OrbitController()));
        s.frame();
        const before = [...transform.data.position];
        s.input.current.pointerButtons = 1;
        s.input.current.pointerDeltaX = 100;
        s.frame();
        expect(transform.data.position).not.toEqual(before);
        expect(s.input.pointerDelta()).toEqual({ dx: 0, dy: 0 });
    });

    it('fly e fps partem da posição do Transform e andam com WASD', () => {
        for (const make of [() => new FlyController(), () => new FpsController()]) {
            const s = setup();
            const transform = new Transform({ position: [0, 1, 5, 1] });
            s.world.insert(new Camera().add(transform).add(make()));
            s.input.current.keys.add('KeyW');
            s.frame();
            const p = transform.data.position;
            expect(p[2]).toBeLessThan(5); // anda para −Z (para onde olha)
            expect(p[1]).toBeCloseTo(1, 6);
        }
    });

    it('controller removido sai do tick e é descartado; sem Transform é erro', () => {
        const s = setup();
        const controller = new OrbitController();
        const entity = new Camera().add(new Transform()).add(controller);
        s.world.insert(entity);
        s.world.remove(entity);
        s.frame();
        expect(() => s.world.insert(new Camera().add(new OrbitController()))).toThrow(
            /não tem Transform/,
        );
    });

    it('nenhum controller calcula matriz de câmera (SC-008)', () => {
        const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'controllers');
        for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
            const source = readFileSync(join(dir, file), 'utf8');
            expect(source, file).not.toMatch(
                /viewProjection|perspective|lookAtMatrix|projection\b/,
            );
        }
    });
});
