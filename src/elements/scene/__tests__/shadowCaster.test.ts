import { describe, expect, it } from 'vitest';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import type { ShadowUnavailablePayload } from '../../../scene/events/EventMap';
import { NONE } from '../../../scene/shaders/engineConstants';
import { World } from '../../../scene/world/World';
import { DirectionalLight } from '../DirectionalLight';
import { Light } from '../Light';
import { lightVisibilityPoint } from '../points/lighting';
import { ShadowAtlas } from '../ShadowAtlas';
import { liveShadowViews, shadowViewsByEvent } from '../shadowCaster';

/** Uma cena com as vistas de sombra por evento, o teto `views` e os avisos recebidos. */
function scene(views: number) {
    const events = new DefaultEventBus();
    const world = new World(events);
    const unavailable: ShadowUnavailablePayload[] = [];
    events.on('shadowUnavailable', (e) => unavailable.push(e));
    const off = shadowViewsByEvent(world, events, () => ({ views }));
    const atlas = (): ShadowAtlas | undefined => {
        const id = world.queryBySchemaName(ShadowAtlas.schema.name)[0];
        return id === undefined
            ? undefined
            : world.resourcesOf(id).find((r): r is ShadowAtlas => r instanceof ShadowAtlas);
    };
    const add = (castShadow = true): DirectionalLight => {
        const light = new DirectionalLight({ castShadow });
        world.insert(light);
        return light;
    };
    /** O envio do pool das luzes (o que a C2 anuncia quando uma luz muda). */
    const lightsWritten = (fields?: readonly string[]): void => {
        events.emit('poolWritten', {
            poolKey: Light.schema.name,
            schema: Light.schema,
            ranges: [],
            ...(fields === undefined ? {} : { fields }),
        });
    };
    const viewOf = (light: DirectionalLight): number => light.shadowMap!.data.view;
    /** A luz compõe a contribuição de sombra? */
    const shadowed = (light: DirectionalLight): boolean =>
        light
            .getSceneContributions()
            .find((c) => c.point === lightVisibilityPoint)
            ?.build(() => 0) !== undefined;
    return { world, events, unavailable, atlas, add, lightsWritten, viewOf, shadowed, off };
}

describe('vistas de sombra por evento (spec 013, R8)', () => {
    it('acima do teto: shadowUnavailable com a luz e o motivo; ela fica sem vista e sem contribuição de sombra', () => {
        // Arrange
        const s = scene(2);
        // Act
        const [a, b, c] = [s.add(), s.add(), s.add()];
        // Assert: as duas primeiras, na ordem de entrada, têm sombra; a terceira é avisada.
        expect([a, b, c].map(s.viewOf)).toEqual([0, 1, NONE.value]);
        expect(s.unavailable).toEqual([{ light: c, reason: 'limit' }]);
        expect([a, b, c].map(s.shadowed)).toEqual([true, true, false]);
        expect(liveShadowViews(s.world, s.atlas()!).map((v) => v.map)).toEqual([
            a.shadowMap,
            b.shadowMap,
        ]);
    });

    it('o aviso sai uma vez enquanto a luz espera, e a faixa que outra libera é dela, na ordem de entrada', () => {
        const s = scene(2);
        const [a, b, c, d] = [s.add(), s.add(), s.add(), s.add()];
        expect(s.unavailable.map((e) => e.light)).toEqual([c, d]);
        // Outra mudança das luzes não repete o aviso.
        s.lightsWritten();
        expect(s.unavailable).toHaveLength(2);
        // A primeira sai: a terceira (a que esperava há mais tempo) fica com a faixa dela; a quarta segue esperando.
        s.world.remove(a);
        expect([b, c, d].map(s.viewOf)).toEqual([1, 0, NONE.value]);
        expect(s.shadowed(c)).toBe(true);
        expect(s.unavailable).toHaveLength(2);
        // A terceira volta a ficar sem sombra depois (uma luz anterior a ela volta a projetar): novo aviso.
        b.data.castShadow = 0;
        s.lightsWritten(['castShadow']);
        expect([b, c, d].map(s.viewOf)).toEqual([NONE.value, 0, 1]);
        b.data.castShadow = 1;
        s.lightsWritten(['castShadow']);
        expect([b, c, d].map(s.viewOf)).toEqual([1, 0, NONE.value]);
        expect(s.unavailable.map((e) => e.light)).toEqual([c, d, d]);
    });

    it('a luz que desliga castShadow em execução libera a faixa; ligar de novo a devolve, sem mexer nas outras', () => {
        const s = scene(4);
        const [a, b] = [s.add(), s.add()];
        const generation = s.atlas()!.generationOf(1);
        a.data.castShadow = 0;
        // Outro campo das luzes mudado não reavalia as vistas.
        s.lightsWritten(['direction']);
        expect(s.viewOf(a)).toBe(0);
        s.lightsWritten(['castShadow']);
        expect([a, b].map(s.viewOf)).toEqual([NONE.value, 1]);
        expect(s.shadowed(a)).toBe(false);
        expect(s.atlas()!.data.live).toBe(1);
        a.data.castShadow = 1;
        s.lightsWritten(['castShadow']);
        expect([a, b].map(s.viewOf)).toEqual([0, 1]);
        // A faixa da outra luz não mudou de geração (o cache dela segue).
        expect(s.atlas()!.generationOf(1)).toBe(generation);
        expect(s.unavailable).toEqual([]);
    });

    it('a luz criada sem sombra não tem mapa nem vista; sem nenhuma luz que projete, o atlas sai da cena', () => {
        const s = scene(4);
        const plain = s.add(false);
        expect(plain.shadowMap).toBeUndefined();
        expect(s.atlas()).toBeUndefined();
        const a = s.add();
        expect(s.atlas()).toBeDefined();
        a.data.castShadow = 0;
        s.lightsWritten(['castShadow']);
        expect(s.atlas()).toBeUndefined();
        a.data.castShadow = 1;
        s.lightsWritten(['castShadow']);
        expect(s.viewOf(a)).toBe(0);
        s.world.remove(a);
        expect(s.atlas()).toBeUndefined();
    });

    it('o teto que baixa (a troca de perfil) tira as vistas além dele, com o aviso; o que sobe as devolve', () => {
        // Arrange
        const s = scene(4);
        const lights = [s.add(), s.add(), s.add()];
        expect(s.unavailable).toEqual([]);
        // Act: o teto de vistas cai para 1.
        s.atlas()!.limit({ views: 1, atlasPagesMax: 16 });
        // Assert: só a primeira luz segue com sombra; as outras duas são avisadas.
        expect(lights.map(s.viewOf)).toEqual([0, NONE.value, NONE.value]);
        expect(s.unavailable).toEqual([
            { light: lights[1], reason: 'limit' },
            { light: lights[2], reason: 'limit' },
        ]);
        expect(s.atlas()!.data).toMatchObject({ views: 1, live: 1 });
        // O teto sobe: as três voltam, na ordem de entrada.
        s.atlas()!.limit({ views: 4, atlasPagesMax: 48 });
        expect(lights.map(s.viewOf)).toEqual([0, 1, 2]);
        expect(s.unavailable).toHaveLength(2);
    });

    it('cancelado, deixa de acompanhar a cena', () => {
        const s = scene(1);
        s.add();
        s.off();
        const late = s.add();
        expect(s.viewOf(late)).toBe(NONE.value);
        expect(s.unavailable).toEqual([]);
    });
});
