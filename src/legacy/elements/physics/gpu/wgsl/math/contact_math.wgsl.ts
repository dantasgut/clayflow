/**
 * Módulo WGSL: matemática pura de contato.
 *
 * Funções reutilizáveis entre pipelines SI, XPBD e LCP.
 * Sem dependência de structs de buffer.
 *
 * Depende de: nenhum outro módulo.
 */
export const WGSL_CONTACT_MATH = /* wgsl */`

// ── contact_math.wgsl ────────────────────────────────────────────────────────
// Matemática pura de contato — sem dependência de structs de buffer.
// Reusável entre pipelines SI, XPBD e LCP.

/// Retorna vetor tangente ortogonal a n, numericamente estável (Frisvad 1/√3).
/// O threshold 1/√3 garante norma pré-normalização ≥ √(2/3) ≈ 0.816 em ambos os ramos.
fn tangent_orthogonal(n: vec3f) -> vec3f {
    if (abs(n.x) > 0.57735f) {
        return normalize(vec3f(n.y, -n.x, 0.0f));
    }
    return normalize(vec3f(0.0f, n.z, -n.y));
}

/// Calcula delta_lambda unificado para XPBD (alpha > 0) e LCP/PGS (alpha = 0).
///
/// Chamador passa:
///   XPBD:  numerator = -C           (violação posicional, metros)
///   LCP:   numerator = -(j_v + bias) (velocidade relativa + bias de Baumgarte, pré-somados)
///
/// Retorna delta_lambda sem projeção Signorini — responsabilidade do chamador.
/// Guard max(denom, 1e-10) preserva comportamento do LCP (não usar 1e-12).
fn delta_lambda_compliance(numerator: f32, eff_mass: f32, alpha: f32, h: f32) -> f32 {
    let denom = eff_mass + alpha / (h * h);
    return numerator / max(denom, 1e-10f);
}
`;
