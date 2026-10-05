import { describe, expect, it, vi } from 'vitest';
import { makeReactive } from '../systems/reactiveData';

function setup(data: Record<string, unknown>) {
    const onChange = vi.fn();
    const proxy = makeReactive(data, onChange);
    return { proxy, onChange };
}

describe('makeReactive', () => {
    it('atribuição de campo notifica', () => {
        const { proxy, onChange } = setup({ position: [0, 0, 0, 1] });
        proxy.position = [5, 0, 0, 1];
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(proxy.position).toEqual([5, 0, 0, 1]);
    });

    it('escrita indexada em Array notifica', () => {
        const { proxy, onChange } = setup({ position: [0, 0, 0, 1] });
        (proxy.position as number[])[0] = 3;
        expect(onChange).toHaveBeenCalledTimes(1);
        expect((proxy.position as number[])[0]).toBe(3);
    });

    it('escrita indexada em Float32Array notifica', () => {
        const { proxy, onChange } = setup({ values: new Float32Array(4) });
        (proxy.values as Float32Array)[2] = 7;
        expect(onChange).toHaveBeenCalledTimes(1);
        expect((proxy.values as Float32Array)[2]).toBe(7);
    });

    it.each(['set', 'fill', 'copyWithin', 'sort', 'reverse'] as const)(
        'TypedArray.%s notifica após mutar o alvo',
        (method) => {
            const raw = new Float32Array([3, 1, 2, 0]);
            const { proxy, onChange } = setup({ values: raw });
            const arr = proxy.values as Float32Array;
            switch (method) {
                case 'set':
                    arr.set([9, 9], 1);
                    expect(raw[1]).toBe(9);
                    break;
                case 'fill':
                    arr.fill(4);
                    expect(raw[0]).toBe(4);
                    break;
                case 'copyWithin':
                    arr.copyWithin(0, 2);
                    expect(raw[0]).toBe(2);
                    break;
                case 'sort':
                    arr.sort();
                    expect(raw[0]).toBe(0);
                    break;
                case 'reverse':
                    arr.reverse();
                    expect(raw[0]).toBe(0);
                    break;
            }
            expect(onChange).toHaveBeenCalled();
        },
    );

    it.each(['splice', 'fill', 'sort', 'reverse'] as const)('Array.%s notifica', (method) => {
        const raw = [3, 1, 2];
        const { proxy, onChange } = setup({ values: raw });
        const arr = proxy.values as number[];
        switch (method) {
            case 'splice':
                arr.splice(0, 1);
                expect(raw).toEqual([1, 2]);
                break;
            case 'fill':
                arr.fill(0);
                expect(raw).toEqual([0, 0, 0]);
                break;
            case 'sort':
                arr.sort();
                expect(raw).toEqual([1, 2, 3]);
                break;
            case 'reverse':
                arr.reverse();
                expect(raw).toEqual([2, 1, 3]);
                break;
        }
        expect(onChange).toHaveBeenCalled();
    });

    it('delete notifica', () => {
        const { proxy, onChange } = setup({ a: 1, b: 2 });
        delete proxy.b;
        expect(onChange).toHaveBeenCalledTimes(1);
        expect('b' in proxy).toBe(false);
    });

    it('proxy aninhado é estável', () => {
        const { proxy } = setup({ position: [0, 0, 0, 1], values: new Float32Array(2) });
        expect(proxy.position).toBe(proxy.position);
        expect(proxy.values).toBe(proxy.values);
    });

    it('leitura não notifica', () => {
        const { proxy, onChange } = setup({ a: 1, position: [1, 2, 3, 1] });
        void proxy.a;
        void (proxy.position as number[])[1];
        void (proxy.position as number[]).length;
        expect(onChange).not.toHaveBeenCalled();
    });

    it('preserva serialização, iteração e checagens de tipo', () => {
        const { proxy, onChange } = setup({
            a: 1,
            position: [1, 2, 3, 1],
            v: new Float32Array([1, 2]),
        });
        expect(JSON.stringify(proxy)).toBe('{"a":1,"position":[1,2,3,1],"v":{"0":1,"1":2}}');
        expect(Array.isArray(proxy.position)).toBe(true);
        expect([...(proxy.position as number[])]).toEqual([1, 2, 3, 1]);
        expect(Object.keys(proxy)).toEqual(['a', 'position', 'v']);
        expect(proxy.v instanceof Float32Array).toBe(true);
        expect(Array.from(proxy.v as Float32Array)).toEqual([1, 2]);
        expect((proxy.v as Float32Array).byteLength).toBe(8);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('typed array proxiado pode ser usado como fonte de cópia', () => {
        const { proxy } = setup({ v: new Float32Array([1, 2, 3]) });
        const dst = new Float32Array(3);
        dst.set(proxy.v as Float32Array);
        expect(Array.from(dst)).toEqual([1, 2, 3]);
        expect(new Float32Array(proxy.v as Float32Array)[2]).toBe(3);
    });

    it('valores primitivos e objetos aninhados simples funcionam', () => {
        const { proxy, onChange } = setup({ n: 1, s: 'x', flag: true });
        proxy.n = 2;
        proxy.s = 'y';
        expect(proxy.n).toBe(2);
        expect(proxy.s).toBe('y');
        expect(onChange).toHaveBeenCalledTimes(2);
    });
});
