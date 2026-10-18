import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import type { ContributionPoint } from '../../scene/shaders/WgslPoint';

// Pontos de cena dos volumes atravessados por raios (spec 033, R11): quem traça raios (as sondas e a tela da luz
// rebatida, a refração recalculada, os fótons) chama estas funções sem conhecer quem as implementa — hoje o campo dos
// fluidos (`FluidField`); sem contribuinte, fica o pronto (nenhum volume). As superfícies opacas continuam na estrutura
// de raios (`ray_scene_hit`); os volumes são transmissivos: o raio os atravessa.

/** Acerto de um raio na superfície de um volume: distância, ponto, normal (para fora), material e lado da origem. */
export const rayVolumeTypes = wgslModule({
    name: 'ray_volume_types',
    source: `/** Acerto na superfície de um volume: \`hit\` falso sem acerto; \`inside\` com a origem dentro dele. */
struct RayVolumeHit {
    t: f32,
    position: vec3f,
    normal: vec3f,
    material: u32,
    hit: bool,
    inside: bool,
}`,
});

/**
 * `fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit` — o cruzamento mais próximo do raio
 * (direção unitária) com a superfície de um volume até `t_max` (entrando, ou saindo quando a origem está dentro); pronto:
 * sem acerto.
 */
export const rayVolumeHitReady = wgslModule({
    name: 'ray_volume_hit_ready',
    requires: [rayVolumeTypes],
    source: `fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit {
    return RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, false);
}`,
});

/**
 * `fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32) -> vec3f` — a fração da luz que atravessa os
 * volumes no segmento (absorção pelo trecho dentro de cada um); pronto: 1.
 */
export const rayVolumeTransmittanceReady = wgslModule({
    name: 'ray_volume_transmittance_ready',
    source: `fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32) -> vec3f {
    return vec3f(1.0);
}`,
});

/** Meio de um volume atravessado: IOR, número de Abbe e o coeficiente de absorção (1/m, por canal). */
export const rayVolumeMediumType = wgslModule({
    name: 'ray_volume_medium_type',
    source: `/** Meio de um volume: IOR, número de Abbe (0 = sem dispersão) e absorção por metro (Beer-Lambert). */
struct RayVolumeMedium {
    ior: f32,
    abbe: f32,
    absorption: vec3f,
}`,
});

/**
 * `fn ray_volume_medium(material: u32) -> RayVolumeMedium` — o meio do volume `material` (o de `RayVolumeHit`), para quem
 * refrata nas superfícies dos volumes e atenua dentro deles (spec 034); pronto: água sem absorção.
 */
export const rayVolumeMediumReady = wgslModule({
    name: 'ray_volume_medium_ready',
    requires: [rayVolumeMediumType],
    source: `fn ray_volume_medium(material: u32) -> RayVolumeMedium {
    return RayVolumeMedium(1.333, 0.0, vec3f(0.0));
}`,
});

/**
 * `fn ray_volume_enter(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit` — com a origem fora dos volumes, a entrada
 * mais próxima até `t_max`; e `ray_volume_exit` — com a origem dentro, a saída. Para quem sabe de que lado está (a
 * refração, pela pilha dos meios): sem o teste do lado da origem de `ray_volume_hit`. Prontos: sem acerto.
 */
export const rayVolumeEnterReady = wgslModule({
    name: 'ray_volume_enter_ready',
    requires: [rayVolumeTypes],
    source: `fn ray_volume_enter(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit {
    return RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, false);
}`,
});

/** Saída dos volumes com a origem dentro deles (ver `rayVolumeEnterReady`). */
export const rayVolumeExitReady = wgslModule({
    name: 'ray_volume_exit_ready',
    requires: [rayVolumeTypes],
    source: `fn ray_volume_exit(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit {
    return RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, true);
}`,
});

const combined = new Map<string, WgslModule>();

function memo(key: string, make: () => WgslModule): WgslModule {
    let m = combined.get(key);
    if (m === undefined) combined.set(key, (m = make()));
    return m;
}

/** Acerto nos volumes: o mais próximo entre os contribuintes. */
export const rayVolumeHitPoint: ContributionPoint = {
    name: 'ray_volume_hit',
    ready: rayVolumeHitReady,
    functionName: 'ray_volume_hit',
    combine: (modules) =>
        memo(`rvh:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `ray_volume_hit:${modules.map((m) => m.name).join('+')}`,
                requires: [rayVolumeTypes, ...modules],
                source: `fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit {
    var best = RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, false);
${modules
    .map(
        (_, k) => `    let h${k} = ray_volume_hit_${k}(origin, dir, best.t);
    if (h${k}.hit && h${k}.t < best.t) { best = h${k}; }`,
    )
    .join('\n')}
    return best;
}`,
            }),
        ),
};

/** Transmitância dos volumes: o produto dos contribuintes. */
export const rayVolumeTransmittancePoint: ContributionPoint = {
    name: 'ray_volume_transmittance',
    ready: rayVolumeTransmittanceReady,
    functionName: 'ray_volume_transmittance',
    combine: (modules) =>
        memo(`rvt:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `ray_volume_transmittance:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32) -> vec3f {
    return ${modules.map((_, k) => `ray_volume_transmittance_${k}(origin, dir, t_max)`).join(' * ')};
}`,
            }),
        ),
};

/** Meio dos volumes: o do primeiro contribuinte (os volumes da cena são de um tipo: o campo dos fluidos). */
export const rayVolumeMediumPoint: ContributionPoint = {
    name: 'ray_volume_medium',
    ready: rayVolumeMediumReady,
    functionName: 'ray_volume_medium',
    combine: (modules) =>
        memo(`rvm:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `ray_volume_medium:${modules.map((m) => m.name).join('+')}`,
                requires: [rayVolumeMediumType, ...modules],
                source: `fn ray_volume_medium(material: u32) -> RayVolumeMedium {
    return ray_volume_medium_0(material);
}`,
            }),
        ),
};

/** O acerto mais próximo entre os contribuintes de um ponto de volume com a assinatura de `ray_volume_hit`. */
function nearestVolumePoint(name: string, ready: WgslModule, inside: boolean): ContributionPoint {
    return {
        name,
        ready,
        functionName: name,
        combine: (modules) =>
            memo(`${name}:${modules.map((m) => m.name).join('+')}`, () =>
                wgslModule({
                    name: `${name}:${modules.map((m) => m.name).join('+')}`,
                    requires: [rayVolumeTypes, ...modules],
                    source: `fn ${name}(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit {
    var best = RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, ${inside});
${modules
    .map(
        (_, k) => `    let h${k} = ${name}_${k}(origin, dir, best.t);
    if (h${k}.hit && h${k}.t < best.t) { best = h${k}; }`,
    )
    .join('\n')}
    return best;
}`,
                }),
            ),
    };
}

/** Entrada nos volumes (origem fora): a mais próxima entre os contribuintes. */
export const rayVolumeEnterPoint = nearestVolumePoint(
    'ray_volume_enter',
    rayVolumeEnterReady,
    false,
);

/** Saída dos volumes (origem dentro): a mais próxima entre os contribuintes. */
export const rayVolumeExitPoint = nearestVolumePoint('ray_volume_exit', rayVolumeExitReady, true);
