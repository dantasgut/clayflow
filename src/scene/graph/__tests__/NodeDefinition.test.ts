import { describe, expect, it } from 'vitest';
import { wgslModule } from '../../shaders/WgslModule';
import { defineNode } from '../NodeDefinition';
import { NodeGraphError } from '../NodeGraphError';
import { NodeRegistry } from '../NodeRegistry';
import { nodeCode, scale, split } from './probeGraph';

const fail = (fn: () => unknown): NodeGraphError => {
    try {
        fn();
    } catch (e) {
        expect(e).toBeInstanceOf(NodeGraphError);
        return e as NodeGraphError;
    }
    throw new Error('não lançou');
};

describe('defineNode (spec 031, T055)', () => {
    it('portas, parâmetros e contextos; uso com valores próprios sem copiar o código', () => {
        expect(scale.inputs).toEqual({ x: 'vec3f' });
        expect(scale.params.factor).toEqual({ type: 'f32', default: 1 });
        expect(scale.contexts).toEqual(['fragment', 'vertex', 'compute']);
        const use = scale.with({ factor: 3 });
        expect(use.definition).toBe(scale);
        expect(use.values).toEqual({ factor: 3 });
        expect(Object.isFrozen(use.values)).toBe(true);
    });

    it('várias saídas: struct do módulo com os campos das saídas', () => {
        expect(split.outputs).toEqual({ x: 'f32', rest: 'vec2f' });
        const e = fail(() =>
            defineNode({
                name: 'bad.split',
                inputs: { v: 'vec3f' },
                outputs: { x: 'f32', other: 'vec2f' },
                code: nodeCode,
                fn: 'n_split',
            }),
        );
        expect(e.kind).toBe('node-signature');
        expect(e.message).toContain("'other: vec2f'");
    });

    it('assinatura do código casa com as portas e os parâmetros (erro nomeando o nó e o esperado)', () => {
        const e = fail(() =>
            defineNode({
                name: 'bad.scale',
                inputs: { x: 'vec2f' },
                outputs: { value: 'vec3f' },
                params: { factor: { type: 'f32' } },
                code: nodeCode,
                fn: 'n_scale',
            }),
        );
        expect(e.detail).toEqual(['bad.scale']);
        expect(e.message).toMatch(/recebe \(vec3f, f32\); as portas pedem \(vec2f, f32\)/);
        expect(
            fail(() =>
                defineNode({
                    name: 'bad.ret',
                    inputs: { x: 'vec3f' },
                    outputs: { value: 'f32' },
                    params: { factor: { type: 'f32' } },
                    code: nodeCode,
                    fn: 'n_scale',
                }),
            ).message,
        ).toMatch(/devolve 'vec3f'/);
        expect(
            fail(() =>
                defineNode({ name: 'bad.fn', outputs: { v: 'f32' }, code: nodeCode, fn: 'nope' }),
            ).message,
        ).toMatch(/função 'nope' não está no módulo/);
        expect(
            fail(() => defineNode({ name: 'bad.none', outputs: {}, code: nodeCode, fn: 'n_add' }))
                .message,
        ).toMatch(/nenhuma saída/);
        expect(fail(() => scale.with({ nope: 1 })).message).toMatch(
            /parâmetro desconhecido 'nope'/,
        );
    });

    it('nó WGSL do usuário: módulo com símbolo duplicado é rejeitado como as funções da 009', () => {
        expect(() => wgslModule({ name: 'user_dup', source: 'fn a() {}\nfn a() {}' })).toThrow();
    });

    it('registro: um nome, uma definição', () => {
        const registry = new NodeRegistry([scale]);
        expect(registry.get('probe.scale')).toBe(scale);
        expect(() => {
            registry.register(scale);
        }).not.toThrow();
        const other = defineNode({ ...scale, name: 'probe.scale', params: { ...scale.params } });
        expect(
            fail(() => {
                registry.register(other);
            }).kind,
        ).toBe('node-signature');
        expect(registry.names()).toEqual(['probe.scale']);
    });
});
