import type { TransitionContext } from './FlowBinding';

/**
 * Variante de pipeline de um ponto: o que o estágio prepara para uma chave (função, entidade…) com o código de fora
 * dela.
 */
export interface PipelineVariant {
    /**
     * O que distingue a variante (módulo da função, adaptadores, jato…): igual à que aguarda compilar — ou à ativa,
     * sem nenhuma aguardando — nada é preparado.
     */
    readonly key: string;
    /** Id principal: o que marca a compilação (`pipelinesCompiled`) e a rejeição da variante. */
    readonly id: string;
    /**
     * Todos os pipelines da variante (com `id`), liberados juntos quando nenhuma chave a usa — ex.: as passadas de uma
     * malha adaptativa, as duas orientações de face. Sem ele, só `id`.
     */
    readonly ids?: readonly string[];
}

/** Compilação de uma chave: a variante em uso e a que aguarda compilar. */
interface Compilation<V extends PipelineVariant> {
    active: V | undefined;
    pending: V | undefined;
}

/** Pipelines de uma variante (`ids`, ou só o principal). */
function family(v: PipelineVariant): readonly string[] {
    return v.ids ?? [v.id];
}

/**
 * Pipelines das funções de ponto de um estágio (spec 009) — o estado ativo/pendente que o Flow mantém nas suas
 * transições, um só para todos os estágios que hospedam pontos. Cada chave (a função, ou a entidade que a carrega)
 * tem a variante em uso e a que aguarda compilar; chaves com a mesma variante compartilham os pipelines. A variante
 * nova — função nova, `setCode`, adaptadores trocados — só passa a valer ao compilar (`pipelinesCompiled` do id
 * principal); rejeitada (`pipelineRejected` de qualquer pipeline dela), a chave segue com a anterior, ou com a
 * implementação pronta se não havia anterior. Pipelines que nenhuma chave usa são liberados.
 *
 * O Flow, ao sincronizar (`framePrepare` com as funções mudadas): para cada chave presente, liga as fontes privadas
 * das variantes de `bindable` e chama `select`; ao fim, `retain` com as presentes. Nas transições dos eventos de
 * pipeline, `compiled` e `rejected`. O desenho/despacho usa `active` (`undefined`: a implementação pronta, ou nada).
 */
export class ExtensionPipelines<K, V extends PipelineVariant = PipelineVariant> {
    private readonly states = new Map<K, Compilation<V>>();
    /** Pipelines preparados por este estado (todos os das variantes selecionadas, ainda não liberados). */
    private readonly owned = new Set<string>();

    /**
     * @param released Chamado para cada pipeline liberado (o estágio esquece o que derivou dele — ex.: variantes de
     * projeção sobre ele).
     */
    constructor(private readonly released?: (id: string, ctx: TransitionContext) => void) {}

    /** Chaves acompanhadas. */
    get size(): number {
        return this.states.size;
    }

    /**
     * Variantes da chave cujas fontes privadas o estágio liga (antes de `select`, ou ao recriar uma fonte): a ativa, a
     * que aguarda compilar e `next` se `select` vai prepará-la (a C2 resolve as fontes ao preparar). Sem repetição de
     * id.
     */
    bindable(k: K, next?: V): V[] {
        const st = this.states.get(k);
        const out: V[] = [];
        const wanted = next !== undefined && this.wants(st, next) ? next : undefined;
        for (const v of [st?.active, st?.pending, wanted]) {
            if (v !== undefined && !out.some((o) => o.id === v.id)) out.push(v);
        }
        return out;
    }

    /**
     * A chave quer a variante `next`: se ela difere da que aguarda (ou da ativa, sem nenhuma aguardando), `prepare`
     * a prepara e devolve se já está pronta — pronta, passa a ativa; senão, aguarda compilar (a anterior continua).
     * Pipelines que deixam de ser usados saem no `retain`. Devolve `true` se a ativa mudou.
     */
    select(k: K, next: V, prepare: (variant: V) => boolean): boolean {
        let st = this.states.get(k);
        if (st === undefined) this.states.set(k, (st = { active: undefined, pending: undefined }));
        if (!this.wants(st, next)) return false;
        for (const id of family(next)) this.owned.add(id);
        if (prepare(next)) {
            st.active = next;
            st.pending = undefined;
            return true;
        }
        st.pending = next;
        return false;
    }

    /** Esquece as chaves que não estão em `present` e libera os pipelines sem uso. */
    retain(ctx: TransitionContext, present: Iterable<K>): void {
        const keep = new Set(present);
        for (const k of [...this.states.keys()]) if (!keep.has(k)) this.states.delete(k);
        this.releaseUnused(ctx);
    }

    /**
     * Esquece a chave `k` já, liberando os pipelines dela que ninguém mais usa (o estágio refaz a chave do zero — ex.:
     * colisor com outra forma).
     */
    forget(ctx: TransitionContext, k: K): void {
        if (!this.states.delete(k)) return;
        this.releaseUnused(ctx);
    }

    /**
     * O pipeline `id` compilou: as chaves cuja variante o tem como principal e o aguardavam passam a usá-la (a
     * anterior é liberada se ninguém mais a usa). Devolve as chaves que mudaram.
     */
    compiled(id: string, ctx: TransitionContext): K[] {
        if (!this.owned.has(id)) return [];
        const changed: K[] = [];
        for (const [k, st] of this.states) {
            if (st.pending?.id !== id) continue;
            st.active = st.pending;
            st.pending = undefined;
            changed.push(k);
        }
        if (changed.length > 0) this.releaseUnused(ctx);
        return changed;
    }

    /** O pipeline `id` foi rejeitado: as chaves cuja variante pendente o tem seguem com a ativa; o que sobra é liberado. */
    rejected(id: string, ctx: TransitionContext): void {
        if (!this.owned.has(id)) return;
        for (const st of this.states.values()) {
            if (st.pending !== undefined && family(st.pending).includes(id)) st.pending = undefined;
        }
        this.releaseUnused(ctx);
    }

    /** Variante ativa da chave; `undefined` enquanto nenhuma compilou (o estágio usa a implementação pronta). */
    active(k: K): V | undefined {
        return this.states.get(k)?.active;
    }

    /** `next` difere da que aguarda compilar (ou da ativa, sem nenhuma aguardando)? */
    private wants(st: Compilation<V> | undefined, next: V): boolean {
        return (st?.pending ?? st?.active)?.key !== next.key;
    }

    private releaseUnused(ctx: TransitionContext): void {
        const used = new Set<string>();
        for (const st of this.states.values()) {
            for (const v of [st.active, st.pending])
                if (v !== undefined) for (const id of family(v)) used.add(id);
        }
        for (const id of [...this.owned]) {
            if (used.has(id)) continue;
            this.owned.delete(id);
            ctx.release(id);
            this.released?.(id, ctx);
        }
    }
}
