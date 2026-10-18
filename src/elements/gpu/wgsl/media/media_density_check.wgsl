// Kernel de validação do ponto `fog_density` (spec 033, R12): chama `density_fn` com o carregador — uma
// `DensityFunction` é conferida contra ele na criação. Não é despachado.
// Requer: o ponto `fog_density`; fog_density_check_out.

@compute @workgroup_size(1)
fn fog_density_check_main() {
    let p = fog_density_check_out[0].xyz;
    fog_density_check_out[1] = vec4f(density_fn(p, fog_density_check_out[0].w, density_fn_params(0u)));
}
