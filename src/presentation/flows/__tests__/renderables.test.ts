import { afterEach, describe, expect, it, vi } from 'vitest';
import { Geometry } from '../../../elements/geometry/Geometry';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { EntityId } from '../../../scene/world/EntityId';
import { registerStages, renderScene } from './helpers/renderHarness';

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

/** Cena real com o estágio registrado por factory: eventos do World chegam aos slots. */
async function stage(kind: 'forward' | 'shadow', insertFirst?: Geometry) {
    const s = await renderScene();
    const label = kind === 'forward' ? 'ForwardFlow' : 'ShadowFlow';
    const add = (geometry: Geometry): EntityId =>
        s.scene.world.insert(
            geometry.add(new StandardMaterial({ albedo: [1, 1, 1, 1] })).add(new Transform()),
        );
    s.scene.world.insert(
        kind === 'forward' ? new Camera() : new DirectionalLight({ castShadow: true }),
    );
    if (insertFirst !== undefined) add(insertFirst);
    registerStages(s.scene, kind === 'forward' ? { forward: 'canvas' } : { shadow: true });
    const drawCount = (): number => {
        s.step();
        return s.draws(label).length;
    };
    return { ...s, add, drawCount };
}

const originalName = Object.getOwnPropertyDescriptor(BoxGeometry, 'name')!;

afterEach(() => {
    Object.defineProperty(BoxGeometry, 'name', originalName);
    vi.restoreAllMocks();
});

describe.each(['forward', 'shadow'] as const)('%s — renderizáveis por eventos', (kind) => {
    it('entidade inserida depois do registro do estágio passa a ser desenhada', async () => {
        const s = await stage(kind);
        s.add(new BoxGeometry());
        expect(s.drawCount()).toBe(1);
    });

    it('entidade inserida antes do estágio existir também é desenhada', async () => {
        const s = await stage(kind, new BoxGeometry());
        expect(s.drawCount()).toBe(1);
    });

    it('geometria de classe nova (subclasse de Geometry fora de qualquer lista) é desenhada', async () => {
        const s = await stage(kind);
        s.add(new Wedge());
        expect(s.drawCount()).toBe(1);
    });

    it('nome de classe alterado (minificação) não muda o reconhecimento', async () => {
        Object.defineProperty(BoxGeometry, 'name', { value: 'x' });
        const s = await stage(kind);
        s.add(new BoxGeometry());
        expect(s.drawCount()).toBe(1);
    });

    it('remoção tira a entidade do conjunto', async () => {
        const s = await stage(kind);
        const box = new BoxGeometry();
        s.add(box);
        s.add(new BoxGeometry());
        expect(s.drawCount()).toBe(2);
        s.scene.world.remove(box);
        expect(s.drawCount()).toBe(1);
    });

    it('nenhuma consulta ao World por quadro', async () => {
        const s = await stage(kind);
        s.add(new BoxGeometry());
        s.drawCount();
        const queries = [
            vi.spyOn(s.scene.world, 'queryBySchemaName'),
            vi.spyOn(s.scene.world, 'resourcesOf'),
            vi.spyOn(s.scene.world, 'findResource'),
        ];
        expect(s.drawCount()).toBe(1);
        for (const q of queries) expect(q).not.toHaveBeenCalled();
    });
});
