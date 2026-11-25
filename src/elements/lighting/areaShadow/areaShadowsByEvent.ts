import type { EventBus } from '../../../scene/events/EventBus';
import type { Resource } from '../../../scene/contracts/Resource';
import type { World } from '../../../scene/world/World';
import { RayScene } from '../../raytrace/RayScene';
import { Light } from '../../scene/Light';
import { RectLight } from '../../scene/RectLight';
import { AreaShadow } from './AreaShadow';
import { AREA_SHADOW_MAX_LIGHTS } from './areaShadowSchema';

/**
 * A sombra das luzes de área por evento (spec 013, R5 e R8): as `RectLight` com `castShadow`, na ordem de entrada, até
 * o teto (`limit`, e no máximo `AREA_SHADOW_MAX_LIGHTS`), recebem cada uma um canal do `AreaShadow` da cena (o canal
 * mais um em `cones.z`; 0 sem sombra); as demais iluminam sem sombra e são avisadas uma vez (`shadowUnavailable`,
 * `limit`). O `AreaShadow` entra com a primeira e sai sem nenhuma; com ele entra a estrutura de raios da cena, se não
 * há. Reavalia quando luzes entram ou saem e quando o pool das luzes é escrito com `castShadow`. Devolve o
 * cancelamento.
 */
export function areaShadowsByEvent(
    world: World,
    events: EventBus,
    limit: () => number,
): () => void {
    const lights: RectLight[] = [];
    const warned = new Set<Light>();
    let shadow: AreaShadow | undefined;
    for (const record of world.allRecords())
        for (const r of record.resources) {
            if (r instanceof AreaShadow) shadow = r;
            else if (r instanceof RectLight) lights.push(r);
        }
    const channelOf = (light: RectLight, channel: number): void => {
        const c = light.data.cones;
        if ((c[2] ?? 0) === channel) return;
        light.data.cones = [c[0] ?? 0, c[1] ?? 0, channel, c[3] ?? 0];
    };
    let settling = false;
    const settle = (): void => {
        if (settling) return;
        settling = true;
        const casting = lights.filter((l) => l.data.castShadow === 1);
        const room = Math.max(0, Math.min(limit(), AREA_SHADOW_MAX_LIGHTS));
        const chosen = casting.slice(0, room);
        for (const light of lights) {
            const k = chosen.indexOf(light);
            channelOf(light, k < 0 ? 0 : k + 1);
            if (k >= 0) warned.delete(light);
        }
        if (chosen.length === 0) {
            if (shadow !== undefined && world.entityIdOfResource(shadow) !== undefined)
                world.remove(shadow);
            shadow = undefined;
        } else {
            const created = shadow === undefined;
            const target = shadow ?? new AreaShadow();
            shadow = target;
            target.lights = chosen;
            if (world.queryBySchemaName(RayScene.schema.name).length === 0)
                world.insert(new RayScene());
            if (created) world.insert(target);
        }
        for (const light of casting.slice(room)) {
            if (warned.has(light)) continue;
            warned.add(light);
            events.emit('shadowUnavailable', { light, reason: 'limit' });
        }
        settling = false;
    };
    const isRect = (r: Resource): r is RectLight => r instanceof RectLight;
    settle();
    const offs = [
        events.on('resourcesChanged', (e) => {
            const removed = e.removed.filter(isRect);
            const added = e.added.filter(isRect);
            if (removed.length === 0 && added.length === 0) return;
            for (const light of removed) {
                const i = lights.indexOf(light);
                if (i >= 0) lights.splice(i, 1);
                warned.delete(light);
            }
            lights.push(...added.filter((l) => !lights.includes(l)));
            settle();
        }),
        events.on('poolWritten', (e) => {
            if (e.schema.name !== Light.schema.name || lights.length === 0) return;
            if (e.fields !== undefined && !e.fields.includes('castShadow')) return;
            settle();
        }),
    ];
    return () => {
        for (const off of offs) off();
    };
}
