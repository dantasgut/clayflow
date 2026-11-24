import type { Resource } from '../../scene/contracts/Resource';
import type { EventBus } from '../../scene/events/EventBus';
import type { EntityId } from '../../scene/world/EntityId';
import type { World } from '../../scene/world/World';
import { Light } from './Light';
import { ShadowAtlas, type ShadowAtlasOptions } from './ShadowAtlas';
import { ShadowMap } from './ShadowMap';

/**
 * As vistas de sombra da cena por evento (spec 013, R2/R3/R8): cada `ShadowMap` de uma luz que projeta (`castShadow`
 * ligado) vai para as vistas vivas do atlas único na ordem de entrada na cena, até o teto de vistas; o primeiro insere o
 * `ShadowAtlas` da cena e a saída do último o retira. As luzes não chamam nada: anexam o seu mapa e os eventos fazem o
 * resto — a entrada e a saída de recursos (`resourcesChanged`), o envio do pool das luzes (`poolWritten`: a luz que
 * liga ou desliga `castShadow` em execução ganha ou libera a faixa) e a mudança dos tetos do atlas (o perfil do
 * renderizador).
 *
 * A luz que pede sombra e fica além do teto ilumina sem sombra e gera `shadowUnavailable` (motivo `'limit'`), uma vez
 * enquanto espera; a faixa que outra libera é dela, na mesma ordem. `limits` dá os tetos com que o atlas é criado (os do
 * perfil do renderizador, o limite do adaptador). Devolve o cancelamento.
 */
export function shadowViewsByEvent(
    world: World,
    events: EventBus,
    limits: () => ShadowAtlasOptions = () => ({}),
): () => void {
    /** Os mapas da cena, na ordem de entrada. */
    const maps: ShadowMap[] = [];
    /** As luzes já avisadas de que estão sem sombra (enquanto esperam). */
    const warned = new Set<Light>();
    let atlas: ShadowAtlas | undefined;
    for (const record of world.allRecords())
        for (const r of record.resources) {
            if (r instanceof ShadowAtlas) atlas = r;
            else if (r instanceof ShadowMap) maps.push(r);
        }
    /** A luz do mapa (a da mesma entidade). */
    const lightOf = (map: ShadowMap): Light | undefined => {
        const id = world.entityIdOfResource(map);
        if (id === undefined) return undefined;
        return world.resourcesOf(id).find((r): r is Light => r instanceof Light);
    };
    let settling = false;
    let again = false;
    /**
     * As vistas vivas: os mapas das luzes que projetam, na ordem de entrada, até o teto; os demais saem (ou esperam, com
     * o aviso). O atlas entra com a primeira vista e sai sem nenhuma.
     */
    const settle = (): void => {
        // A inserção do atlas e a mudança dos tetos chegam aqui de volta: uma passada de cada vez.
        if (settling) {
            again = true;
            return;
        }
        settling = true;
        do {
            again = false;
            const casting = maps
                .map((map) => ({ map, light: lightOf(map) }))
                .filter(
                    (c): c is { map: ShadowMap; light: Light } => c.light?.data.castShadow === 1,
                );
            if (casting.length === 0) {
                for (const map of maps) atlas?.release(map);
                if (atlas !== undefined) {
                    atlas.watch(undefined);
                    if (world.entityIdOfResource(atlas) !== undefined) world.remove(atlas);
                }
                atlas = undefined;
                warned.clear();
                continue;
            }
            const created = atlas === undefined;
            const target = atlas ?? new ShadowAtlas(limits());
            atlas = target;
            target.watch(settle);
            const chosen = casting.slice(0, target.data.views);
            // Primeiro saem as que não projetam mais ou passaram do teto; depois entram as escolhidas, em ordem.
            for (const map of maps) if (!chosen.some((c) => c.map === map)) target.release(map);
            for (const { map, light } of chosen) {
                target.assign(map);
                warned.delete(light);
            }
            // Depois das vistas dadas: a C2 aloca o atlas já no tamanho delas.
            if (created) world.insert(target);
            for (const { light } of casting.slice(target.data.views)) {
                if (warned.has(light)) continue;
                warned.add(light);
                events.emit('shadowUnavailable', { light, reason: 'limit' });
            }
        } while (again);
        settling = false;
    };
    const isMap = (r: Resource): r is ShadowMap => r instanceof ShadowMap;
    settle();
    const offs = [
        events.on('resourcesChanged', (e) => {
            const removed = e.removed.filter(isMap);
            const added = e.added.filter(isMap);
            if (removed.length === 0 && added.length === 0) return;
            for (const map of removed) {
                const i = maps.indexOf(map);
                if (i >= 0) maps.splice(i, 1);
                atlas?.release(map);
            }
            for (const r of e.removed) if (r instanceof Light) warned.delete(r);
            maps.push(...added.filter((m) => !maps.includes(m)));
            settle();
        }),
        // O pool das luzes foi enviado: alguma ligou ou desligou a sombra?
        events.on('poolWritten', (e) => {
            if (e.schema.name !== Light.schema.name || maps.length === 0) return;
            if (e.fields !== undefined && !e.fields.includes('castShadow')) return;
            settle();
        }),
    ];
    return () => {
        for (const off of offs) off();
        atlas?.watch(undefined);
    };
}

/** Uma vista de sombra viva: o índice da faixa dela no atlas, o mapa e a entidade da luz que o tem. */
export interface LiveShadowView {
    readonly view: number;
    readonly map: ShadowMap;
    readonly entity: EntityId;
}

/**
 * As vistas de sombra vivas da cena, pela ordem das faixas no atlas (a de entrada das luzes, enquanto nenhuma sai): o que
 * os estágios de sombra e dos pedidos percorrem, no lugar de "o primeiro mapa que projeta". O mapa fora da cena (a luz
 * retirada neste quadro) não entra.
 */
export function liveShadowViews(world: World, atlas: ShadowAtlas): readonly LiveShadowView[] {
    const out: LiveShadowView[] = [];
    atlas.views.forEach((map, view) => {
        if (map === undefined) return;
        const entity = world.entityIdOfResource(map);
        if (entity !== undefined) out.push({ view, map, entity });
    });
    return out;
}
