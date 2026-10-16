// Ordenação radix (RadixSort, research R9), passo 3 de cada passe: espalhamento estável. Dentro do grupo de 256, o
// dígito de 4 bits é ordenado por quatro divisões estáveis por bit (soma de prefixos de flags em memória de
// workgroup); o posto de cada elemento entre os do mesmo dígito no grupo vai somado à base global (dígito, grupo) do
// histograma escaneado. Sem atômicos na saída: determinístico. Duas entradas: só chaves, e chaves com valores.

var<workgroup> radix_digit_wg: array<u32, 256>;
var<workgroup> radix_src_wg:   array<u32, 256>;
var<workgroup> radix_scan_wg:  array<u32, 256>;
var<workgroup> radix_start_wg: array<u32, 16>;

// Destino na saída do elemento que ficou na posição local `li` após a ordenação do grupo (`dest.x`), com o índice
// de origem (`dest.y`); `dest.x = NONE` para posições sem elemento (cauda do último grupo).
fn radix_local_sort(i: u32, li: u32, group: u32) -> vec2u {
    let n = radix_count();
    // Fora do domínio: chave máxima, índice ≥ n — ficam no fim (são as últimas posições do último grupo).
    var key = NONE;
    if (i < n) { key = keys_in[i]; }
    var digit = (key >> radix.shift) & 15u;
    if (i >= n) { digit = 15u; }
    var src = i;

    for (var bit = 0u; bit < 4u; bit++) {
        let zero = 1u - ((digit >> bit) & 1u);
        radix_scan_wg[li] = zero;
        workgroupBarrier();
        for (var offset = 1u; offset < 256u; offset <<= 1u) {
            var acc = radix_scan_wg[li];
            if (li >= offset) { acc += radix_scan_wg[li - offset]; }
            workgroupBarrier();
            radix_scan_wg[li] = acc;
            workgroupBarrier();
        }
        let zeros_before = radix_scan_wg[li] - zero;
        let total_zeros  = radix_scan_wg[255];
        let pos = select(total_zeros + (li - zeros_before), zeros_before, zero == 1u);
        workgroupBarrier();
        radix_digit_wg[pos] = digit;
        radix_src_wg[pos]  = src;
        workgroupBarrier();
        digit = radix_digit_wg[li];
        src   = radix_src_wg[li];
        workgroupBarrier();
    }

    // Início de cada dígito no grupo ordenado: a primeira posição em que ele aparece.
    if (li < 16u) { radix_start_wg[li] = NONE; }
    workgroupBarrier();
    if (li == 0u || radix_digit_wg[li - 1u] != digit) { radix_start_wg[digit] = li; }
    workgroupBarrier();

    if (src >= n) { return vec2u(NONE, src); }
    let base = hist[digit * radix.groups + group];
    return vec2u(base + (li - radix_start_wg[digit]), src);
}

@compute @workgroup_size(256)
fn radix_scatter_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(local_invocation_id)  lid:  vec3u,
    @builtin(workgroup_id)         wgid: vec3u,
    @builtin(num_workgroups)       nwg:  vec3u,
) {
    let i    = gid3.x + gid3.y * nwg.x * 256u;
    let dest = radix_local_sort(i, lid.x, wgid.x + wgid.y * nwg.x);
    if (dest.x != NONE) { keys_out[dest.x] = keys_in[dest.y]; }
}

@compute @workgroup_size(256)
fn radix_scatter_kv_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(local_invocation_id)  lid:  vec3u,
    @builtin(workgroup_id)         wgid: vec3u,
    @builtin(num_workgroups)       nwg:  vec3u,
) {
    let i    = gid3.x + gid3.y * nwg.x * 256u;
    let dest = radix_local_sort(i, lid.x, wgid.x + wgid.y * nwg.x);
    if (dest.x != NONE) {
        keys_out[dest.x]   = keys_in[dest.y];
        values_out[dest.x] = values_in[dest.y];
    }
}
