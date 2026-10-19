// Fim do quadro da refração traçada (spec 034, US7): a vista-projeção da câmera ativa no cabeçalho do histórico, para a
// reprojeção do quadro seguinte (`gi_refraction.wgsl`).
// Requer: gi, cameras, gi_refraction_history.

@compute @workgroup_size(1)
fn gi_refraction_finish_main() {
    let cam = cameras[gi.screen.w];
    for (var c = 0u; c < 4u; c++) { gi_refraction_history[c] = cam.viewProjection[c]; }
}
