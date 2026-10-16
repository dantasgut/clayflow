/**
 * Spec 009 (US1): função `transform` do usuário — entidades agrupadas por função (um despacho por função), o TRS
 * continua para as demais, a função só vale depois de compilada, a rejeitada mantém a anterior, o tempo simulado vai
 * para o grupo, e o filho com função compõe sobre o pai (bit no elo).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import type { EntityId } from '../../../scene/world/EntityId';
import { WgslCompositionError } from '../../../scene/shaders/WgslCompositionError';
import { Parent } from '../../scene/Parent';
import { Transform } from '../../scene/Transform';
import { TransformFunction } from '../TransformFunction';
import {
    discOf,
    registerStages,
    renderScene,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

const ORBIT = `
fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f {
    let a = time * data.speed + f32(slot);
    var m = transform_local(t).world;
    m[3] = vec4f(data.radius * cos(a), t.position.y, data.radius * sin(a), 1.0);
    return m;
}`;

const orbit = (radius = 2): TransformFunction =>
    new TransformFunction({
        code: ORBIT,
        params: { radius: 'f32', speed: 'f32' },
        values: { radius, speed: 1 },
    });

async function scene() {
    const s = await renderScene();
    registerStages(s.scene, {});
    const insert = (fn?: TransformFunction, parent?: EntityId) => {
        const box = new BoxGeometry().add(new Transform());
        if (fn !== undefined) box.add(fn);
        if (parent !== undefined) box.add(new Parent(parent));
        return s.scene.world.insert(box);
    };
    const fnDispatches = () => s.computes().filter((l) => l === 'TransformFlow.function').length;
    /** Avança um quadro (prepara o que mudou), espera as conferências e compilações assíncronas e avança outro. */
    const settle = async () => {
        s.step();
        for (let i = 0; i < 20; i++) await Promise.resolve();
        s.step();
    };
    const lastWrite = (prefix: string) => {
        const call = vi
            .mocked(s.core.write)
            .mock.calls.filter(([spec]) => discOf(spec).startsWith(prefix))
            .at(-1);
        if (call === undefined) return undefined;
        const data = call[1];
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    };
    return { ...s, insert, fnDispatches, settle, lastWrite };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('TransformFunction (spec 009)', () => {
    it('valida a assinatura na criação, com o ponto e as assinaturas no erro', () => {
        expect(
            () =>
                new TransformFunction({
                    code: 'fn transform_fn(slot: u32, t: Transform, time: f32) -> mat4x4f { return mat4x4f(); }',
                }),
        ).toThrow(WgslCompositionError);
        try {
            new TransformFunction({ code: 'fn transform_fn(slot: u32) -> f32 { return 1.0; }' });
        } catch (e) {
            expect((e as Error).message).toContain("ponto 'transform'");
            expect((e as Error).message).toContain('mat4x4f');
        }
    });

    it('só vale depois de compilada; então um despacho por função a cada quadro (depende do tempo)', async () => {
        const s = await scene();
        s.insert();
        // Uma instância por entidade (reuso de instância é proibido); o mesmo código compartilha o pipeline.
        s.insert(orbit(1));
        s.insert(orbit(2));
        s.step();
        expect(s.fnDispatches()).toBe(0);
        await s.settle();
        expect(s.fnDispatches()).toBe(1);
        // Cena parada: o TRS sozinho não recompõe, mas a função roda todo quadro.
        s.step();
        expect(s.fnDispatches()).toBe(1);
        expect(s.computes()).toContain('TransformFlow');
    });

    it('funções com o mesmo código compartilham o pipeline; códigos diferentes, um despacho cada', async () => {
        const s = await scene();
        s.insert(orbit(1));
        s.insert(orbit(3));
        s.insert(
            new TransformFunction({
                code: 'fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f { return transform_local(t).world; }',
            }),
        );
        await s.settle();
        s.step();
        expect(s.fnDispatches()).toBe(2);
    });

    it('grupo: pares TransformFnPair (slot do Transform, slot do registro no pool da forma) e tempo do grupo', async () => {
        const s = await scene();
        const fa = orbit(1);
        const a = s.insert(fa);
        const b = s.insert(orbit(2));
        await s.settle();
        const pairs = s.lastWrite('transform_fn_pairs:');
        expect(pairs).toBeDefined();
        const u = new Uint32Array(pairs!.buffer, pairs!.byteOffset, pairs!.byteLength / 4);
        const slotOf = (id: EntityId) => s.scene.resourceSystem.poolSlotOf('Transform', id)!;
        // As duas funções têm a mesma forma: o mesmo pool (`transform:<hash>`), um registro cada.
        expect(fa.record.name).toMatch(/^transform:[0-9a-f]{8}$/);
        const recordOf = (id: EntityId) => s.scene.resourceSystem.poolSlotOf(fa.record.name, id)!;
        expect([...u]).toEqual([slotOf(a), recordOf(a), slotOf(b), recordOf(b)]);
        expect(recordOf(a)).not.toBe(recordOf(b));
        const groups = s.lastWrite('transform_fn_groups');
        expect(groups).toBeDefined();
        const g = new DataView(groups!.buffer, groups!.byteOffset, groups!.byteLength);
        expect(g.getUint32(0, true)).toBe(0);
        expect(g.getUint32(4, true)).toBe(2);
        expect(g.getFloat32(8, true)).toBeGreaterThan(0);
    });

    it('setCode: o código novo vale ao compilar; rejeitado, a função anterior continua e a cena anuncia', async () => {
        const s = await scene();
        const fn = orbit();
        s.insert(fn);
        await s.settle();
        const rejected: string[] = [];
        s.scene.events.on('extensionRejected', (e) => rejected.push(`${e.point}:${e.line}`));
        vi.mocked(s.core.shaderMessages).mockResolvedValueOnce([
            { type: 'error', message: 'erro', line: 1, column: 1 },
        ]);
        fn.setCode(ORBIT.replace('cos(a)', 'cos(a + 1.0)'));
        s.step();
        await s.settle();
        expect(rejected).toEqual(['transform:0']);
        s.step();
        expect(s.fnDispatches()).toBe(1);
        fn.setCode(ORBIT.replace('sin(a)', 'sin(a + 2.0)'));
        s.step();
        await s.settle();
        expect(rejected).toHaveLength(1);
        s.step();
        expect(s.fnDispatches()).toBe(1);
    });

    it('Parent: filho com função compõe sobre o pai a partir da local da função (bit 31 no elo)', async () => {
        const s = await scene();
        const root = s.insert();
        const child = s.insert(orbit(), root);
        await s.settle();
        s.step();
        const links = s.lastWrite('transform_links:');
        const u = new Uint32Array(links!.buffer, links!.byteOffset, links!.byteLength / 4);
        const slotOf = (id: EntityId) => s.scene.resourceSystem.poolSlotOf('Transform', id)!;
        expect([...u]).toEqual([(slotOf(child) | 0x80000000) >>> 0, slotOf(root)]);
    });
});
