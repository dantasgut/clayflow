import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForwardFlow } from '../ForwardFlow';
import { ShadowFlow } from '../ShadowFlow';
import { Geometry } from '../../../elements/geometry/Geometry';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { FlowRegistry } from '../../../scene/flows/FlowRegistry';
import { ExecutionSystem } from '../../../scene/systems/ExecutionSystem';
import { World } from '../../../scene/world/World';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { EntityId } from '../../../scene/world/EntityId';
import { renderHarness } from './helpers/renderHarness';

/** Geometria de uma classe que nenhum estágio conhece pelo nome. */
class Wedge extends Geometry {
    constructor() {
        super();
        this.data = { vertices: new Float32Array(3 * 8), indices: new Uint16Array([0, 1, 2]) };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'vertices', role: 'vertex', schema: BoxGeometry.vertexStruct, count: 3 },
            { id: 'indices', role: 'index', count: 3 },
        ];
    }
    get vertexCount(): number {
        return 3;
    }
    get indexCount(): number {
        return 3;
    }
}

/** Cena com estágios registrados num ExecutionSystem real: eventos do World chegam aos hooks. */
function stage(kind: 'forward' | 'shadow') {
    const h = renderHarness();
    const events = new DefaultEventBus();
    const world = new World(events);
    const flows = new FlowRegistry();
    new ExecutionSystem(h.core, events, flows);
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const flow =
        kind === 'forward'
            ? new ForwardFlow(h.core, world, h.pools, canvas)
            : new ShadowFlow(h.core, world, h.pools);
    flows.register(flow);
    world.insert(kind === 'forward' ? new Camera() : new DirectionalLight({ castShadow: true }));
    const add = (geometry: Geometry): EntityId => {
        const id = world.insert(
            geometry.add(new StandardMaterial({ albedo: [1, 1, 1, 1] })).add(new Transform()),
        );
        h.slots.set(id, h.slots.size);
        return id;
    };
    const drawCount = (): number => {
        flow.dispatch(h.frame);
        return h.takeDraws().length;
    };
    return { ...h, world, flow, add, drawCount };
}

const originalName = Object.getOwnPropertyDescriptor(BoxGeometry, 'name')!;

afterEach(() => {
    Object.defineProperty(BoxGeometry, 'name', originalName);
    vi.restoreAllMocks();
});

describe.each(['forward', 'shadow'] as const)('%s — renderizáveis por eventos', (kind) => {
    it('entidade inserida depois do registro do estágio passa a ser desenhada', () => {
        const s = stage(kind);
        s.add(new BoxGeometry());
        expect(s.drawCount()).toBe(1);
    });

    it('entidade inserida antes do estágio existir também é desenhada', () => {
        const h = renderHarness();
        const world = new World(new DefaultEventBus());
        world.insert(
            kind === 'forward' ? new Camera() : new DirectionalLight({ castShadow: true }),
        );
        const id = world.insert(
            new BoxGeometry()
                .add(new StandardMaterial({ albedo: [1, 1, 1, 1] }))
                .add(new Transform()),
        );
        h.slots.set(id, 0);
        const flow =
            kind === 'forward'
                ? new ForwardFlow(h.core, world, h.pools, document.createElement('canvas'))
                : new ShadowFlow(h.core, world, h.pools);
        flow.dispatch(h.frame);
        expect(h.takeDraws()).toHaveLength(1);
    });

    it('geometria de classe nova (subclasse de Geometry fora de qualquer lista) é desenhada', () => {
        const s = stage(kind);
        s.add(new Wedge());
        expect(s.drawCount()).toBe(1);
    });

    it('nome de classe alterado (minificação) não muda o reconhecimento', () => {
        Object.defineProperty(BoxGeometry, 'name', { value: 'x' });
        const s = stage(kind);
        s.add(new BoxGeometry());
        expect(s.drawCount()).toBe(1);
    });

    it('remoção tira a entidade do conjunto', () => {
        const s = stage(kind);
        const box = new BoxGeometry();
        s.add(box);
        s.add(new BoxGeometry());
        expect(s.drawCount()).toBe(2);
        s.world.remove(box);
        expect(s.drawCount()).toBe(1);
    });

    it('nenhuma consulta ao World por quadro', () => {
        const s = stage(kind);
        s.add(new BoxGeometry());
        s.drawCount();
        const queries = [
            vi.spyOn(s.world, 'queryBySchemaName'),
            vi.spyOn(s.world, 'resourcesOf'),
            vi.spyOn(s.world, 'findResource'),
        ];
        expect(s.drawCount()).toBe(1);
        for (const q of queries) expect(q).not.toHaveBeenCalled();
    });
});
