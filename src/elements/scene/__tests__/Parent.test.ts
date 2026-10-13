/**
 * Spec 007 (US5): `Parent` opcional — níveis mantidos por evento, um passe por nível; ciclo, pai sem `Transform` e
 * `Parent` em `Transform` de posse da GPU são erro; pai removido torna o filho raiz com aviso; sem `Parent`, um
 * despacho só.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { RigidBody } from '../../physics/bodies/RigidBody';
import { lcpScene } from '../../physics/__tests__/helpers/lcpScene';
import { TransformFlow } from '../flows/TransformFlow';
import { asEntityId, type EntityId } from '../../../scene/world/EntityId';
import { Parent } from '../Parent';
import { Transform } from '../Transform';
import {
    discOf,
    registerStages,
    renderScene,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

async function scene() {
    const s = await renderScene();
    registerStages(s.scene, {});
    const insert = (parent?: EntityId) => {
        const box = new BoxGeometry().add(new Transform());
        if (parent !== undefined) box.add(new Parent(parent));
        const id = s.scene.world.insert(box);
        return { box, id };
    };
    const slot = (id: EntityId) => s.scene.resourceSystem.poolSlotOf('Transform', id)!;
    /** Elos (filho, pai) da última escrita da lista. */
    const links = () => {
        const call = vi
            .mocked(s.core.write)
            .mock.calls.filter(([spec]) => discOf(spec).startsWith('transform_links:'))
            .at(-1);
        if (call === undefined) return undefined;
        const data = call[1] as Uint32Array;
        return [...new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4)];
    };
    const levels = () => s.computes().filter((l) => l === 'TransformFlow.level').length;
    return { ...s, insert, slot, links, levels };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Parent (spec 007)', () => {
    it('sem Parent: um despacho só, nenhuma lista de elos', async () => {
        const s = await scene();
        s.insert();
        s.insert();
        s.step();
        expect(s.computes().filter((l) => l.startsWith('TransformFlow'))).toEqual([
            'TransformFlow',
        ]);
        expect(s.links()).toBeUndefined();
    });

    it('cadeia pai → filho → neto: elos por nível e um passe por nível depois da composição', async () => {
        const s = await scene();
        const root = s.insert();
        const child = s.insert(root.id);
        const grandchild = s.insert(child.id);
        s.step();
        expect(s.links()).toEqual([
            s.slot(child.id),
            s.slot(root.id),
            s.slot(grandchild.id),
            s.slot(child.id),
        ]);
        expect(s.computes().filter((l) => l.startsWith('TransformFlow'))).toEqual([
            'TransformFlow',
            'TransformFlow.level',
            'TransformFlow.level',
        ]);
    });

    it('a hierarquia é refeita só por evento: quadros seguintes não reescrevem os elos', async () => {
        const s = await scene();
        const root = s.insert();
        s.insert(root.id);
        s.step();
        const writes = () =>
            vi
                .mocked(s.core.write)
                .mock.calls.filter(([spec]) => discOf(spec).startsWith('transform_links:')).length;
        const before = writes();
        root.box.attached.find((r): r is Transform => r instanceof Transform)!.data.position = [
            1, 0, 0, 1,
        ];
        s.step();
        s.step();
        expect(writes()).toBe(before);
        expect(s.levels()).toBe(0); // cena parada depois da mudança: nada é composto
    });

    it('ciclo é erro que nomeia as entidades', async () => {
        const s = await scene();
        const first = s.insert();
        // Ids sequenciais: a próxima entidade é first + 1, a seguinte first + 2.
        const a = asEntityId(first.id + 1);
        const b = asEntityId(first.id + 2);
        s.insert(b);
        s.insert(a);
        expect(() => s.step()).toThrow(
            new RegExp(
                `ciclo de Parent entre as entidades .*${a}.*${b}|ciclo de Parent entre as entidades .*${b}.*${a}`,
            ),
        );
    });

    it('pai sem Transform é erro', async () => {
        const s = await scene();
        const plain = s.scene.world.insert(new BoxGeometry());
        const child = s.insert(plain);
        expect(() => s.step()).toThrow(
            new RegExp(
                `Parent da entidade ${child.id} aponta para a entidade ${plain}, que não tem Transform`,
            ),
        );
    });

    it('Parent em Transform de posse da GPU (corpo rígido dinâmico) é erro', async () => {
        const s = await lcpScene();
        s.scene.flows.register((ctx) => new TransformFlow(ctx), {
            type: 'transform',
            phase: 'transform',
        });
        const root = s.scene.world.insert(new BoxGeometry().add(new Transform()));
        const body = new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1, position: [0, 4, 0] });
        const id = s.scene.world.insert(body.add(new Parent(root)));
        expect(() => {
            s.step();
            s.step();
        }).toThrow(new RegExp(`entidade ${id} tem Parent mas o Transform dela é escrito pela GPU`));
    });

    it('pai removido: o filho vira raiz, com aviso que nomeia as entidades', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const s = await scene();
        const root = s.insert();
        const child = s.insert(root.id);
        s.step();
        expect(s.levels()).toBe(1);
        s.scene.world.remove(root.box);
        s.step();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(
                `o pai (entidade ${root.id}) da entidade ${child.id} saiu da cena`,
            ),
        );
        expect(s.levels()).toBe(0);
        s.step();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
