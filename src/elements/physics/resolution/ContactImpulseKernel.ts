import type { vec3 } from 'gl-matrix';

/**
 * Geometria pré-computada de um eixo de impulso em um contato.
 *
 * Calculada por `ContactImpulseKernel.axis()` para uma direção (dx, dy, dz)
 * específica (normal ou tangente). Agrupa os vetores de torque e as massas
 * efetivas necessárias para calcular e aplicar o impulso correspondente.
 */
export interface ContactAxis {
    /** r_A × d — torque por unidade de impulso em A */
    rAxDx: number; rAxDy: number; rAxDz: number;
    /** r_B × d — torque por unidade de impulso em B */
    rBxDx: number; rBxDy: number; rBxDz: number;
    /** Contribuição angular de A na massa efetiva */
    angA: number;
    /** Contribuição angular de B na massa efetiva */
    angB: number;
    /**
     * Denominador da equação de impulso (soma das massas inversas efetivas):
     *   wSum = (dynA ? 1/mA + angA : 0) + (dynB ? 1/mB + angB : 0)
     *
     * Impulso escalar = numerador / wSum.
     */
    wSum: number;
}

/**
 * Núcleo matemático compartilhado entre os resolvers de colisão.
 *
 * Centraliza os cálculos de mecânica clássica repetidos entre
 * `ImpulseResolver`, `SequentialImpulseResolver` e os estágios PBD:
 *   - produto vetorial r × d (torque por unidade de impulso)
 *   - massa efetiva escalar por eixo de impulso
 *   - velocidade no ponto de contato (v_CM + ω × r)
 *   - aplicação de impulso escalar e vetorial
 *
 * Todos os métodos são estáticos e puros. Mutações ocorrem apenas nos
 * arrays `vel` / `omega` explicitamente passados como parâmetros.
 */
export class ContactImpulseKernel {

    /**
     * Pré-computa a geometria de contato para impulso ao longo de (dx, dy, dz).
     *
     * Passe `IA = null` / `IB = null` para excluir a contribuição angular do
     * corpo correspondente (equivalente a `angularCorrectionScale = 0` no PBD
     * ou à guarda `isMultiContact` no SI).
     */
    static axis(
        rAx: number, rAy: number, rAz: number,
        rBx: number, rBy: number, rBz: number,
        dx:  number, dy:  number, dz:  number,
        invMA: number, invMB: number,
        dynA: boolean, dynB: boolean,
        IA: vec3 | null | undefined, IB: vec3 | null | undefined,
    ): ContactAxis {
        const rAxDx = rAy * dz - rAz * dy;
        const rAxDy = rAz * dx - rAx * dz;
        const rAxDz = rAx * dy - rAy * dx;
        const rBxDx = rBy * dz - rBz * dy;
        const rBxDy = rBz * dx - rBx * dz;
        const rBxDz = rBx * dy - rBy * dx;

        const angA = IA
            ? rAxDx * rAxDx / Math.max(IA[0]!, 1e-6)
            + rAxDy * rAxDy / Math.max(IA[1]!, 1e-6)
            + rAxDz * rAxDz / Math.max(IA[2]!, 1e-6) : 0;
        const angB = IB
            ? rBxDx * rBxDx / Math.max(IB[0]!, 1e-6)
            + rBxDy * rBxDy / Math.max(IB[1]!, 1e-6)
            + rBxDz * rBxDz / Math.max(IB[2]!, 1e-6) : 0;

        const wSum = (dynA ? invMA + angA : 0) + (dynB ? invMB + angB : 0);
        return { rAxDx, rAxDy, rAxDz, rBxDx, rBxDy, rBxDz, angA, angB, wSum };
    }

    // ── Velocidade no ponto de contato: v_CM + ω × r ──────────────────────

    /** vcp_x = vx + ω_y · r_z − ω_z · r_y */
    static vcpX(vx: number, wy: number, wz: number, ry: number, rz: number): number {
        return vx + wy * rz - wz * ry;
    }

    /** vcp_y = vy + ω_z · r_x − ω_x · r_z */
    static vcpY(vy: number, wx: number, wz: number, rx: number, rz: number): number {
        return vy + wz * rx - wx * rz;
    }

    /** vcp_z = vz + ω_x · r_y − ω_y · r_x */
    static vcpZ(vz: number, wx: number, wy: number, rx: number, ry: number): number {
        return vz + wx * ry - wy * rx;
    }

    // ── Aplicação de impulso ───────────────────────────────────────────────

    /**
     * Aplica impulso escalar `sign · j` ao longo de (dx, dy, dz),
     * usando o braço de torque pré-computado (rdx, rdy, rdz) = r × d.
     *
     *   Δv = sign · j · invM · d
     *   Δω = sign · j · I⁻¹ · (r × d)
     *
     * Se `omega` ou `IA` forem null, somente a velocidade linear é modificada.
     */
    static applyScalar(
        vel:   vec3,
        omega: vec3 | null | undefined,
        IA:    vec3 | null | undefined,
        sign:  number,
        j:     number,
        dx: number, dy: number, dz: number,
        rdx: number, rdy: number, rdz: number,
        invM: number,
    ): void {
        vel[0] = (vel[0] ?? 0) + sign * j * invM * dx;
        vel[1] = (vel[1] ?? 0) + sign * j * invM * dy;
        vel[2] = (vel[2] ?? 0) + sign * j * invM * dz;
        if (omega && IA) {
            omega[0] = (omega[0] ?? 0) + sign * j * rdx / Math.max(IA[0]!, 1e-6);
            omega[1] = (omega[1] ?? 0) + sign * j * rdy / Math.max(IA[1]!, 1e-6);
            omega[2] = (omega[2] ?? 0) + sign * j * rdz / Math.max(IA[2]!, 1e-6);
        }
    }

    /**
     * Aplica impulso vetorial `sign · (jx, jy, jz)` com braço (rx, ry, rz).
     *
     *   Δv = sign · j · invM
     *   Δω = sign · I⁻¹ · (r × j)
     *
     * Usado pelo warm start do SI, onde o impulso acumulado (normal + tangente)
     * é armazenado como vetor combinado.
     */
    static applyVec(
        vel:   vec3,
        omega: vec3 | null | undefined,
        IA:    vec3 | null | undefined,
        sign:  number,
        jx: number, jy: number, jz: number,
        rx: number, ry: number, rz: number,
        invM: number,
    ): void {
        vel[0] = (vel[0] ?? 0) + sign * jx * invM;
        vel[1] = (vel[1] ?? 0) + sign * jy * invM;
        vel[2] = (vel[2] ?? 0) + sign * jz * invM;
        if (omega && IA) {
            omega[0] = (omega[0] ?? 0) + sign * (ry * jz - rz * jy) / Math.max(IA[0]!, 1e-6);
            omega[1] = (omega[1] ?? 0) + sign * (rz * jx - rx * jz) / Math.max(IA[1]!, 1e-6);
            omega[2] = (omega[2] ?? 0) + sign * (rx * jy - ry * jx) / Math.max(IA[2]!, 1e-6);
        }
    }

    /**
     * μ combinado: √(μ_A · μ_B) se ambos > 0, max(μ_A, μ_B) caso contrário.
     *
     * Convenção padrão de motores físicos para combinar coeficientes de atrito
     * de dois materiais. O max() preserva atrito quando apenas um corpo
     * declara `friction`.
     */
    static combineMu(muA: number, muB: number): number {
        return muA > 0 && muB > 0 ? Math.sqrt(muA * muB) : Math.max(muA, muB);
    }
}
