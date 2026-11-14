import { describe, expect, it } from 'vitest';
import { FieldType } from '../descriptors/FieldType';
import { fieldArray, StructSchema } from '../descriptors/StructSchema';
import { bindPoints } from '../shaders/bindPoints';
import { composeWgsl } from '../shaders/composeWgsl';
import {
    POOL_ARENA_SLOTS,
    poolArenaKindOf,
    poolArenaLiveReader,
    poolArenaReader,
    poolArenaWriter,
    poolArenaSlot,
    poolArenaSlotOf,
    rewriteArenaReads,
} from '../shaders/poolArena';
import { wgslModule } from '../shaders/WgslModule';
import { WgslCompositionError } from '../shaders/WgslCompositionError';

const Item = new StructSchema('ArenaItem', {
    a: FieldType.f32,
    n: FieldType.u32,
    p: FieldType.vec3f,
    q: FieldType.vec4i,
    m: FieldType.mat4x4f,
    w: fieldArray(FieldType.vec2f, 2),
});

const reads = [{ name: 'items', at: 'items_at', len: 'items_len', kind: 'cpu' as const }];

describe('arena de pools (T060i)', () => {
    it('o índice de cada região é fixo e o leitor põe o pool na arena', () => {
        const k = poolArenaSlot('pool:ArenaTestA');
        expect(poolArenaSlot('pool:ArenaTestA')).toBe(k);
        expect(poolArenaSlotOf('pool:ArenaTestUnseen')).toBeUndefined();
        poolArenaReader({ name: 'arena_test_b', pool: 'ArenaTestB', schema: Item });
        expect(poolArenaSlotOf('pool:ArenaTestB')).toBeDefined();
    });

    it('o acessor monta o elemento das palavras pelo layout do storage', () => {
        const r = poolArenaReader({ name: 'items', pool: 'ArenaItems', schema: Item });
        const k = poolArenaSlotOf('pool:ArenaItems')!;
        const words = Item.stride / 4;
        expect(r.source).toContain(
            `fn items_len() -> u32 { return pool_arena[${POOL_ARENA_SLOTS + k}u]; }`,
        );
        expect(r.source).toContain(`let b = pool_arena[${k}u] + i * ${words}u;`);
        // a: f32 em 0; n: u32 em 4; p: vec3f em 16; q: vec4i em 32; m: mat4x4f em 48; w: array<vec2f, 2> em 112.
        expect(r.source).toContain('bitcast<f32>(pool_arena[b + 0u])');
        expect(r.source).toContain('pool_arena[b + 1u]');
        expect(r.source).toContain(
            'bitcast<vec3f>(vec3u(pool_arena[b + 4u], pool_arena[b + 5u], pool_arena[b + 6u]))',
        );
        expect(r.source).toContain('bitcast<vec4i>(vec4u(pool_arena[b + 8u]');
        expect(r.source).toContain('mat4x4f(bitcast<vec4f>(vec4u(pool_arena[b + 12u]');
        expect(r.source).toContain(
            'array<vec2f, 2>(bitcast<vec2f>(vec2u(pool_arena[b + 28u], pool_arena[b + 29u])), bitcast<vec2f>(vec2u(pool_arena[b + 30u], pool_arena[b + 31u])))',
        );
    });

    it('a montagem reescreve as leituras de quem usa e liga só a arena', () => {
        const r = poolArenaReader({ name: 'items', pool: 'ArenaItems', schema: Item });
        const user = wgslModule({
            name: 'arena_user',
            requires: [r],
            source: '@compute @workgroup_size(1) fn main() { let n = arrayLength(&items); let x = items[items[0].n].a + f32(n); }',
        });
        const shader = composeWgsl(user);
        expect(shader.spec.source).toContain(
            'let n = items_len(); let x = items_at_a(items_at_n(0)) + f32(n);',
        );
        expect(shader.bindings.map((b) => b.name)).toEqual(['pool_arena']);
    });

    it('o escritor da arena da GPU: escritas do elemento e dos campos, lidas pela mesma ligação', () => {
        const w = poolArenaWriter({ name: 'gpu_items', pool: 'ArenaGpuItems', schema: Item });
        const k = poolArenaSlotOf('pool:ArenaGpuItems')!;
        expect(poolArenaKindOf('pool:ArenaGpuItems')).toBe('gpu');
        expect(w.source).toContain(`let b = pool_arena_gpu[${k}u] + i * `);
        expect(w.source).toContain('fn gpu_items_store_p(i: u32, x: vec3f) {');
        expect(w.source).toContain('pool_arena_gpu[b + 4u] = bitcast<u32>(x.x);');
        expect(w.source).toContain('pool_arena_gpu[b + 1u] = x;');
        const user = wgslModule({
            name: 'arena_gpu_user',
            requires: [w],
            source: '@compute @workgroup_size(1) fn main() { gpu_items[1].p = gpu_items[0].p * 2.0; gpu_items[2] = gpu_items[1]; }',
        });
        const shader = composeWgsl(user);
        expect(shader.spec.source).toContain(
            'gpu_items_store_p(1, gpu_items_at_p(0) * 2.0); gpu_items_store(2, gpu_items_at(1));',
        );
        expect(shader.bindings.map((b) => b.name)).toEqual(['pool_arena_gpu']);
    });

    it('lido e escrito no mesmo kernel: a montagem promove a ligação a leitura e escrita (uma só)', () => {
        const r = poolArenaReader({
            name: 'gpu_others',
            pool: 'ArenaGpuOthers',
            schema: Item,
            arena: 'gpu',
        });
        const w = poolArenaWriter({ name: 'gpu_items', pool: 'ArenaGpuItems', schema: Item });
        const user = wgslModule({
            name: 'arena_gpu_both',
            requires: [r, w],
            source: '@compute @workgroup_size(1) fn main() { gpu_items[0].a = gpu_others[0].a; }',
        });
        const shader = composeWgsl(user);
        expect(shader.bindings).toHaveLength(1);
        expect(shader.spec.source).toContain('var<storage, read_write> pool_arena_gpu');
    });

    it('trocar um ponto (bindPoints) mantém os leitores da arena: leitura e escrita da GPU no mesmo kernel', () => {
        const r = poolArenaReader({
            name: 'gpu_others',
            pool: 'ArenaGpuOthers',
            schema: Item,
            arena: 'gpu',
        });
        const w = poolArenaWriter({ name: 'gpu_items', pool: 'ArenaGpuItems', schema: Item });
        const ready = wgslModule({
            name: 'arena_point_ready',
            source: 'fn arena_pt() -> f32 { return 0.0; }',
        });
        const impl = wgslModule({
            name: 'arena_point_impl',
            source: 'fn arena_pt() -> f32 { return 1.0; }',
        });
        const kernel = wgslModule({
            name: 'arena_point_kernel',
            requires: [ready, w, r],
            source: '@compute @workgroup_size(1) fn main() { gpu_items[0].a = gpu_others[0].a + arena_pt(); }',
        });
        const src = composeWgsl(bindPoints(kernel, new Map([[{ name: 'arena_pt', ready }, impl]])))
            .spec.source;
        expect(src).toContain('gpu_items_store_a(0, gpu_others_at_a(0) + arena_pt());');
    });

    it('os vivos: uma palavra do bitset por índice', () => {
        const r = poolArenaLiveReader({ name: 'items_live', pool: 'ArenaItems' });
        const k = poolArenaSlotOf('live:ArenaItems')!;
        expect(r.source).toContain(
            `fn items_live_at(w: u32) -> u32 { return pool_arena[pool_arena[${k}u] + w]; }`,
        );
    });

    it('membros e comentários ficam; outro uso do nome é erro', () => {
        expect(rewriteArenaReads('let a = s.items[0]; // items[1]', reads, 'm')).toBe(
            'let a = s.items[0]; // items[1]',
        );
        expect(rewriteArenaReads('let a = my_items[0];', reads, 'm')).toBe('let a = my_items[0];');
        expect(() => rewriteArenaReads('f(&items);', reads, 'm')).toThrow(WgslCompositionError);
        // Escrita num leitor e atribuição composta.
        expect(() => rewriteArenaReads('items[0] = x;', reads, 'm')).toThrow(/só se lê/);
        expect(() =>
            rewriteArenaReads('items[0].a += 1.0;', [{ ...reads[0]!, fields: ['a'] }], 'm'),
        ).toThrow(/composta/);
        // Um comentário que termina em ponto não faz do nome seguinte um membro.
        expect(rewriteArenaReads('// fim.\nlet a = items[0];', reads, 'm')).toBe(
            '// fim.\nlet a = items_at(0);',
        );
        // Comparação não é escrita.
        expect(rewriteArenaReads('let c = items[0].n == 1u;', reads, 'm')).toBe(
            'let c = items_at(0).n == 1u;',
        );
    });
});
