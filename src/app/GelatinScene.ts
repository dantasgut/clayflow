/**
 * GelatinScene — cena de corpo gelatinoso via pipeline XPBD-FEM.
 *
 * ## Contratos padronizados
 *
 * `DeformableMaterialConfig`  — propriedades físicas Neo-Hookean (contratos de material)
 * `FEMMeshConfig`             — geometria e resolução da malha volumétrica
 * `FloorConfig`               — configuração do chão estático
 * `GelatinSceneConfig`        — contrato completo de configuração da cena
 *
 * ## Presets de material
 *
 *   `GELATIN_SOFT`    — gelatina muito macia (E ≈ 300 Pa) — oscila livremente
 *   `GELATIN_MEDIUM`  — gelatina padrão     (E ≈ 1500 Pa) — comportamento padrão
 *   `GELATIN_FIRM`    — jelly firme          (E ≈ 6000 Pa) — deforma mas resiste
 *
 * ## Uso mínimo
 *
 * ```typescript
 * const world = createGpuPhysicsWorld({ fem: { substeps: 8 } });
 * world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));
 *
 * const renderer = new WebGPURenderer(world);
 * await renderer.initialize(canvas);
 *
 * const scene = new Scene();
 * const camera = new PerspectiveCamera(...);
 * scene.add(camera);
 *
 * buildGelatinScene(scene, GELATIN_MEDIUM);
 * world.connectScene(scene);
 * ```
 *
 * ## Nota arquitetural: FEM é um SoftBody?
 *
 * Conceitualmente sim — FEM (Finite Element Method) e XPBD SoftBody são ambos
 * métodos de simulação de *corpos deformáveis*:
 *   - SoftBody XPBD: superfície/constraint-based, partículas + aresta constraints
 *   - FEMBody:       volumétrico, tetraedros + mecânica do contínuo (Neo-Hookean)
 *
 * Ambos estendem `PhysicsBody`. Uma abstração `DeformableBody` como base comum
 * seria o passo arquitetural natural, mas está fora do escopo deste módulo.
 */

import { Mesh }              from '../scene/objects/Mesh';
import { Scene }             from '../scene/core/Scene';
import { BoxGeometry }       from '../elements/geometry/BoxGeometry';
import { FEMBoxGeometry }    from '../elements/geometry/FEMBoxGeometry';
import { StandardMaterial }  from '../elements/materials/StandardMaterial';
import { FEMBody }           from '../elements/physics/FEMBody';
import { boxToFEMBody }      from '../elements/physics/fem/boxToFEMBody';
import { RigidBody }         from '../elements/physics/RigidBody';
import { BoxShape }          from '../elements/physics/shapes/BoxShape';
import { AmbientLight, DirectionalLight } from '../scene/lights/Light';
import { vec3 }              from 'gl-matrix';

// ══════════════════════════════════════════════════════════════════════════════
// Contratos padronizados
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parâmetros físicos de um material deformável Neo-Hookean.
 *
 * μ e λ de Lamé são derivados internamente:
 *   μ = E / (2*(1+ν))
 *   λ = E*ν / ((1+ν)*(1−2*ν))
 */
export interface DeformableMaterialConfig {
    /** Módulo de Young E (Pa). Controla rigidez geral. Gelatina: 300–10000 Pa. */
    youngsModulus:    number;
    /**
     * Coeficiente de Poisson ν ∈ [0, 0.5).
     * Próximo de 0.5 = quase incompressível (gelatina, borracha).
     * 0.3 = sólido elástico genérico.
     */
    poissonsRatio:    number;
    /** Massa total do corpo (kg). */
    mass:             number;
    /** Coeficiente de amortecimento viscoso [0, 1]. Maior = para mais rápido. */
    damping:          number;
    /**
     * Raio de colisão por nó (m).
     * Expande a margem de contato com colliders SDF.
     * Default: 0.03.
     */
    collisionRadius?: number;
    /** Coeficiente de restituição [0, 1]. Default: 0.02 (gelatina não quica). */
    restitution?:     number;
}

/**
 * Configuração geométrica e visual da malha FEM volumétrica.
 *
 * Nós = (cellsX+1)×(cellsY+1)×(cellsZ+1).
 * Tetraedros = cellsX×cellsY×cellsZ×6.
 */
export interface FEMMeshConfig {
    /** Extensão em X (m). */
    width:     number;
    /** Extensão em Y (m). */
    height:    number;
    /** Extensão em Z (m). */
    depth:     number;
    /** Células em X. Maior = mais resolução, mais custo. */
    cellsX:    number;
    /** Células em Y. */
    cellsY:    number;
    /** Células em Z. */
    cellsZ:    number;
    /** Cor RGBA do material visual. */
    color:     [number, number, number, number];
    /** Rugosidade superficial [0, 1]. Default: 0.3. */
    roughness?: number;
}

/** Configuração do chão estático (RigidBody kinematic). */
export interface FloorConfig {
    width:   number;
    height:  number;
    depth:   number;
    /** Cor RGBA. Default: cinza escuro. */
    color?:  [number, number, number, number];
}

/** Contrato completo de configuração da cena de gelatina. */
export interface GelatinSceneConfig {
    /** Material físico Neo-Hookean do corpo deformável. */
    material:       DeformableMaterialConfig;
    /** Geometria e aparência da malha FEM. */
    mesh:           FEMMeshConfig;
    /** Configuração do chão estático. */
    floor?:         FloorConfig;
    /**
     * Coordenada Y da base inferior do bloco ao início da simulação (m).
     * O bloco cai até y=0 (superfície do chão).
     * Default: mesh.height + 1.5
     */
    dropHeight?:    number;
    /**
     * Se `true`, pina os nós da face inferior (iy=0) — invMass=0.
     * O bloco fica ancorado na posição inicial; apenas a parte superior deforma.
     * Default: false.
     */
    pinnedBottom?:  boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// Presets de material
// ══════════════════════════════════════════════════════════════════════════════

const _DEFAULT_NU = 0.45;   // Poisson ratio para materiais tipo gelatina/gel

/** Gelatina muito macia (E ≈ 300 Pa) — oscila livremente, como panna cotta. */
export const GELATIN_SOFT: GelatinSceneConfig = {
    material: {
        youngsModulus:   300,
        poissonsRatio:   _DEFAULT_NU,
        mass:            3.0,
        damping:         0.05,
        collisionRadius: 0.03,
        restitution:     0.02,
    },
    mesh: {
        width: 3.0, height: 0.6, depth: 2.0,
        cellsX: 6, cellsY: 2, cellsZ: 4,
        color: [0.2, 0.6, 1.0, 1.0],
        roughness: 0.25,
    },
};

/** Gelatina padrão (E ≈ 1500 Pa) — comportamento clássico de gelatina de sobremesa. */
export const GELATIN_MEDIUM: GelatinSceneConfig = {
    material: {
        youngsModulus:   1500,
        poissonsRatio:   _DEFAULT_NU,
        mass:            4.0,
        damping:         0.04,
        collisionRadius: 0.03,
        restitution:     0.02,
    },
    mesh: {
        width: 3.0, height: 0.6, depth: 2.0,
        cellsX: 6, cellsY: 2, cellsZ: 4,
        color: [0.15, 0.45, 1.0, 1.0],
        roughness: 0.3,
    },
};

/** Jelly firme (E ≈ 6000 Pa) — deforma visivelmente mas resiste mais. */
export const GELATIN_FIRM: GelatinSceneConfig = {
    material: {
        youngsModulus:   6000,
        poissonsRatio:   _DEFAULT_NU,
        mass:            5.0,
        damping:         0.03,
        collisionRadius: 0.02,
        restitution:     0.03,
    },
    mesh: {
        width: 3.0, height: 0.6, depth: 2.0,
        cellsX: 6, cellsY: 2, cellsZ: 4,
        color: [0.1, 0.35, 0.9, 1.0],
        roughness: 0.35,
    },
};

// ══════════════════════════════════════════════════════════════════════════════
// Scene builder
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Constrói e adiciona à cena os objetos de uma simulação de gelatina FEM.
 *
 * Adiciona:
 *   - Luzes (AmbientLight + DirectionalLight)
 *   - Chão estático (RigidBody kinematic + BoxShape)
 *   - Bloco de gelatina (FEMBody + FEMBoxGeometry)
 *
 * @param scene  cena alvo
 * @param config contrato de configuração (use um dos presets ou defina o seu)
 * @returns o Mesh da gelatina (para manipulação posterior)
 */
export function buildGelatinScene(scene: Scene, config: GelatinSceneConfig): Mesh {
    const { material, mesh: mCfg, floor: fCfg, pinnedBottom = false } = config;

    // ── Derivação de parâmetros Lamé a partir de E e ν ────────────────────────
    const E  = material.youngsModulus;
    const nu = material.poissonsRatio;
    const mu     = E / (2 * (1 + nu));
    const lambda = E * nu / ((1 + nu) * (1 - 2 * nu));

    // ── Iluminação ────────────────────────────────────────────────────────────
    const ambient = new AmbientLight([1, 1, 1], 0.35);
    scene.add(ambient);

    const sun = new DirectionalLight([1, 0.95, 0.85], 0.9);
    vec3.normalize(sun.direction, vec3.fromValues(-0.5, -1.0, -0.3));
    scene.add(sun);

    // ── Chão estático ─────────────────────────────────────────────────────────
    const fw = fCfg?.width  ?? mCfg.width  + 2.0;
    const fh = fCfg?.height ?? 0.25;
    const fd = fCfg?.depth  ?? mCfg.depth  + 1.5;
    const fc = fCfg?.color  ?? [0.22, 0.22, 0.28, 1.0] as [number, number, number, number];

    const floor = new Mesh(
        new BoxGeometry(fw, fh, fd),
        new StandardMaterial({ color: fc, roughness: 0.75 }),
    );
    floor.position[1] = -fh * 0.5;   // superfície superior em y = 0
    floor.addPhysics(new RigidBody({ isKinematic: true }))
         .add(new BoxShape(fw * 0.5, fh * 0.5, fd * 0.5));
    scene.add(floor);

    // ── Bloco de gelatina (FEMBody) ───────────────────────────────────────────
    const gelY = config.dropHeight ?? (mCfg.height + 1.5);

    const gelGeo = new FEMBoxGeometry(
        mCfg.width, mCfg.height, mCfg.depth,
        mCfg.cellsX, mCfg.cellsY, mCfg.cellsZ,
        0,     // offsetX — centrado em X
        gelY,  // offsetY — base inferior em gelY
        0,     // offsetZ — centrado em Z
    );

    const gelMesh = new Mesh(
        gelGeo,
        new StandardMaterial({
            color:     mCfg.color,
            roughness: mCfg.roughness ?? 0.3,
        }),
    );

    const gelBody = new FEMBody({
        mass:            material.mass,
        mu,
        lambda,
        damping:         material.damping,
        collisionRadius: material.collisionRadius ?? 0.03,
        restitution:     material.restitution     ?? 0.02,
    });

    const { nodes, elements } = boxToFEMBody(
        mCfg.width, mCfg.height, mCfg.depth,
        mCfg.cellsX, mCfg.cellsY, mCfg.cellsZ,
        { offsetX: 0, offsetY: gelY, offsetZ: 0, pinnedBottom },
    );
    gelBody.nodes    = nodes;
    gelBody.elements = elements;

    gelMesh.addPhysics(gelBody);
    scene.add(gelMesh);

    const nodeCount = nodes.length;
    const tetCount  = elements.length;
    console.info(
        `[GelatinScene] E=${E} Pa  ν=${nu}  μ=${mu.toFixed(0)} Pa  λ=${lambda.toFixed(0)} Pa\n` +
        `              nós=${nodeCount}  tets=${tetCount}  células=${mCfg.cellsX}×${mCfg.cellsY}×${mCfg.cellsZ}`,
    );

    return gelMesh;
}
