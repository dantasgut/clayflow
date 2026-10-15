import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import type { WgslModule } from '../shaders/WgslModule';
import type { PointImplementation } from '../shaders/WgslPoint';
import type { TransitionContext } from './FlowBinding';

/** Compilação de uma função: o módulo em uso e o que aguarda compilar. */
interface Compilation {
    active: { readonly module: WgslModule; readonly id: string } | undefined;
    pending: { readonly module: WgslModule; readonly id: string } | undefined;
}

/**
 * Pipelines das funções de ponto de um estágio (spec 009) — estado que o Flow mantém nas suas transições: cada função
 * presente tem o pipeline do seu módulo (id `<prefixo><módulo>`; funções com o mesmo código compartilham o pipeline),
 * preparado com `verify` (o compilador confere o código de fora antes de criar o módulo). O módulo novo — função nova
 * ou `setCode` — só passa a valer ao compilar (`pipelinesCompiled`); rejeitado (`pipelineRejected`), a função segue
 * com o anterior, ou com a implementação pronta se não havia anterior. Pipelines que nenhuma função usa são
 * liberados.
 *
 * O Flow chama `sync` no `framePrepare` quando as funções mudaram (entidades, revisão do código no `poolWritten` do
 * registro), e `compiled`/`rejected` nas transições dos eventos de pipeline.
 */
export class ExtensionPipelines<F extends PointImplementation> {
    private readonly states = new Map<F, Compilation>();

    /**
     * @param prefix Prefixo dos ids de pipeline (ex.: `transform_fn:`); nenhum outro pipeline do Flow pode usá-lo.
     * @param describe Descritor do pipeline de um módulo (com `verify` e `extensions`).
     */
    constructor(
        readonly prefix: string,
        private readonly describe: (module: WgslModule, fn: F) => PipelineDescriptor,
    ) {}

    /** Funções acompanhadas. */
    get size(): number {
        return this.states.size;
    }

    /**
     * Acompanha as funções presentes: prepara o pipeline de cada módulo novo, esquece as que saíram e libera os
     * pipelines sem uso. Devolve `true` se o pipeline ativo de alguma função mudou.
     */
    sync(ctx: TransitionContext, present: Iterable<F>): boolean {
        const now = new Set(present);
        let changed = false;
        for (const fn of [...this.states.keys()]) {
            if (now.has(fn)) continue;
            this.states.delete(fn);
            changed = true;
        }
        for (const fn of now) {
            let st = this.states.get(fn);
            if (st === undefined)
                this.states.set(fn, (st = { active: undefined, pending: undefined }));
            const module = fn.module;
            if (st.active?.module === module || st.pending?.module === module) continue;
            const id = `${this.prefix}${module.name}`;
            const prepared = ctx.prepare({ ...this.describe(module, fn), id });
            if (prepared.ready) {
                st.active = { module, id };
                st.pending = undefined;
                changed = true;
            } else st.pending = { module, id };
        }
        this.releaseUnused(ctx);
        return changed;
    }

    /** O pipeline `id` compilou: as funções que o aguardavam passam a usá-lo. Devolve `true` se alguma mudou. */
    compiled(id: string): boolean {
        if (!id.startsWith(this.prefix)) return false;
        let changed = false;
        for (const st of this.states.values()) {
            if (st.pending?.id !== id) continue;
            st.active = st.pending;
            st.pending = undefined;
            changed = true;
        }
        return changed;
    }

    /** O pipeline `id` foi rejeitado: as funções seguem com o ativo; o pipeline é liberado. */
    rejected(id: string, ctx: TransitionContext): void {
        if (!id.startsWith(this.prefix)) return;
        for (const st of this.states.values()) if (st.pending?.id === id) st.pending = undefined;
        this.releaseUnused(ctx);
    }

    /** Id do pipeline ativo da função; `undefined` enquanto nenhum compilou (o estágio usa a implementação pronta). */
    active(fn: F): string | undefined {
        return this.states.get(fn)?.active?.id;
    }

    private releaseUnused(ctx: TransitionContext): void {
        const used = new Set<string>();
        for (const st of this.states.values()) {
            if (st.active !== undefined) used.add(st.active.id);
            if (st.pending !== undefined) used.add(st.pending.id);
        }
        for (const id of [...ctx.bound.pipelines.keys()]) {
            if (id.startsWith(this.prefix) && !used.has(id)) ctx.release(id);
        }
    }
}
