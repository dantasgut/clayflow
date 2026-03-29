import { WebGPURenderer }    from './presentation/renderers/WebGPURenderer';
import { Scene }             from './scene/core/Scene';
import { Mesh }              from './scene/objects/Mesh';
import { PerspectiveCamera } from './elements/cameras/PerspectiveCamera';
import { BoxGeometry }       from './elements/geometry/BoxGeometry';
import { StandardMaterial }  from './elements/materials/StandardMaterial';
import { FEMBoxGeometry }    from './elements/geometry/FEMBoxGeometry';
import { FEMBody }           from './elements/physics/FEMBody';
import { boxToFEMBody }      from './elements/physics/fem/boxToFEMBody';
import { RigidBody }         from './elements/physics/RigidBody';
import { BoxShape }          from './elements/physics/shapes/BoxShape';
import { createGpuPhysicsWorld } from './elements/physics/createGpuPhysicsWorld';
import { ConstantForce }     from './elements/physics/forces/ConstantForce';
import { vec3 }              from 'gl-matrix';
import { DirectionalLight, AmbientLight } from './scene/lights/Light';

// ── Parâmetros da gelatina ────────────────────────────────────────────────────
// Gelatina real: E ≈ 0.5–10 kPa, ν ≈ 0.45 (quase incompressível)
// Para XPBD-FEM: valores menores são mais estáveis; usamos E ≈ 1.5 kPa
const GELATIN_E      = 1500;          // Módulo de Young (Pa)
const GELATIN_NU     = 0.45;          // Coeficiente de Poisson
const GELATIN_MU     = GELATIN_E / (2 * (1 + GELATIN_NU));             // ≈ 517 Pa
const GELATIN_LAMBDA = GELATIN_E * GELATIN_NU / ((1 + GELATIN_NU) * (1 - 2 * GELATIN_NU)); // ≈ 3103 Pa
const GELATIN_MASS   = 4.0;           // kg
const GELATIN_DAMP   = 0.04;          // amortecimento
const GELATIN_CRAD   = 0.04;          // raio de colisão (m) para contato com o chão

// ── Dimensões da plataforma ────────────────────────────────────────────────────
const GEL_W = 3.0;   // largura
const GEL_H = 0.6;   // altura
const GEL_D = 2.0;   // profundidade
// Resolução da malha FEM
const GEL_CX = 6;    // células em X
const GEL_CY = 2;    // células em Y (1–2 basta para plataforma fina)
const GEL_CZ = 4;    // células em Z

async function init(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
    canvas.width  = window.innerWidth  * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;

    // ── Mundo de física com FEM habilitado ────────────────────────────────────
    const world = createGpuPhysicsWorld({
        substeps: 6,
        fem: {
            substeps:   8,
            iterations: 10,
        },
    });
    world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));

    // ── Renderer ──────────────────────────────────────────────────────────────
    const scene  = new Scene();
    const camera = new PerspectiveCamera(Math.PI / 4, canvas.width / canvas.height, 0.1, 500);
    camera.position[0] = 0;
    camera.position[1] = 1.5;
    camera.position[2] = 7;
    scene.add(camera);

    const renderer = new WebGPURenderer(world);
    await renderer.initialize(canvas);
    renderer.setClearColor(0.08, 0.08, 0.12, 1.0);

    window.addEventListener('resize', () => {
        canvas.width  = window.innerWidth  * window.devicePixelRatio;
        canvas.height = window.innerHeight * window.devicePixelRatio;
        renderer.setSize(canvas.width, canvas.height);
    });

    // ── Iluminação ────────────────────────────────────────────────────────────
    const ambient = new AmbientLight([1, 1, 1], 0.35);
    scene.add(ambient);

    const sun = new DirectionalLight([1, 0.95, 0.85], 0.9);
    vec3.normalize(sun.direction, vec3.fromValues(-0.5, -1.0, -0.3));
    scene.add(sun);

    // ── Chão estático ─────────────────────────────────────────────────────────
    // RigidBody kinematic + BoxShape → registrado como ColliderDesc para FEM collision
    const floorW = 5.0, floorH = 0.2, floorD = 3.5;
    const floor = new Mesh(
        new BoxGeometry(floorW, floorH, floorD),
        new StandardMaterial({ color: [0.25, 0.25, 0.3, 1.0], roughness: 0.8 }),
    );
    floor.position[1] = -floorH * 0.5;  // superfície superior em y=0
    floor.addPhysics(
        new RigidBody({ isKinematic: true })
    ).add(new BoxShape(floorW * 0.5, floorH * 0.5, floorD * 0.5));
    scene.add(floor);

    // ── Plataforma de gelatina (FEM) ──────────────────────────────────────────
    // Posicionada em y ≈ 1.5 para cair sobre o chão e revelar a deformação
    const gelY = GEL_H + 1.2;   // base do bloco em gelY, cai até y=0

    const gelGeo = new FEMBoxGeometry(GEL_W, GEL_H, GEL_D, GEL_CX, GEL_CY, GEL_CZ,
        0,      // offsetX — centrado em X
        gelY,   // offsetY — base inferior em gelY
        0,      // offsetZ — centrado em Z
    );

    const gelMat = new StandardMaterial({
        color:     [0.15, 0.45, 1.0, 1.0],   // azul gelatin
        roughness: 0.3,
        metallic:  0.0,
    });

    const gelMesh = new Mesh(gelGeo, gelMat);
    // Mesh position é gerenciada pelo FEM — manter em origem (FEMBoxGeometry já aplica offset)

    // Cria o FEMBody com parâmetros de gelatina
    const gelBody = new FEMBody({
        mass:            GELATIN_MASS,
        mu:              GELATIN_MU,
        lambda:          GELATIN_LAMBDA,
        damping:         GELATIN_DAMP,
        collisionRadius: GELATIN_CRAD,
        restitution:     0.05,
    });

    // Popula nós e elementos a partir do tessellador
    const { nodes, elements } = boxToFEMBody(
        GEL_W, GEL_H, GEL_D,
        GEL_CX, GEL_CY, GEL_CZ,
        { offsetX: 0, offsetY: gelY, offsetZ: 0, pinnedBottom: false },
    );
    gelBody.nodes    = nodes;
    gelBody.elements = elements;

    gelMesh.addPhysics(gelBody);
    scene.add(gelMesh);

    // ── Conecta cena ao mundo de física ────────────────────────────────────────
    world.connectScene(scene);

    console.log(
        `[Gelatin Demo] FEM mesh: ${nodes.length} nós, ${elements.length} tetraedros | ` +
        `μ=${GELATIN_MU.toFixed(0)} Pa λ=${GELATIN_LAMBDA.toFixed(0)} Pa`,
    );

    // ── Game loop ─────────────────────────────────────────────────────────────
    const tick = async (): Promise<void> => {
        await renderer.render(scene, camera);
        requestAnimationFrame(tick);
    };

    tick();
}

init().catch(console.error);
