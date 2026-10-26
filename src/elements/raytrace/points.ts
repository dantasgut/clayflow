import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import type { ContributionPoint } from '../../scene/shaders/WgslPoint';
import { closure } from '../material/pbr/shaders';

// Pontos de cena dos volumes atravessados por raios (spec 033, R11): quem traça raios (as sondas e a tela da luz
// rebatida, a refração recalculada, os fótons) chama estas funções sem conhecer quem as implementa — hoje o campo dos
// fluidos (`FluidField`); sem contribuinte, fica o pronto (nenhum volume). As superfícies opacas continuam na estrutura
// de raios (`ray_scene_hit`); os volumes são transmissivos: o raio os atravessa. O fechamento no acerto
// (`ray_volume_closure`, spec 034 T065d) é do contribuinte que acertou (`source`), pela composição das funções
// `material` dos acertos (`ray_hit_material`, a mesma das malhas: quem traça a liga com `bindPoints`).

/**
 * Acerto de um raio na superfície de um volume: distância, ponto, normal (para fora), o material no contribuinte, lado
 * da origem e o contribuinte (`source`, a ordem dele no ponto: escrito pela combinação).
 */
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
    source: u32,
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
    return RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, false, 0u);
}`,
});

/**
 * `fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32, time: f32) -> vec3f` — a fração da luz que
 * atravessa os volumes no segmento (absorção pelo trecho dentro de cada um; `time`, o tempo simulado das funções
 * `material`); pronto: 1.
 */
export const rayVolumeTransmittanceReady = wgslModule({
    name: 'ray_volume_transmittance_ready',
    source: `fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32, time: f32) -> vec3f {
    return vec3f(1.0);
}`,
});

/**
 * `fn ray_volume_closure(hit: RayVolumeHit, time: f32) -> Closure` — o fechamento da superfície do volume no acerto
 * `hit` (no tempo simulado `time`); pronto: nenhum (sem volume não há acerto).
 */
export const rayVolumeClosureReady = wgslModule({
    name: 'ray_volume_closure_ready',
    requires: [rayVolumeTypes, closure],
    source: `fn ray_volume_closure(hit: RayVolumeHit, time: f32) -> Closure {
    return closure_zero();
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
    var best = RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, false, 0u);
${modules
    .map(
        (_, k) => `    let h${k} = ray_volume_hit_${k}(origin, dir, best.t);
    if (h${k}.hit && h${k}.t < best.t) {
        best = h${k};
        best.source = ${k}u;
    }`,
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
                source: `fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32, time: f32) -> vec3f {
    return ${modules.map((_, k) => `ray_volume_transmittance_${k}(origin, dir, t_max, time)`).join(' * ')};
}`,
            }),
        ),
};

/**
 * Fechamento no acerto de um volume: o do contribuinte que acertou (`hit.source`, a mesma ordem da combinação do
 * `ray_volume_hit` — os dois pontos recebem os contribuintes na ordem deles).
 */
export const rayVolumeClosurePoint: ContributionPoint = {
    name: 'ray_volume_closure',
    ready: rayVolumeClosureReady,
    functionName: 'ray_volume_closure',
    combine: (modules) =>
        memo(`rvc:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `ray_volume_closure:${modules.map((m) => m.name).join('+')}`,
                requires: [rayVolumeTypes, closure, ...modules],
                source: `fn ray_volume_closure(hit: RayVolumeHit, time: f32) -> Closure {
    switch (hit.source) {
${modules.map((_, k) => `        case ${k}u: { return ray_volume_closure_${k}(hit, time); }`).join('\n')}
        default: { return closure_zero(); }
    }
}`,
            }),
        ),
};
