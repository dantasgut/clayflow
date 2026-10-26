import type { EngineCore, StorageBufferSpec } from '../../../core/contracts/index';
import type { ResolvedSource } from '../../consumers/ResolvedSource';
import type { ExtensionFunction } from '../../contracts/ExtensionFunction';
import type { PoolDirectory } from '../../contracts/PoolDirectory';
import type { Resource } from '../../contracts/Resource';
import { bindPoints, boundImplementations, type BindablePoint } from '../../shaders/bindPoints';
import { composeWgsl } from '../../shaders/composeWgsl';
import type { WgslModule } from '../../shaders/WgslModule';
import type { Schema } from '../../descriptors/Schema';
import type { StructSchema } from '../../descriptors/StructSchema';
import { instantiateModule } from '../../shaders/instantiate';
import {
    scenePointsIn,
    type ContributionPoint,
    type PointImplementation,
    type ScenePointGlobal,
    type WgslPoint,
} from '../../shaders/WgslPoint';
import type { World } from '../../world/World';

/** Funções presentes de um ponto de cena e o módulo composto delas. */
interface PointFunctions {
    readonly point: WgslPoint;
    readonly functions: Set<ExtensionFunction>;
    /** Revisão de cada função na última composição. */
    readonly revisions: Map<ExtensionFunction, number>;
    /** Slot do registro de cada função (no pool da forma dela) na última composição. */
    readonly slots: Map<ExtensionFunction, number>;
    combined: WgslModule | undefined;
}

/**
 * Pontos de cena (spec 009): as funções de pontos como `field` e `space` inseridas na cena valem para todo pipeline
 * cujo shader contém o ponto. A C2 acompanha as funções (inserção, remoção, revisão do código, slot do registro),
 * compõe o módulo delas pelo `combine` do ponto e o põe no lugar do pronto em cada pipeline (`bind`); a `version`
 * sobe a cada mudança — os runtimes preparam os pipelines afetados de novo e só trocam quando compilam.
 *
 * Cada função traz o pool da sua forma (registro tipado, spec 031 R8: recurso declarado no módulo dela, fornecido pelo
 * pool); o módulo composto lê cada uma pelo seu carregador. A soma das ligações de cada pipeline com as funções é
 * conferida contra os limites do device na preparação (`PipelineState`): acima deles, as funções são rejeitadas
 * (`extensionRejected`) e o pipeline fica com o pronto. As variáveis globais dos pontos (os campos prontos de `field`,
 * por exemplo) são ligadas pela C2: o pool, quando existe, ou um substituto zerado de um registro (`globalSource`).
 */
export class ScenePoints {
    private readonly byPoint = new Map<WgslPoint, PointFunctions>();
    /** Resources com contribuições de cena (spec 031). */
    private readonly contributors = new Set<Resource>();
    /** Módulo composto de cada ponto de contribuição com ao menos um contribuinte. */
    private readonly contributed = new Map<ContributionPoint, WgslModule>();
    private readonly dummies = new Map<string, StorageBufferSpec>();
    /** Sobe a cada mudança de composição. */
    version = 0;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly pools: PoolDirectory,
    ) {}

    /** Recursos entraram ou saíram da cena: funções de ponto de cena entram ou saem da composição. */
    resourcesChanged(added: readonly Resource[], removed: readonly Resource[]): boolean {
        let changed = false;
        for (const r of removed) if (this.contributors.delete(r)) changed = true;
        for (const r of added) {
            if (r.getSceneContributions === undefined || r.getSceneContributions().length === 0)
                continue;
            this.contributors.add(r);
            changed = true;
        }
        for (const r of removed) {
            const fn = asSceneFunction(r);
            if (fn === undefined) continue;
            const entry = this.byPoint.get(fn.point);
            if (entry?.functions.delete(fn) === true) changed = true;
        }
        for (const r of added) {
            const fn = asSceneFunction(r);
            if (fn === undefined) continue;
            let entry = this.byPoint.get(fn.point);
            if (entry === undefined) {
                entry = {
                    point: fn.point,
                    functions: new Set(),
                    revisions: new Map(),
                    slots: new Map(),
                    combined: undefined,
                };
                this.byPoint.set(fn.point, entry);
            }
            entry.functions.add(fn);
            changed = true;
        }
        if (changed) this.recompose();
        return changed;
    }

    /** Um Resource foi enviado: se contribui para pontos de cena e a contribuição mudou, recompõe (spec 031). */
    resourceUploaded(resource: Resource): boolean {
        if (!this.contributors.has(resource) || !this.contributionsChanged()) return false;
        this.recompose();
        return true;
    }

    /** Um pool foi escrito: revisão de código ou slot de alguma função mudou? Recompõe se sim. */
    poolWritten(schema: Schema): boolean {
        let changed = this.contributionsDependOn(schema.name) && this.contributionsChanged();
        for (const entry of this.byPoint.values()) {
            if (!entry.point.isRecord(schema)) continue;
            for (const fn of entry.functions) {
                if (
                    entry.revisions.get(fn) !== fn.revision
                    || entry.slots.get(fn) !== this.slotOf(fn)
                ) {
                    changed = true;
                    break;
                }
            }
        }
        if (changed) this.recompose();
        return changed;
    }

    /**
     * O shader `shader` com as funções de cena dos pontos que ele contém; o mesmo `shader` sem nenhuma. Ponto cuja
     * composição não monta neste shader (símbolo em conflito com o do kernel, por exemplo) fica com o pronto, e
     * `rejected` recebe as funções e a mensagem.
     */
    bind(
        shader: WgslModule,
        rejected: (fns: readonly PointImplementation[], message: string) => void,
    ): { shader: WgslModule; extensions: readonly PointImplementation[] } {
        const impls = new Map<BindablePoint, WgslModule>();
        const extensions: PointImplementation[] = [];
        for (const entry of this.byPoint.values()) {
            if (entry.combined === undefined || !contains(shader, entry.point.ready)) continue;
            try {
                composeWgsl(bindPoints(shader, new Map([[entry.point, entry.combined]])));
            } catch (e) {
                rejected([...entry.functions], e instanceof Error ? e.message : String(e));
                continue;
            }
            impls.set(entry.point, entry.combined);
            extensions.push(...entry.functions);
        }
        // Pontos de contribuição no shader ou dentro de uma contribuição já escolhida (spec 011: o laço das luzes chama a
        // sombra e a água por luz), até nada mudar.
        for (let added = true; added; ) {
            added = false;
            for (const [point, module] of this.contributed) {
                if (impls.has(point)) continue;
                const reached =
                    contains(shader, point.ready)
                    || [...impls.values()].some((m) => contains(m, point.ready));
                if (!reached) continue;
                impls.set(point, module);
                added = true;
            }
        }
        if (impls.size === 0) return { shader, extensions };
        // As trocas que quem desenha já fez no shader (a composição das funções `material` dos acertos, por exemplo)
        // valem também dentro das contribuições que chamam o mesmo ponto: senão o pronto dele entraria ao lado da
        // implementação, o mesmo símbolo duas vezes.
        for (const [point, module] of boundImplementations(shader))
            if (!impls.has(point) && [...impls.values()].some((m) => contains(m, point.ready)))
                impls.set(point, module);
        return { shader: bindPoints(shader, impls), extensions };
    }

    /**
     * Fonte da variável global `name` de um dos pontos de cena de `shader` (o shader do descritor, antes da troca): o
     * pool, ou o substituto zerado; `undefined` se `name` não é global de nenhum deles.
     */
    globalSource(shader: WgslModule, name: string): ResolvedSource | undefined {
        let global: ScenePointGlobal | undefined;
        for (const point of scenePointsIn(shader)) global ??= point.scene?.globals[name];
        if (global === undefined) return undefined;
        const live = global.part === 'live';
        const pool = live
            ? this.pools.poolLiveBuffer(global.pool.name)
            : this.pools.poolBufferSpec(global.pool.name);
        if (pool !== undefined) return { kind: 'buffer', buffer: pool };
        const key = `${global.pool.name}:${live ? 'live' : 'records'}`;
        let dummy = this.dummies.get(key);
        if (dummy === undefined) {
            dummy = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `scene_point_dummy:${key}`,
                byteSize: live ? 16 : global.pool.stride,
            });
            this.dummies.set(key, dummy);
        }
        return { kind: 'buffer', buffer: dummy };
    }

    /** Libera os substitutos. */
    dispose(): void {
        for (const d of this.dummies.values()) this.core.destroy(d);
        this.dummies.clear();
    }

    /** Alguma contribuição depende de slots do pool `schemaName`? */
    private contributionsDependOn(schemaName: string): boolean {
        for (const r of this.contributors) {
            for (const c of r.getSceneContributions!()) {
                if (c.pools.some((p) => p.name === schemaName)) return true;
            }
        }
        return false;
    }

    /** Os módulos das contribuições mudaram (slots, condição)? */
    private contributionsChanged(): boolean {
        const next = this.composeContributions();
        if (next.size !== this.contributed.size) return true;
        for (const [point, module] of next) if (this.contributed.get(point) !== module) return true;
        return false;
    }

    /**
     * Módulo de cada ponto de contribuição: o do contribuinte, ou a combinação dos contribuintes em ordem. O mesmo módulo
     * vindo de vários contribuintes entra uma vez (spec 011: cada classe de luz contribui o mesmo laço sobre o pool, não
     * um módulo por luz), na menor ordem em que aparece.
     */
    private composeContributions(): Map<ContributionPoint, WgslModule> {
        const byPoint = new Map<ContributionPoint, { order: number; module: WgslModule }[]>();
        for (const r of this.contributors) {
            const id = this.world.entityIdOfResource(r);
            if (id === undefined) continue;
            const slotOf = (pool: StructSchema): number | undefined =>
                this.pools.poolSlotOf(pool.name, id);
            for (const c of r.getSceneContributions!()) {
                const module = c.build(slotOf);
                if (module === undefined) continue;
                let list = byPoint.get(c.point);
                if (list === undefined) byPoint.set(c.point, (list = []));
                const same = list.find((e) => e.module === module);
                if (same === undefined) list.push({ order: c.order, module });
                else same.order = Math.min(same.order, c.order);
            }
        }
        const out = new Map<ContributionPoint, WgslModule>();
        for (const [point, list] of byPoint) {
            list.sort((a, b) => a.order - b.order);
            out.set(
                point,
                list.length === 1
                    ? list[0]!.module
                    : point.combine(list.map((e, k) => instantiateModule(e.module, `_${k}`))),
            );
        }
        return out;
    }

    private recompose(): void {
        this.contributed.clear();
        for (const [point, module] of this.composeContributions())
            this.contributed.set(point, module);
        for (const entry of this.byPoint.values()) {
            entry.revisions.clear();
            entry.slots.clear();
            const entries: { impl: PointImplementation; slot: number }[] = [];
            for (const fn of entry.functions) {
                const slot = this.slotOf(fn);
                entry.revisions.set(fn, fn.revision);
                if (slot === undefined || !fn.implemented) continue;
                entry.slots.set(fn, slot);
                entries.push({ impl: fn, slot });
            }
            entry.combined = entries.length === 0 ? undefined : entry.point.scene!.combine(entries);
        }
        this.version++;
    }

    private slotOf(fn: ExtensionFunction): number | undefined {
        const id = this.world.entityIdOfResource(fn);
        return id === undefined ? undefined : this.pools.poolSlotOf(fn.record.name, id);
    }
}

function asSceneFunction(r: Resource): ExtensionFunction | undefined {
    const fn = r as Partial<ExtensionFunction>;
    return fn.point?.scene !== undefined && fn.module !== undefined
        ? (r as ExtensionFunction)
        : undefined;
}

function contains(root: WgslModule, target: WgslModule): boolean {
    const seen = new Set<WgslModule>();
    const walk = (m: WgslModule): boolean => {
        if (m === target) return true;
        if (seen.has(m)) return false;
        seen.add(m);
        return m.requires.some(walk);
    };
    return walk(root);
}
