import type { Resource } from '../../scene/contracts/Resource';
import type { EventBus } from '../../scene/events/EventBus';
import type { EntityId } from '../../scene/world/EntityId';
import type { World } from '../../scene/world/World';
import { ShadowAtlas, type ShadowAtlasOptions } from './ShadowAtlas';
import { ShadowMap } from './ShadowMap';

/**
 * As vistas de sombra da cena por evento (spec 013, R2/R3): cada `ShadowMap` que entra — e os já na cena — vai para as
 * vistas vivas do atlas único na ordem de entrada, até o teto de vistas (`options.views`); o primeiro insere o
 * `ShadowAtlas` da cena e a saída do último o retira. O mapa que não coube espera: a faixa que outro libera é dele, na
 * mesma ordem. As luzes não chamam nada: anexam o seu mapa e o evento de mudança dos recursos faz o resto. Devolve o
 * cancelamento.
 *
 * A luz com `castShadow` desligado continua com a sua vista (o mapa segue anexado); o estágio do referencial não
 * escreve a vista dela e nenhuma página fica alocada.
 */
export function shadowViewsByEvent(
    world: World,
    events: EventBus,
    options: ShadowAtlasOptions = {},
): () => void {
    /** Os mapas da cena, na ordem de entrada. */
    const maps: ShadowMap[] = [];
    let atlas: ShadowAtlas | undefined;
    for (const record of world.allRecords())
        for (const r of record.resources) {
            if (r instanceof ShadowAtlas) atlas = r;
            else if (r instanceof ShadowMap) maps.push(r);
        }
    /** Dá vista aos mapas sem ela, na ordem de entrada; o atlas entra com o primeiro e sai sem nenhum. */
    const settle = (): void => {
        if (maps.length === 0) {
            if (atlas !== undefined && world.entityIdOfResource(atlas) !== undefined)
                world.remove(atlas);
            atlas = undefined;
            return;
        }
        const created = atlas === undefined;
        const target = atlas ?? new ShadowAtlas(options);
        atlas = target;
        for (const map of maps) if (!target.assign(map)) break;
        // Depois das vistas dadas: a C2 aloca o atlas já no tamanho delas.
        if (created) world.insert(target);
    };
    const isMap = (r: Resource): r is ShadowMap => r instanceof ShadowMap;
    settle();
    return events.on('resourcesChanged', (e) => {
        const removed = e.removed.filter(isMap);
        const added = e.added.filter(isMap);
        if (removed.length === 0 && added.length === 0) return;
        for (const map of removed) {
            const i = maps.indexOf(map);
            if (i >= 0) maps.splice(i, 1);
            atlas?.release(map);
        }
        maps.push(...added.filter((m) => !maps.includes(m)));
        settle();
    });
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
