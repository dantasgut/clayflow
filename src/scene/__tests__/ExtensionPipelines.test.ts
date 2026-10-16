import { describe, expect, it } from 'vitest';
import type { TransitionContext } from '../flows/FlowBinding';
import { ExtensionPipelines, type PipelineVariant } from '../flows/ExtensionPipelines';

/** Contexto de transição de mentira: registra o que foi preparado e liberado. */
function fakeContext(): { ctx: TransitionContext; prepared: string[]; released: string[] } {
    const prepared: string[] = [];
    const released: string[] = [];
    const ctx = {
        bound: { pipelines: new Map() },
        bind: () => undefined,
        prepare: (d: { id: string }) => {
            prepared.push(d.id);
            return { ready: false };
        },
        release: (id: string) => {
            released.push(id);
        },
    } as unknown as TransitionContext;
    return { ctx, prepared, released };
}

const variant = (key: string, ids?: string[]): PipelineVariant => ({
    key,
    id: `p:${key}`,
    ...(ids !== undefined ? { ids } : {}),
});

describe('ExtensionPipelines', () => {
    it('variante nova aguarda compilar; compilada passa a ativa e a anterior é liberada', () => {
        const { ctx, released } = fakeContext();
        const pipes = new ExtensionPipelines<number>();
        expect(pipes.select(1, variant('a'), () => true)).toBe(true);
        expect(pipes.active(1)?.id).toBe('p:a');
        // Código trocado: a anterior continua até compilar.
        expect(pipes.select(1, variant('b'), () => false)).toBe(false);
        expect(pipes.active(1)?.id).toBe('p:a');
        expect(pipes.bindable(1).map((v) => v.id)).toEqual(['p:a', 'p:b']);
        expect(pipes.compiled('p:b', ctx)).toEqual([1]);
        expect(pipes.active(1)?.id).toBe('p:b');
        expect(released).toEqual(['p:a']);
        // Id que não é deste estado: ignorado.
        expect(pipes.compiled('outro', ctx)).toEqual([]);
    });

    it('mesma chave da pendente (ou da ativa) não prepara de novo', () => {
        const { ctx } = fakeContext();
        const pipes = new ExtensionPipelines<number>();
        let calls = 0;
        const prepare = (): boolean => {
            calls++;
            return false;
        };
        pipes.select(1, variant('a'), prepare);
        pipes.select(1, variant('a'), prepare);
        expect(calls).toBe(1);
        expect(pipes.bindable(1, variant('a')).map((v) => v.id)).toEqual(['p:a']);
        expect(pipes.bindable(1, variant('b')).map((v) => v.id)).toEqual(['p:a', 'p:b']);
        pipes.compiled('p:a', ctx);
        pipes.select(1, variant('a'), prepare);
        expect(calls).toBe(1);
    });

    it('rejeitada: a chave segue com a ativa e a rejeitada é liberada', () => {
        const { ctx, released } = fakeContext();
        const pipes = new ExtensionPipelines<number>();
        pipes.select(1, variant('a'), () => true);
        pipes.select(1, variant('b'), () => false);
        pipes.rejected('p:b', ctx);
        expect(pipes.active(1)?.id).toBe('p:a');
        expect(pipes.bindable(1).map((v) => v.id)).toEqual(['p:a']);
        expect(released).toEqual(['p:b']);
        // Rejeitada sem anterior: nada ativo (o estágio usa a implementação pronta).
        pipes.select(2, variant('c'), () => false);
        pipes.rejected('p:c', ctx);
        expect(pipes.active(2)).toBeUndefined();
    });

    it('pipelines compartilhados só saem quando nenhuma chave os usa; retain e forget liberam', () => {
        const { ctx, released } = fakeContext();
        const freed: string[] = [];
        const pipes = new ExtensionPipelines<string>((id) => freed.push(id));
        pipes.select('f', variant('a'), () => true);
        pipes.select('g', variant('a'), () => true);
        pipes.retain(ctx, ['g']);
        expect(released).toEqual([]);
        expect(pipes.size).toBe(1);
        pipes.select('h', variant('b'), () => true);
        pipes.forget(ctx, 'g');
        expect(released).toEqual(['p:a']);
        expect(freed).toEqual(['p:a']);
        pipes.retain(ctx, []);
        expect(released).toEqual(['p:a', 'p:b']);
        expect(pipes.size).toBe(0);
    });

    it('superada antes de compilar: a pendente antiga é liberada', () => {
        const { ctx, released } = fakeContext();
        const pipes = new ExtensionPipelines<number>();
        pipes.select(1, variant('a'), () => false);
        pipes.select(1, variant('b'), () => false);
        pipes.retain(ctx, [1]);
        expect(released).toEqual(['p:a']);
        // Compilação tardia da superada: nada muda.
        expect(pipes.compiled('p:a', ctx)).toEqual([]);
    });

    it('chave composta: a variante com vários pipelines compila pelo principal e sai inteira', () => {
        const { ctx, released } = fakeContext();
        const pipes = new ExtensionPipelines<number>();
        const ids = (key: string): string[] => [`p:${key}`, `p:${key}#level`, `p:${key}#scan`];
        pipes.select(1, variant('m|jet', ids('m|jet')), () => true);
        pipes.select(1, variant('m|numeric', ids('m|numeric')), () => false);
        // Um pipeline auxiliar compilado não troca a variante.
        expect(pipes.compiled('p:m|numeric#level', ctx)).toEqual([]);
        expect(pipes.active(1)?.key).toBe('m|jet');
        expect(pipes.compiled('p:m|numeric', ctx)).toEqual([1]);
        expect(released).toEqual(ids('m|jet'));
        // Rejeição de um auxiliar descarta a pendente inteira.
        pipes.select(1, variant('n|jet', ids('n|jet')), () => false);
        pipes.rejected('p:n|jet#scan', ctx);
        expect(pipes.active(1)?.key).toBe('m|numeric');
        expect(released).toEqual([...ids('m|jet'), ...ids('n|jet')]);
    });
});
