import {
    BoxCollider,
    ParametricSurface,
    SurfaceCollider,
    SurfaceFunction,
    DirectionalLight,
    FluidBody,
    GravityField,
    MaterialFunction,
    NodeGraph,
    ParticlePhysics,
    PlaneGeometry,
    PointSpriteMaterial,
    StandardMaterial,
    Transform,
    nodes,
} from 'clayflow';
import type { SceneImplementation } from '../../core/types';
import type { ClayflowHandle } from '../../engines/clayflow';
import { blockOf, blockPositions, TANK_HALF } from './scene';

/** Vale do chão da variante `*-terrain` (u = z, v = x: normal para cima). */
const VALLEY_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f(v, 0.3 * (u * u + v * v) / (data.r * data.r) - 0.3, u);
}`;

/**
 * Um `FluidBody` SPH (um corpo, N partículas numa faixa do pool) num tanque de colisores estáticos (sem corpo rígido:
 * o solver de corpos rígidos não entra na cena), desenhado pelo `ParticleFlow` em sprites que leem a posição direto do
 * pool — sem leitura de volta nem cópia por quadro (spec 008). Nas variantes `*-water`, o mesmo corpo com a aparência
 * de água pelo grafo (spec 034, T066: superfície contínua pelo campo dos fluidos, traçada com refração e absorção) sob
 * uma luz direcional com sombra, sobre um fundo visível — spec 017.
 */
/** A água pelo grafo: o dielétrico de índice 1,333 com a transmissão e a absorção da água por metro (a cor a 1 m). */
function waterAppearance(): MaterialFunction {
    return new MaterialFunction({
        graph: new NodeGraph({
            nodes: {
                reflect: nodes.bsdf.dielectric.with({ ior: 1.333, roughness: 0.02 }),
                transmit: nodes.bsdf.transmission.with({
                    ior: 1.333,
                    abbe: 55.7,
                    color: [Math.exp(-0.45), Math.exp(-0.09), Math.exp(-0.06)],
                    depth: 1,
                }),
                water: nodes.closure.add,
                out: nodes.output.closure,
            },
            links: [
                ['reflect.value', 'water.a'],
                ['transmit.value', 'water.b'],
                ['water.value', 'out.closure'],
            ],
            output: 'out.value',
        }),
    });
}

const impl: SceneImplementation<ClayflowHandle> = {
    limitations: [
        'render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)',
        'variantes *-water: o Three desenha as mesmas esferas (sem superfície de água): referência, não paridade',
        'variante *-terrain: o Three desenha as mesmas esferas sobre o tanque (sem terreno colidível): referência',
    ],
    setup({ engine, variant, rng }) {
        const world = engine.app.world;
        const count = Number(variant.params.count);
        const water = variant.params.water === true;
        const { spacing } = blockOf(count);
        world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
        const cohesion = variant.params.cohesion === true;
        world.insert(
            new ParticlePhysics({
                particleSpacing: spacing,
                ...(cohesion
                    ? {
                          cohesion: ParticlePhysics.WATER_COHESION,
                          adhesion: ParticlePhysics.WATER_ADHESION,
                      }
                    : {}),
            }),
        );
        const t = 0.1;
        if (variant.params.terrain === true) {
            // Vale y = 0,3·(x² + z²)/r² − 0,3 no lugar do chão: o fluido escorre para o centro (spec 010).
            const h = TANK_HALF + t;
            world.insert(
                new ParametricSurface({ domain: [-h, h, -h, h], resolution: [128, 128] })
                    .add(
                        new SurfaceFunction({
                            code: VALLEY_CODE,
                            params: { r: 'f32' },
                            values: { r: TANK_HALF },
                        }),
                    )
                    .add(new SurfaceCollider({ mode: 'height' }))
                    .add(new StandardMaterial({ albedo: [0.75, 0.7, 0.6, 1] }))
                    .add(new Transform()),
            );
        } else
            world.insert(new BoxCollider({ halfExtents: [2, 0.5, 2, 0], center: [0, -0.5, 0, 1] }));
        for (const [x, z, hx, hz] of [
            [TANK_HALF + t, 0, t, TANK_HALF + 2 * t],
            [-(TANK_HALF + t), 0, t, TANK_HALF + 2 * t],
            [0, TANK_HALF + t, TANK_HALF, t],
            [0, -(TANK_HALF + t), TANK_HALF, t],
        ] as const) {
            world.insert(new BoxCollider({ halfExtents: [hx, 1, hz, 0], center: [x, 0.8, z, 1] }));
        }
        if (water) {
            world.insert(
                new DirectionalLight({
                    direction: [-0.25, -1, -0.35, 0],
                    intensity: 1.2,
                    castShadow: true,
                }),
            );
            const floor = new PlaneGeometry({ size: [2 * TANK_HALF, 2 * TANK_HALF] });
            floor.add(new StandardMaterial({ albedo: [0.85, 0.85, 0.8, 1] }));
            floor.add(new Transform());
            world.insert(floor);
        }
        world.insert(
            new FluidBody({ algorithm: 'SPH', position: blockPositions(rng, count) }).add(
                water
                    ? waterAppearance()
                    : new PointSpriteMaterial({ color: [0.2, 0.5, 1, 1], radius: spacing * 0.5 }),
            ),
        );
    },
};

export default impl;
