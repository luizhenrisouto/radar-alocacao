/** Imprime o acerto do matching da Nexo contra o gabarito (gabarito entre os 3 primeiros). */
import { gerarNexo, GABARITO_NEXO } from "../src/demo/nexo";
import { avaliarMatching } from "../src/regras/avaliacao";
import { hojeSaoPaulo } from "../src/regras/datas";

const hoje = hojeSaoPaulo();
const { acertos, total } = avaliarMatching(gerarNexo(hoje), GABARITO_NEXO, hoje);
console.log(`Acerto do matching: ${acertos}/${total} (${Math.round((acertos / total) * 100)}%)`);
