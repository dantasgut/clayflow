import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import type { ContributionPoint } from '../../scene/shaders/WgslPoint';
import { closure } from '../material/pbr/shaders';
import { materialPointTypes } from '../material/point/types/shaders';
import { StandardMaterialSchema } from '../material/StandardMaterialSchema';

// Pontos de cena dos volumes atravessados por raios (spec 033, R11): quem traça raios (as sondas e a tela da luz
// rebatida, a refração recalculada, os fótons) chama estas funções sem conhecer quem as implementa — hoje o campo dos
// fluidos (`FluidField`); sem contribuinte, fica o pronto (nenhum volume). As superfícies opacas continuam na estrutura
// de raios (`ray_scene_hit`); os volumes são transmissivos: o raio os atravessa. O material no acerto
// (`ray_volume_surface`, spec 034 T065d) é do contribuinte que acertou (`source`): a referência da função `material`
// nas funções da estrutura de raios (a mesma das malhas: quem traça a grava na onda dos acertos e o kernel da classe a
// avalia, spec 039) e o meio do corpo (o fechamento dele avaliado uma vez por quadro, que a absorção dos trechos lê:
// `ray_volume_closure`, módulo `rayVolumeMaterial`).

/**
 * Acerto de um raio na superfície de um volume: distância, ponto, normal (para fora), o material no contribuinte, lado
 * da origem, o contribuinte (`source`, a ordem dele no ponto: escrito pela combinação) e se a superfície mudou desde o
 * quadro anterior (`moved`: quem acumula o que os raios veem encurta o histórico por ela, como pelas instâncias que se
 * moveram).
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
    moved: bool,
    /**
     * Alcance do contato com os sólidos (m): o volume não resolve a superfície dele encostada num sólido abaixo disso
     * (o campo dos fluidos: o espaçamento das partículas) — a saída dele a menos disso antes de uma malha é o contato.
     */
    contact: f32,
}

/**
 * O material num acerto de volume: o índice da função \`material\` na composição dos acertos (0 = nenhuma: vale
 * \`closure\`), o slot dos parâmetros dela e o fechamento pronto do contribuinte quando não há função.
 */
struct RayVolumeSurface {
    index: u32,
    slot: u32,
    closure: Closure,
}`,
    requires: [closure],
});

/**
 * `fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32, side: i32) -> RayVolumeHit` — o cruzamento mais próximo do
 * raio (direção unitária) com a superfície de um volume até `t_max` (entrando, ou saindo quando a origem está dentro);
 * `side`: o lado da origem quando quem chama o sabe (0 fora, 1 dentro: a partida de uma superfície que ele acabou de
 * cruzar ou em que refletiu — a superfície de partida não é reacertada), −1 quando não; pronto: sem acerto.
 */
export const rayVolumeHitReady = wgslModule({
    name: 'ray_volume_hit_ready',
    requires: [rayVolumeTypes],
    source: `fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32, side: i32) -> RayVolumeHit {
    return RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, false, 0u, false, 0.0);
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

/** O ponto sorteado no trecho de um raio dentro dos meios que espalham (`ray_volume_scatter`). */
export const rayVolumeScatterTypes = wgslModule({
    name: 'ray_volume_scatter_types',
    source: `/**
 * Uma amostra do espalhamento no trecho de um raio: o ponto, o peso (a transmitância da origem até ele × o coeficiente
 * de espalhamento nele × o comprimento do trecho — a luz que chega ao ponto vezes a fase e o peso é a estimativa da luz
 * espalhada para a origem ao longo do trecho), o albedo e a anisotropia do meio nele. Peso 0: nada espalha.
 */
struct RayVolumeScatter {
    position: vec3f,
    weight: vec3f,
    albedo: f32,
    anisotropy: f32,
}`,
});

/**
 * \`fn ray_volume_scatter(origin: vec3f, dir: vec3f, t_max: f32, u: f32) -> RayVolumeScatter\` — uma amostra do
 * espalhamento dos meios participantes no segmento (spec 034, T058), no ponto \`u · t_max\` (\`u\` uniforme em [0, 1)):
 * quem transporta luz por raios soma a das fontes que chega ao ponto e a luz que o meio devolve; pronto: peso 0.
 */
export const rayVolumeScatterReady = wgslModule({
    name: 'ray_volume_scatter_ready',
    requires: [rayVolumeScatterTypes],
    source: `fn ray_volume_scatter(origin: vec3f, dir: vec3f, t_max: f32, u: f32) -> RayVolumeScatter {
    return RayVolumeScatter(origin, vec3f(0.0), 0.0, 0.0);
}`,
});

/**
 * `fn ray_volume_surface(hit: RayVolumeHit) -> RayVolumeSurface` — o material da superfície do volume no acerto `hit`;
 * pronto: nenhum (sem volume não há acerto).
 */
export const rayVolumeSurfaceReady = wgslModule({
    name: 'ray_volume_surface_ready',
    requires: [rayVolumeTypes, closure],
    source: `fn ray_volume_surface(hit: RayVolumeHit) -> RayVolumeSurface {
    return RayVolumeSurface(0u, 0u, closure_zero());
}`,
});

/**
 * `fn ray_volume_bounds() -> array<vec3f, 2>` — a caixa em mundo que contém os volumes atravessados por raios (spec 034,
 * T067c: os alvos dos fótons das cáusticas); pronto: vazia (lo ≥ hi).
 */
export const rayVolumeBoundsReady = wgslModule({
    name: 'ray_volume_bounds_ready',
    source: `fn ray_volume_bounds() -> array<vec3f, 2> {
    return array<vec3f, 2>(vec3f(1.0), vec3f(-1.0));
}`,
});

/**
 * `fn ray_volume_occupied(origin: vec3f, dir: vec3f, t_max: f32) -> bool` — o raio passa por onde um volume pode ter
 * superfície (spec 034, T067c: a emissão dos fótons das cáusticas descarta os que não passam por nenhum; conservador —
 * verdadeiro na dúvida); pronto: falso (sem volume).
 */
export const rayVolumeOccupiedReady = wgslModule({
    name: 'ray_volume_occupied_ready',
    source: `fn ray_volume_occupied(origin: vec3f, dir: vec3f, t_max: f32) -> bool {
    return false;
}`,
});

/**
 * `fn ray_volume_begin()` — o começo do trabalho de um raio (spec 039 refeita): quem traça o chama antes de cada raio de
 * um laço em passo de grade (uma invocação traça vários), e cada volume renova o próprio orçamento de passos — o teto é
 * por raio, não dividido entre os raios da invocação; pronto: nada.
 */
export const rayVolumeBeginReady = wgslModule({
    name: 'ray_volume_begin_ready',
    source: `fn ray_volume_begin() {
}`,
});

/**
 * `fn ray_volume_light(light: u32, p: vec3f) -> vec3f` — a fração da luz `light` que atravessa os volumes (só eles, sem a
 * atmosfera nem os meios) em linha reta até `p` (spec 039 refeita: as cáusticas sabem se a reta da luz cruzou água sem
 * marchar); pronto: 1.
 */
export const rayVolumeLightReady = wgslModule({
    name: 'ray_volume_light_ready',
    source: `fn ray_volume_light(light: u32, p: vec3f) -> vec3f {
    return vec3f(1.0);
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
                source: `fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32, side: i32) -> RayVolumeHit {
    var best = RayVolumeHit(t_max, origin + dir * t_max, -dir, 0u, false, false, 0u, false, 0.0);
${modules
    .map(
        (_, k) => `    let h${k} = ray_volume_hit_${k}(origin, dir, best.t, side);
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

/** Caixa dos volumes: a que contém as dos contribuintes (as vazias de fora). */
export const rayVolumeBoundsPoint: ContributionPoint = {
    name: 'ray_volume_bounds',
    ready: rayVolumeBoundsReady,
    functionName: 'ray_volume_bounds',
    combine: (modules) =>
        memo(`rvb:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `ray_volume_bounds:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn ray_volume_bounds() -> array<vec3f, 2> {
    var lo = vec3f(1e30);
    var hi = vec3f(-1e30);
${modules
    .map(
        (_, k) => `    let b${k} = ray_volume_bounds_${k}();
    if (all(b${k}[0] < b${k}[1])) {
        lo = min(lo, b${k}[0]);
        hi = max(hi, b${k}[1]);
    }`,
    )
    .join('\n')}
    return array<vec3f, 2>(lo, hi);
}`,
            }),
        ),
};

/** A luz pelos volumes: o produto dos contribuintes. */
export const rayVolumeLightPoint: ContributionPoint = {
    name: 'ray_volume_light',
    ready: rayVolumeLightReady,
    functionName: 'ray_volume_light',
    combine: (modules) =>
        memo(`rvl:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `ray_volume_light:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn ray_volume_light(light: u32, p: vec3f) -> vec3f {
    return ${modules.map((_, k) => `ray_volume_light_${k}(light, p)`).join(' * ')};
}`,
            }),
        ),
};

/** O começo do trabalho de um raio: o de cada contribuinte. */
export const rayVolumeBeginPoint: ContributionPoint = {
    name: 'ray_volume_begin',
    ready: rayVolumeBeginReady,
    functionName: 'ray_volume_begin',
    combine: (modules) =>
        memo(`rvbg:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `ray_volume_begin:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn ray_volume_begin() {
${modules.map((_, k) => `    ray_volume_begin_${k}();`).join('\n')}
}`,
            }),
        ),
};

/** Ocupação dos volumes ao longo do raio: a de algum contribuinte. */
export const rayVolumeOccupiedPoint: ContributionPoint = {
    name: 'ray_volume_occupied',
    ready: rayVolumeOccupiedReady,
    functionName: 'ray_volume_occupied',
    combine: (modules) =>
        memo(`rvo:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `ray_volume_occupied:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn ray_volume_occupied(origin: vec3f, dir: vec3f, t_max: f32) -> bool {
    return ${modules.map((_, k) => `ray_volume_occupied_${k}(origin, dir, t_max)`).join(' || ')};
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

/** Espalhamento dos meios: o do primeiro contribuinte (os meios participantes são um recurso só, os `Froxels`). */
export const rayVolumeScatterPoint: ContributionPoint = {
    name: 'ray_volume_scatter',
    ready: rayVolumeScatterReady,
    functionName: 'ray_volume_scatter',
    combine: (modules) =>
        memo(`rvs:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `ray_volume_scatter:${modules.map((m) => m.name).join('+')}`,
                requires: [rayVolumeScatterTypes, ...modules],
                source: `fn ray_volume_scatter(origin: vec3f, dir: vec3f, t_max: f32, u: f32) -> RayVolumeScatter {
    return ray_volume_scatter_0(origin, dir, t_max, u);
}`,
            }),
        ),
};

/**
 * Material no acerto de um volume: o do contribuinte que acertou (`hit.source`, a mesma ordem da combinação do
 * `ray_volume_hit` — os dois pontos recebem os contribuintes na ordem deles).
 */
export const rayVolumeSurfacePoint: ContributionPoint = {
    name: 'ray_volume_surface',
    ready: rayVolumeSurfaceReady,
    functionName: 'ray_volume_surface',
    combine: (modules) =>
        memo(`rvs:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `ray_volume_surface:${modules.map((m) => m.name).join('+')}`,
                requires: [rayVolumeTypes, closure, ...modules],
                source: `fn ray_volume_surface(hit: RayVolumeHit) -> RayVolumeSurface {
    switch (hit.source) {
${modules.map((_, k) => `        case ${k}u: { return ray_volume_surface_${k}(hit); }`).join('\n')}
        default: { return RayVolumeSurface(0u, 0u, closure_zero()); }
    }
}`,
            }),
        ),
};

/**
 * O material de um acerto de volume avaliado: a amostra de superfície do acerto (\`ray_volume_sample\`: o ponto, a
 * normal e o tempo; sem uv nem geometria diferencial), as constantes padrão do \`StandardMaterial\` (o volume não tem
 * material de desenho, \`ray_volume_standard\`) e \`ray_volume_closure(hit, time)\` — a função pela composição dos
 * acertos ou o fechamento pronto do contribuinte.
 */
export const rayVolumeMaterial = wgslModule({
    name: 'ray_volume_material',
    requires: [rayVolumeTypes, rayVolumeSurfaceReady, materialPointTypes, closure],
    structs: [StandardMaterialSchema],
    source: `/** A amostra de superfície no acerto de volume \`hit\` no tempo simulado \`time\`. */
fn ray_volume_sample(hit: RayVolumeHit, time: f32) -> SurfaceSample {
    return SurfaceSample(hit.position, hit.normal, vec2f(0.0), time, vec3f(0.0), vec4f(0.0), vec3f(0.0), 0.0,
        vec2f(0.0), vec2f(0.0));
}

/** As constantes do material de um volume: as padrão do \`StandardMaterial\`. */
fn ray_volume_standard() -> StandardMaterial {
    return StandardMaterial(vec4f(1.0), 0.5, 0.0, 0.0, 0.0);
}

/**
 * O fechamento do meio no acerto de volume \`hit\` com o material \`s\` dele: o do contribuinte (o do corpo, avaliado
 * fora da marcha pela onda dos acertos, spec 039) — sem avaliar material aqui.
 */
fn ray_volume_surface_closure(hit: RayVolumeHit, s: RayVolumeSurface, time: f32) -> Closure {
    return s.closure;
}

/** O fechamento no acerto de volume \`hit\` no tempo simulado \`time\`. */
fn ray_volume_closure(hit: RayVolumeHit, time: f32) -> Closure {
    return ray_volume_surface_closure(hit, ray_volume_surface(hit), time);
}`,
});
