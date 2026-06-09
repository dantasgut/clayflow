import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Transform } from '../../scene/Transform';
import { BoxCollider } from '../colliders/BoxCollider';
import { SphereCollider } from '../colliders/SphereCollider';
import { LCPSchema } from './schemas/LCPSchema';
import { PhysicsBody } from './PhysicsBody';

/**
 * Forma associada a um RigidBody dinâmico, em vocabulário de domínio.
 * `sphere` → raio; `box` → half-extents. Determina `body_shape` (struct GPU)
 * e o colisor anexado automaticamente.
 */
export type RigidBodyShape =
    | { readonly shape: 'sphere'; readonly radius: number }
    | { readonly shape: 'box'; readonly halfExtents: readonly [number, number, number] };

/**
 * Opções de domínio do RigidBody dinâmico — vocabulário de física (massa,
 * atrito, restituição, damping, forma). O layout do struct GPU (`pos.w` =
 * inv_mass, `mat_props`, `body_shape`, `I_inv`) é derivado internamente.
 */
export type RigidBodyDomainOptions = RigidBodyShape & {
    /** Massa em kg (> 0). 0 ou ausente ⇒ corpo cinemático (inv_mass = 0). */
    readonly mass?: number;
    /** Coeficiente de atrito (default 0.5). */
    readonly friction?: number;
    /** Restituição / "quique" (default 0.2). */
    readonly restitution?: number;
    /** Amortecimento linear por substep (default 0.05). */
    readonly linearDamping?: number;
    /** Amortecimento angular por substep (default 0.05). */
    readonly angularDamping?: number;
    /** Posição inicial (mundo). Default [0,0,0]. */
    readonly position?: readonly [number, number, number];
    /** Orientação inicial (quaternion xyzw). Default [0,0,0,1]. */
    readonly rotation?: readonly [number, number, number, number];
};

/**
 * Opções cruas (avançado) — fornece `schema` + `data` diretamente, como antes.
 * Mantida para retrocompatibilidade e tuning de baixo nível.
 */
export interface RigidBodyRawOptions {
    readonly schema: StructSchema;
    readonly data?: Record<string, unknown>;
}

/** União pública aceita pelo construtor do RigidBody. */
export type RigidBodyOptions = RigidBodyDomainOptions | RigidBodyRawOptions;

function isRaw(options: RigidBodyOptions): options is RigidBodyRawOptions {
    return 'schema' in options;
}

// ── Helpers de setup co-localizados (puros; fonte única do layout do struct) ──
// Referência do struct: src/elements/gpu/wgsl/structs/rigid_body.wgsl
//   pos.w     = inv_mass (0 = cinemático)
//   mat_props = (x=restitution, y=friction, z=lin_damping, w=ang_damping)
//   body_shape= (x=shape_type [0=Sphere,1=Box], yzw=half_extents)
//   I_inv.xyz = diagonal do tensor de inércia inverso

const SHAPE_SPHERE = 0;
const SHAPE_BOX = 1;

/** mass → inv_mass (0 para massa nula/ausente ⇒ cinemático). */
export function invMassOf(mass: number | undefined): number {
    return mass !== undefined && mass > 0 ? 1 / mass : 0;
}

/** mat_props na ordem canônica do struct WGSL. */
export function packMatProps(o: {
    restitution?: number;
    friction?: number;
    linearDamping?: number;
    angularDamping?: number;
}): [number, number, number, number] {
    return [
        o.restitution ?? 0.2,
        o.friction ?? 0.5,
        o.linearDamping ?? 0.05,
        o.angularDamping ?? 0.05,
    ];
}

/** Forma → body_shape vec4 (shape_type + half_extents). */
export function packBodyShape(shape: RigidBodyShape): [number, number, number, number] {
    if (shape.shape === 'sphere') {
        return [SHAPE_SPHERE, shape.radius, shape.radius, shape.radius];
    }
    const [hx, hy, hz] = shape.halfExtents;
    return [SHAPE_BOX, hx, hy, hz];
}

/**
 * Diagonal do tensor de inércia inverso (setup-time), derivada de massa+forma.
 * Esfera sólida: I = 2/5·m·r². Caixa sólida (half-extents h): Ix = 1/3·m·(hy²+hz²).
 * Corpo cinemático (mass ≤ 0) ⇒ [0,0,0,0].
 */
export function inertiaInv(
    mass: number | undefined,
    shape: RigidBodyShape,
): [number, number, number, number] {
    if (mass === undefined || mass <= 0) return [0, 0, 0, 0];
    if (shape.shape === 'sphere') {
        const i = (2 / 5) * mass * shape.radius * shape.radius;
        const inv = i > 0 ? 1 / i : 0;
        return [inv, inv, inv, 0];
    }
    const [hx, hy, hz] = shape.halfExtents;
    const ix = (1 / 3) * mass * (hy * hy + hz * hz);
    const iy = (1 / 3) * mass * (hx * hx + hz * hz);
    const iz = (1 / 3) * mass * (hx * hx + hy * hy);
    return [ix > 0 ? 1 / ix : 0, iy > 0 ? 1 / iy : 0, iz > 0 ? 1 / iz : 0, 0];
}

function validateDomain(o: RigidBodyDomainOptions): void {
    if (o.mass !== undefined && o.mass < 0) {
        throw new Error('RigidBody: massa deve ser ≥ 0');
    }
    if (o.shape === 'sphere' && !(o.radius > 0)) {
        throw new Error('RigidBody: radius deve ser > 0');
    }
    if (o.shape === 'box' && !o.halfExtents.every((h) => h > 0)) {
        throw new Error('RigidBody: halfExtents devem ser > 0');
    }
}

/** Constrói o `data` do LCPSchema a partir das opções de domínio. */
function buildLcpData(o: RigidBodyDomainOptions): Record<string, unknown> {
    const [px, py, pz] = o.position ?? [0, 0, 0];
    const rot = o.rotation ?? [0, 0, 0, 1];
    return {
        pos: [px, py, pz, invMassOf(o.mass)],
        rot: [...rot],
        rot_pred: [...rot],
        I_inv: inertiaInv(o.mass, o),
        mat_props: packMatProps(o),
        body_shape: packBodyShape(o),
    };
}

/** Colisor coerente com a forma do body (anexado automaticamente — FR-008). */
function colliderFor(o: RigidBodyShape): BoxCollider | SphereCollider {
    if (o.shape === 'sphere') {
        return new SphereCollider({ radius: o.radius, center: [0, 0, 0, 1] });
    }
    const [hx, hy, hz] = o.halfExtents;
    return new BoxCollider({ halfExtents: [hx, hy, hz, 0], center: [0, 0, 0, 1] });
}

/**
 * RigidBody — corpo rígido 6-DOF (3 translation + 3 rotation). Data class
 * pura: armazena estado serializável governado pelo `schema`. O integrador
 * (LCPFlow) é selecionado pelo schema (pool key = `schema.name`).
 *
 * Dois modos de construção:
 *  - **Domínio** (recomendado): `new RigidBody({ shape:'sphere', radius, mass, friction, … })`.
 *    Deriva `pos.w`/`mat_props`/`body_shape`/`I_inv` (setup-time), anexa o colisor
 *    coerente e um `Transform` inicial. Vocabulário de física, sem layout de buffer.
 *  - **Cru** (avançado): `new RigidBody({ schema, data })` — controle total do struct.
 */
export class RigidBody extends PhysicsBody {
    private readonly schema: StructSchema;

    constructor(options: RigidBodyOptions) {
        super();
        if (isRaw(options)) {
            this.schema = options.schema;
            this.data = this.schema.applyDefaults(options.data ?? {});
            return;
        }
        validateDomain(options);
        this.schema = LCPSchema;
        this.data = this.schema.applyDefaults(buildLcpData(options));
        // Fonte única de transform: a mesma `position` alimenta pos e Transform.
        const [px, py, pz] = options.position ?? [0, 0, 0];
        const rot = options.rotation ?? [0, 0, 0, 1];
        this.add(new Transform({ position: [px, py, pz, 1], rotation: [...rot] }));
        this.add(colliderFor(options));
    }

    /** Pool storage para coalescer N RigidBodies do mesmo schema em 1 buffer GPU. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'body',
                role: 'storage-rw',
                schema: this.schema,
                storage: 'pool',
            },
        ];
    }
}
