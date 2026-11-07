import { describe, expect, it } from 'vitest';
import { FieldType } from '../descriptors/FieldType';
import { fieldArray, StructSchema } from '../descriptors/StructSchema';
import { composeWgsl } from '../shaders/composeWgsl';
import {
    POOL_ARENA_SLOTS,
    poolArenaLiveReader,
    poolArenaReader,
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

const reads = [{ name: 'items', at: 'items_at', len: 'items_len' }];

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
            'let n = items_len(); let x = items_at(items_at(0).n).a + f32(n);',
        );
        expect(shader.bindings.map((b) => b.name)).toEqual(['pool_arena']);
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
    });
});
