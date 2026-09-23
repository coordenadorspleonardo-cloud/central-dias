// ============================================================================
// Fechamento da Folha — módulo separado (não mexe no restante do index.html)
// Criado em 23/09/2026 a pedido do Leonardo, a partir de uma prévia que ele
// já tinha desenhado com o Claude em outra conversa (arquivo HTML isolado).
//
// Como funciona: dp.html chama initFechamento(ctx) uma vez, depois do login,
// passando as funções do Firestore que já estão importadas lá (não importamos
// o SDK de novo aqui, pra não criar uma segunda instância do app). Este
// arquivo cuida de tudo: injeta seu próprio <style>, desenha dentro de
// #fechRoot, escuta o Firestore em tempo real e trata os cliques.
// ============================================================================

const COLLECTION = "fechamento_tasks_dp";
const CONFIG_DOC = "fechamento_dp"; // dentro de /config/{id}, já coberto pela regra genérica

// ---- dados padrão (config de empresas/equipes) — só usados se ainda não existir config/fechamento_dp ----
const DEFAULT_CONFIG = {
  empresas: [
    { id: "amasp", nome: "AMASP", equipe: 1 },
    { id: "cias", nome: "Centro de Educação e Integração Social", equipe: 1 },
    { id: "construindo", nome: "Construindo Amanhã", equipe: 1 },
    { id: "cedap", nome: "CEDAP", equipe: 2 },
    { id: "casa", nome: "Casa da Criança Feliz", equipe: 2 },
    { id: "jardim", nome: "Jardim das Princesas", equipe: 2 }
  ],
  equipes: [
    { n: 1, nome: "Lívia e Stephanie", grupo: "Grupo AMASP" },
    { n: 2, nome: "Ryan e Henrique", grupo: "Grupo CEDAP" }
  ]
};

// ---- tarefas padrão da competência 09/2026 (semeadas automaticamente uma única vez) ----
const SEED_COMPETENCIA = "2026-09";
const SEED_TASKS = [
  { empresa: "amasp", ordem: 1000, texto: "Fazer a folha de Vale Transporte", tag: null },
  { empresa: "amasp", ordem: 2000, texto: "Lançar e conferir todos os atestados recebidos em setembro", tag: null },
  { empresa: "amasp", ordem: 3000, texto: "Lançar os atestados do fim de agosto que ainda não foram lançados", tag: null },
  { empresa: "amasp", ordem: 4000, texto: "Verificar se todas as transferências foram realizadas", tag: null },
  { empresa: "amasp", ordem: 5000, texto: "Verificar se todas as promoções e mudanças de função foram realizadas", tag: null },
  { empresa: "amasp", ordem: 6000, texto: "Verificar se todas as admissões recebidas no mês foram realizadas", tag: null },
  { empresa: "amasp", ordem: 7000, texto: "Verificar se as admissões entregaram carta de oposição ao desconto sindical (ou não)", tag: null },
  { empresa: "amasp", ordem: 8000, texto: "Verificar se todas as rescisões do mês foram realizadas", tag: null },
  { empresa: "amasp", ordem: 9000, texto: "Fazer o levantamento da planilha de empréstimo consignado", tag: null },
  { empresa: "amasp", ordem: 10000, texto: "Premiações pagas em agosto à diretora, à Nice e à cozinheira: confirmar se serão mantidas neste mês", tag: null },
  { empresa: "amasp", ordem: 11000, texto: "Efetuar o desconto, em duas parcelas, do valor pago a maior à colaboradora que pagamos indevidamente no mês anterior", tag: null },
  { empresa: "amasp", ordem: 12000, texto: "Verificar os afastamentos que não receberão na folha por ficarem afastadas durante setembro/2026", tag: null },
  { empresa: "amasp", ordem: 13000, texto: "Conferir se todas as colaboradoras com admissão, rescisão ou férias no mês estão dentro da folha de pagamento", tag: "geral" },
  { empresa: "amasp", ordem: 14000, texto: "Conferir se o imposto (IRRF/INSS) está sendo calculado normalmente para essas colaboradoras que entraram, saíram ou tiveram férias", tag: "geral" },

  { empresa: "cias", ordem: 1000, texto: "Verificar se todas as admissões foram realizadas e se estão no eSocial e se já foram enviados todos os contratos.", tag: null },
  { empresa: "cias", ordem: 2000, texto: "Conferir se todas as colaboradoras estão nas unidades corretas", tag: null },
  { empresa: "cias", ordem: 3000, texto: "Se faltar alguém, identificar se é por rescisão ou afastamento ou outro motivo e corrigir.", tag: null },
  { empresa: "cias", ordem: 4000, texto: "Comparar o relatório de colaboradoras ativas de cada unidade com a folha de agosto (mês 08), tem que estar identico com exceção de quem entrou e quem saiu no mês 09/2026.", tag: null },
  { empresa: "cias", ordem: 5000, texto: "Verificar se todas as rescisões foram realizadas", tag: null },
  { empresa: "cias", ordem: 6000, texto: "Verificar se as admissões entregaram carta de oposição sindical (ou não)", tag: null },
  { empresa: "cias", ordem: 7000, texto: "Verificar os atestados recebidos (se tivemos recebimento)", tag: null },
  { empresa: "cias", ordem: 8000, texto: "Verificar os casos de colaboradoras afastadas", tag: null },
  { empresa: "cias", ordem: 9000, texto: "Criar a planilha de empréstimo consignado", tag: null },
  { empresa: "cias", ordem: 10000, texto: "Separar as inconsistências recebidas de cada unidade para lançamento na folha", tag: null },
  { empresa: "cias", ordem: 11000, texto: "Criar a planilha de folha das unidades, com a quantidade correta de colaboradoras ativas em cada uma e pedir confirmação das diretoras (Mas antes de enviar as planilhas me sinalize e me mostre que serão realizadas algumas alterações nesta planilha).", tag: null },
  { empresa: "cias", ordem: 12000, texto: "Verificar promoções e transferências realizadas no mês ou mudanças de função.", tag: null },
  { empresa: "cias", ordem: 13000, texto: "Verificar lançamentos diferentes em agosto (ex.: convênio) e demais. Se houver convênio, pegar os valores direto com os responsáveis", tag: null },
  { empresa: "cias", ordem: 14000, texto: "Qualquer dúvida quanto aos lançamentos: informar a coordenação", tag: null },
  { empresa: "cias", ordem: 15000, texto: "Conferir se todas as colaboradoras com admissão, rescisão ou férias no mês estão dentro da folha de pagamento", tag: "geral" },
  { empresa: "cias", ordem: 16000, texto: "Conferir se o imposto (IRRF/INSS) está sendo calculado normalmente para essas colaboradoras que entraram, saíram ou tiveram férias", tag: "geral" },

  { empresa: "construindo", ordem: 1000, texto: "Verificar as admissões do mês", tag: null },
  { empresa: "construindo", ordem: 2000, texto: "Verificar se as admissões entregaram carta de oposição", tag: null },
  { empresa: "construindo", ordem: 3000, texto: "Verificar se todas as rescisões do mês foram feitas", tag: null },
  { empresa: "construindo", ordem: 4000, texto: "Verificar os atestados recebidos", tag: null },
  { empresa: "construindo", ordem: 5000, texto: "Verificar quem está afastada", tag: null },
  { empresa: "construindo", ordem: 6000, texto: "Verificar se recebemos alteração de função, promoção ou transferência", tag: null },
  { empresa: "construindo", ordem: 7000, texto: "Planilha do e-Consignado", tag: null },
  { empresa: "construindo", ordem: 8000, texto: "Verificar se há lançamento pendente do mês anterior para aplicar neste mês", tag: null },
  { empresa: "construindo", ordem: 9000, texto: "Enviar e solicitar à diretora Mari a planilha de folha com as informações", tag: null },
  { empresa: "construindo", ordem: 10000, texto: "Conferir se todas as colaboradoras com admissão, rescisão ou férias no mês estão dentro da folha de pagamento", tag: "geral" },
  { empresa: "construindo", ordem: 11000, texto: "Conferir se o imposto (IRRF/INSS) está sendo calculado normalmente para essas colaboradoras que entraram, saíram ou tiveram férias", tag: "geral" },

  { empresa: "cedap", ordem: 1000, texto: "Fazer a folha de Vale Transporte", tag: null },
  { empresa: "cedap", ordem: 2000, texto: "Conferir o recebimento de todos os atestados do mês", tag: null },
  { empresa: "cedap", ordem: 3000, texto: "Confirmar que todos os atestados recebidos estão na planilha de atestados e foram lançados", tag: null },
  { empresa: "cedap", ordem: 4000, texto: "Verificar se todas as admissões do mês foram feitas", tag: null },
  { empresa: "cedap", ordem: 5000, texto: "Verificar os atestados do fim de agosto", tag: null },
  { empresa: "cedap", ordem: 6000, texto: "Verificar quem são as colaboradoras afastadas", tag: null },
  { empresa: "cedap", ordem: 7000, texto: "Verificar promoções, transferências e mudanças de função", tag: null },
  { empresa: "cedap", ordem: 8000, texto: "Verificar se as admissões entregaram carta de oposição à contribuição assistencial", tag: null },
  { empresa: "cedap", ordem: 9000, texto: "Verificar se todas as rescisões do mês foram feitas", tag: null },
  { empresa: "cedap", ordem: 10000, texto: "Verificar as férias lançadas", tag: null },
  { empresa: "cedap", ordem: 11000, texto: "Verificar se teremos premiações para as diretoras", tag: null },
  { empresa: "cedap", ordem: 12000, texto: "Elaborar a planilha de consignado", tag: null },
  { empresa: "cedap", ordem: 13000, texto: "Conferir se todas as colaboradoras com admissão, rescisão ou férias no mês estão dentro da folha de pagamento", tag: "geral" },
  { empresa: "cedap", ordem: 14000, texto: "Conferir se o imposto (IRRF/INSS) está sendo calculado normalmente para essas colaboradoras que entraram, saíram ou tiveram férias", tag: "geral" },
  { empresa: "cedap", ordem: 15000, texto: "Iniciar o fechamento da folha", tag: null },

  { empresa: "casa", ordem: 1000, texto: "Verificar todas as admissões realizadas", tag: null },
  { empresa: "casa", ordem: 2000, texto: "Verificar se as admissões entregaram carta de oposição", tag: null },
  { empresa: "casa", ordem: 3000, texto: "Verificar todas as rescisões do mês", tag: null },
  { empresa: "casa", ordem: 4000, texto: "Verificar se tivemos férias no mês", tag: null },
  { empresa: "casa", ordem: 5000, texto: "Verificar se todos os atestados recebidos estão na planilha e foram lançados", tag: null },
  { empresa: "casa", ordem: 6000, texto: "Verificar quem são as colaboradoras afastadas", tag: null },
  { empresa: "casa", ordem: 7000, texto: "Verificar se houve promoção, transferência ou mudança de função", tag: null },
  { empresa: "casa", ordem: 8000, texto: "Verificar se há pendência do mês anterior para desconto neste mês", tag: null },
  { empresa: "casa", ordem: 9000, texto: "Conferir se todas as colaboradoras com admissão, rescisão ou férias no mês estão dentro da folha de pagamento", tag: "geral" },
  { empresa: "casa", ordem: 10000, texto: "Conferir se o imposto (IRRF/INSS) está sendo calculado normalmente para essas colaboradoras que entraram, saíram ou tiveram férias", tag: "geral" },

  { empresa: "jardim", ordem: 1000, texto: "Elaborar a planilha de consignado para desconto", tag: null },
  { empresa: "jardim", ordem: 2000, texto: "Verificar se todos os atestados recebidos estão na planilha de atestados e foram lançados", tag: null },
  { empresa: "jardim", ordem: 3000, texto: "Verificar afastamentos, inclusive os do fim de agosto", tag: null },
  { empresa: "jardim", ordem: 4000, texto: "Verificar as admissões do mês e se entregaram carta de oposição", tag: null },
  { empresa: "jardim", ordem: 5000, texto: "Verificar se todas as rescisões do mês foram realizadas", tag: null },
  { empresa: "jardim", ordem: 6000, texto: "Verificar se tivemos férias e se foram realizadas", tag: null },
  { empresa: "jardim", ordem: 7000, texto: "Verificar se temos premiações", tag: null },
  { empresa: "jardim", ordem: 8000, texto: "Implementar na folha o desconto do convênio academia (informado pela Rosa no WhatsApp)", tag: null },
  { empresa: "jardim", ordem: 9000, texto: "Verificar transferências, mudanças de função e promoções", tag: null },
  { empresa: "jardim", ordem: 10000, texto: "Conferir se todas as colaboradoras com admissão, rescisão ou férias no mês estão dentro da folha de pagamento", tag: "geral" },
  { empresa: "jardim", ordem: 11000, texto: "Conferir se o imposto (IRRF/INSS) está sendo calculado normalmente para essas colaboradoras que entraram, saíram ou tiveram férias", tag: "geral" }
];

const ORIENTACAO_TEXTO = `Além das tarefas listadas abaixo, acompanhem o processo de fechamento de acordo com o checklist da aba Processos da Central Dias. Isso não substitui as suas próprias anotações diárias sobre o que aconteceu durante o mês e foi programado para o lançamento de setembro. Qualquer informação que vocês tenham recebido e que esteja sob o seu controle deve ser acompanhada e realizada com base na aba Processos da Central Dias e neste checklist. Ele serve para conduzir o fechamento com mais transparência e para que nada seja esquecido.`;

// ---- estado do módulo ----
let ctx = null;
let mountEl = null;
let stylesInjected = false;
let unsubTasks = null;
let unsubConfig = null;
let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
let tasksRaw = [];
let competencia = currentYYYYMM();
let filterEquipe = "all";
let hideDone = false;
let confirmingDeleteId = null;
let copyingId = null;
let editingId = null;
let editingDraft = "";
// 24/09/2026: prazo por tarefa — seleção múltipla pra aplicar a mesma data em lote, e edição individual
let selectMode = false;
let selectedIds = new Set();
let editingPrazoId = null;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function currentYYYYMM() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function nextYYYYMM(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1); // m já é o mês seguinte em índice 0-based
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function prevYYYYMM(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function fmtCompetencia(ym) {
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const [y, m] = ym.split("-").map(Number);
  return `${MESES[m - 1]}/${y}`;
}
function fmtDT(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtPrazoShort(ymd) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}`;
}
// 24/09/2026: selo de urgência do prazo — mesmo padrão visual (Vencido/Vence hoje/Vence em N dias)
// já usado em Desligamentos/Certificados/Processos, reaproveitando as CSS vars globais --urg/--imp/--nor.
function prazoBadge(prazo, done) {
  if (!prazo) return "";
  if (done) return `<span class="fech-prazo fech-prazo-ok">📅 até ${esc(fmtPrazoShort(prazo))}</span>`;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(prazo + "T00:00:00");
  const diffDias = Math.round((alvo - hoje) / 86400000);
  let cls, txt;
  if (diffDias < 0) { cls = "urg"; txt = `Vencido — era ${fmtPrazoShort(prazo)}`; }
  else if (diffDias === 0) { cls = "imp"; txt = `Vence hoje`; }
  else if (diffDias <= 3) { cls = "imp"; txt = `Vence em ${diffDias}d (${fmtPrazoShort(prazo)})`; }
  else { cls = "nor"; txt = `Até ${fmtPrazoShort(prazo)}`; }
  return `<span class="fech-prazo fech-prazo-${cls}">📅 ${esc(txt)}</span>`;
}
function getCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem("cdFechColapsados") || "[]"));
  } catch (e) { return new Set(); }
}
function setCollapsed(set) {
  try { localStorage.setItem("cdFechColapsados", JSON.stringify([...set])); } catch (e) {}
}

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
#fechRoot{--fech-t1:#98A7F2;--fech-t2:#E3A858;display:flex;flex-direction:column;gap:16px;}
#fechRoot .fech-header{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;}
#fechRoot .fech-title{font-size:1.05rem;font-weight:700;color:var(--text);}
#fechRoot .fech-sub{font-size:.74rem;color:var(--text2);margin-top:2px;}
#fechRoot .fech-progwrap{display:flex;align-items:center;gap:10px;min-width:180px;}
#fechRoot .fech-monthinput{background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.78rem;padding:6px 9px;}
#fechRoot .fech-orient{background:var(--s2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:12px 14px;font-size:.76rem;color:var(--text2);line-height:1.55;}
#fechRoot .fech-orient b{color:var(--text);}
#fechRoot .fech-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
#fechRoot .fech-empty{font-size:.8rem;color:var(--text2);background:var(--s2);border:1px dashed var(--border2);border-radius:10px;padding:16px;text-align:center;}
#fechRoot .fech-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;}
@media (max-width:900px){#fechRoot .fech-cols{grid-template-columns:1fr;}}
#fechRoot .fech-col{display:flex;flex-direction:column;gap:12px;}
#fechRoot .fech-col-head{display:flex;align-items:baseline;gap:8px;padding:6px 2px;border-bottom:2px solid var(--tc);}
#fechRoot .fech-col-head .nome{font-weight:700;font-size:.86rem;color:var(--tc);}
#fechRoot .fech-col-head .grupo{font-size:.7rem;color:var(--text3);}
#fechRoot .fech-col-head .cnt{margin-left:auto;font-size:.7rem;color:var(--text2);font-variant-numeric:tabular-nums;}
#fechRoot .fech-card{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;}
#fechRoot .fech-card-head{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none;}
#fechRoot .fech-card-head:hover{background:var(--s2);}
#fechRoot .fech-card-head .car{transition:transform .15s;color:var(--text3);font-size:.7rem;}
#fechRoot .fech-card.collapsed .car{transform:rotate(-90deg);}
#fechRoot .fech-card-head .emp{font-weight:600;font-size:.82rem;color:var(--text);flex:1;}
#fechRoot .fech-card-head .cnt{font-size:.68rem;color:var(--text2);font-variant-numeric:tabular-nums;}
#fechRoot .fech-minibar{height:4px;background:var(--s3);border-radius:3px;overflow:hidden;margin:0 12px 10px;}
#fechRoot .fech-minibar-fill{height:100%;background:var(--nor);transition:width .3s;}
#fechRoot .fech-card-body{padding:0 12px 12px;}
#fechRoot .fech-card.collapsed .fech-minibar,#fechRoot .fech-card.collapsed .fech-card-body{display:none;}
#fechRoot .fech-task{display:flex;align-items:flex-start;gap:9px;padding:7px 4px;border-bottom:1px solid var(--border);}
#fechRoot .fech-task:last-child{border-bottom:none;}
#fechRoot .fech-task input[type=checkbox]{width:17px;height:17px;margin-top:2px;accent-color:var(--nor);cursor:pointer;flex-shrink:0;}
#fechRoot .fech-task-main{flex:1;min-width:0;}
#fechRoot .fech-task-txt{font-size:.79rem;color:var(--text);line-height:1.4;word-wrap:break-word;}
#fechRoot .fech-task.done .fech-task-txt{text-decoration:line-through;color:var(--text3);}
#fechRoot .fech-task-meta{font-size:.66rem;color:var(--text3);margin-top:2px;}
#fechRoot .fech-tag{display:inline-block;font-size:.6rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;background:rgba(200,169,110,.15);color:var(--accent);border-radius:99px;padding:1px 7px;margin-left:6px;vertical-align:middle;}
#fechRoot .fech-task-actions{display:flex;gap:3px;flex-shrink:0;align-items:center;}
#fechRoot .fech-ibtn{background:none;border:1px solid transparent;color:var(--text3);cursor:pointer;font-size:.72rem;padding:3px 5px;border-radius:6px;line-height:1;}
#fechRoot .fech-ibtn:hover{background:var(--s3);color:var(--text);border-color:var(--border2);}
#fechRoot .fech-renameinp{width:100%;background:var(--s3);border:1px solid var(--accent2);border-radius:6px;color:var(--text);font-family:inherit;font-size:.79rem;padding:4px 7px;}
#fechRoot .fech-copybox{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px;}
#fechRoot .fech-copybox select{background:var(--s3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:inherit;font-size:.72rem;padding:4px 6px;}
#fechRoot .fech-delbox{display:flex;gap:6px;align-items:center;font-size:.72rem;color:var(--urg);margin-top:4px;}
#fechRoot .fech-addrow{display:flex;gap:6px;margin-top:10px;}
#fechRoot .fech-addrow input{flex:1;background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.76rem;padding:7px 9px;}
#fechRoot .fech-btn{background:var(--s3);border:1px solid var(--border2);color:var(--text);font-family:inherit;font-size:.72rem;font-weight:600;padding:6px 11px;border-radius:7px;cursor:pointer;white-space:nowrap;}
#fechRoot .fech-btn:hover{background:var(--border2);}
#fechRoot .fech-btn.primary{background:var(--accent);border-color:var(--accent);color:#0f0f13;}
#fechRoot .fech-btn.on{background:var(--accent2);border-color:var(--accent2);color:#fff;}
#fechRoot .fech-chk{display:flex;align-items:center;gap:6px;font-size:.74rem;color:var(--text2);cursor:pointer;}
#fechRoot .fech-prazo{display:inline-block;font-size:.64rem;font-weight:600;border-radius:99px;padding:1px 8px;margin-left:6px;vertical-align:middle;white-space:nowrap;}
#fechRoot .fech-prazo-urg{background:color-mix(in srgb, var(--urg) 20%, transparent);color:var(--urg);}
#fechRoot .fech-prazo-imp{background:color-mix(in srgb, var(--imp) 20%, transparent);color:var(--imp);}
#fechRoot .fech-prazo-nor{background:color-mix(in srgb, var(--nor) 20%, transparent);color:var(--nor);}
#fechRoot .fech-prazo-ok{background:var(--s3);color:var(--text3);}
#fechRoot .fech-selchk{width:16px;height:16px;margin-top:2px;accent-color:var(--accent2);cursor:pointer;flex-shrink:0;}
#fechRoot .fech-bulkbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--s2);border:1px solid var(--accent2);border-radius:10px;padding:10px 12px;}
#fechRoot .fech-bulkbar .cnt{font-size:.76rem;color:var(--text);font-weight:600;}
#fechRoot .fech-bulkbar input[type=date]{background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.76rem;padding:6px 9px;}
#fechRoot .fech-prazoinp{background:var(--s3);border:1px solid var(--accent2);border-radius:6px;color:var(--text);font-family:inherit;font-size:.74rem;padding:4px 7px;}
`;
  document.head.appendChild(style);
}

// ---- Firestore helpers ----
async function ensureConfigSeeded() {
  const { db, doc, getDoc, setDoc } = ctx;
  try {
    const snap = await getDoc(doc(db, "config", CONFIG_DOC));
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.empresas) && data.empresas.length) config = data;
      return;
    }
  } catch (e) { /* leitura falhou — segue com o padrão em memória */ return; }
  if (ctx.getIsAdmin()) {
    try { await setDoc(doc(db, "config", CONFIG_DOC), DEFAULT_CONFIG); } catch (e) { /* sem permissão ou offline — ok, fica só em memória */ }
  }
}

async function ensureSeedTasks() {
  if (competencia !== SEED_COMPETENCIA) return;
  if (!ctx.getIsAdmin()) return;
  const { db, collection, query, where, getDocs, writeBatch, doc, serverTimestamp } = ctx;
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), where("competencia", "==", SEED_COMPETENCIA)));
    if (!snap.empty) return; // já existe, não duplica
  } catch (e) { return; }
  try {
    const batch = writeBatch(db);
    SEED_TASKS.forEach(t => {
      const ref = doc(collection(db, COLLECTION));
      batch.set(ref, {
        competencia: SEED_COMPETENCIA, company: t.empresa, text: t.texto, tag: t.tag || null,
        order: t.ordem, done: false, doneBy: null, doneByName: null, doneAt: null,
        createdAt: serverTimestamp(), createdBy: ctx.getUser()?.uid || null
      });
    });
    await batch.commit();
  } catch (e) { /* sem permissão — silencioso, admin pode tentar de novo depois */ }
}

function subscribeTasks() {
  if (unsubTasks) { unsubTasks(); unsubTasks = null; }
  const { db, collection, query, where, onSnapshot } = ctx;
  unsubTasks = onSnapshot(
    query(collection(db, COLLECTION), where("competencia", "==", competencia)),
    snap => { tasksRaw = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); },
    () => { tasksRaw = []; render(); }
  );
}

// ---- ações ----
async function toggleDone(id) {
  const t = tasksRaw.find(x => x.id === id); if (!t) return;
  const { db, doc, updateDoc, serverTimestamp } = ctx;
  const novo = !t.done;
  const user = ctx.getUser();
  try {
    await updateDoc(doc(db, COLLECTION, id), {
      done: novo,
      doneBy: novo ? (user?.uid || null) : null,
      doneByName: novo ? (ctx.getMembers().find(m => m.id === user?.uid)?.name || user?.displayName || user?.email || null) : null,
      doneAt: novo ? serverTimestamp() : null
    });
  } catch (e) {}
}

async function addTask(companyId, text) {
  const texto = (text || "").trim();
  if (!texto) return;
  const { db, collection, addDoc, serverTimestamp } = ctx;
  const maxOrder = Math.max(0, ...tasksRaw.filter(t => t.company === companyId).map(t => t.order || 0));
  try {
    await addDoc(collection(db, COLLECTION), {
      competencia, company: companyId, text: texto, tag: null, order: maxOrder + 1000,
      done: false, doneBy: null, doneByName: null, doneAt: null,
      createdAt: serverTimestamp(), createdBy: ctx.getUser()?.uid || null
    });
  } catch (e) { alert("Não foi possível criar a tarefa."); }
}

async function renameTask(id, novoTexto) {
  const texto = (novoTexto || "").trim();
  if (!texto) return;
  const { db, doc, updateDoc } = ctx;
  try { await updateDoc(doc(db, COLLECTION, id), { text: texto }); } catch (e) {}
}

async function deleteTask(id) {
  const { db, doc, deleteDoc } = ctx;
  try { await deleteDoc(doc(db, COLLECTION, id)); } catch (e) {}
}

async function reorder(id, dir) {
  const t = tasksRaw.find(x => x.id === id); if (!t) return;
  const irmaos = tasksRaw.filter(x => x.company === t.company).sort((a, b) => (a.order || 0) - (b.order || 0));
  const idx = irmaos.findIndex(x => x.id === id);
  const alvoIdx = idx + dir;
  if (alvoIdx < 0 || alvoIdx >= irmaos.length) return;
  const alvo = irmaos[alvoIdx];
  const { db, doc, updateDoc } = ctx;
  try {
    await Promise.all([
      updateDoc(doc(db, COLLECTION, t.id), { order: alvo.order }),
      updateDoc(doc(db, COLLECTION, alvo.id), { order: t.order })
    ]);
  } catch (e) {}
}

async function copyTask(id, destCompany) {
  const t = tasksRaw.find(x => x.id === id); if (!t) return;
  const { db, collection, addDoc, serverTimestamp } = ctx;
  const destinos = destCompany === "__all__" ? config.empresas.map(e => e.id).filter(e => e !== t.company) : [destCompany];
  try {
    for (const destId of destinos) {
      const maxOrder = Math.max(0, ...tasksRaw.filter(x => x.company === destId).map(x => x.order || 0));
      await addDoc(collection(db, COLLECTION), {
        competencia, company: destId, text: t.text, tag: t.tag || null, order: maxOrder + 1000,
        done: false, doneBy: null, doneByName: null, doneAt: null,
        createdAt: serverTimestamp(), createdBy: ctx.getUser()?.uid || null
      });
    }
  } catch (e) { alert("Não foi possível copiar a tarefa."); }
}

// 24/09/2026: prazo — edição individual (um único doc) e em lote (writeBatch, mesmo padrão já usado
// pra semear tarefas/copiar competência — evita N gravações separadas quando são várias tarefas de uma vez)
async function setPrazoSingle(id, prazoOuNull) {
  const { db, doc, updateDoc } = ctx;
  try { await updateDoc(doc(db, COLLECTION, id), { prazo: prazoOuNull || null }); } catch (e) {}
}

async function setPrazoBulk(ids, prazoOuNull) {
  if (!ids.length) return;
  const { db, doc, writeBatch } = ctx;
  try {
    const batch = writeBatch(db);
    ids.forEach(id => batch.update(doc(db, COLLECTION, id), { prazo: prazoOuNull || null }));
    await batch.commit();
  } catch (e) { alert("Não foi possível aplicar o prazo em todas as tarefas selecionadas."); }
}

async function copyFromCompetencia(origem) {
  const { db, collection, query, where, getDocs, writeBatch, doc, serverTimestamp } = ctx;
  let origemDocs = [];
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), where("competencia", "==", origem)));
    origemDocs = snap.docs.map(d => d.data());
  } catch (e) { alert("Não foi possível ler a competência anterior."); return; }
  if (!origemDocs.length) { alert(`Não encontrei tarefas em ${fmtCompetencia(origem)} pra copiar.`); return; }
  try {
    const batch = writeBatch(db);
    origemDocs.forEach(t => {
      const ref = doc(collection(db, COLLECTION));
      batch.set(ref, {
        competencia, company: t.company, text: t.text, tag: t.tag || null, order: t.order || 0,
        done: false, doneBy: null, doneByName: null, doneAt: null,
        createdAt: serverTimestamp(), createdBy: ctx.getUser()?.uid || null
      });
    });
    await batch.commit();
  } catch (e) { alert("Não foi possível copiar as tarefas."); }
}

// ---- render ----
function render() {
  if (!mountEl) return;
  ensureStyles();
  const isAdmin = ctx.getIsAdmin();
  const empresasVisiveis = filterEquipe === "all" ? config.empresas : config.empresas.filter(e => String(e.equipe) === String(filterEquipe));
  const total = tasksRaw.length;
  const done = tasksRaw.filter(t => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  let html = "";
  html += `<div class="fech-header">
    <div>
      <div class="fech-title">🧾 Fechamento da Folha</div>
      <div class="fech-sub">Departamento Pessoal · Competência
        <input type="month" class="fech-monthinput" data-action="change-competencia" value="${esc(competencia)}">
      </div>
    </div>
    <div class="fech-progwrap">
      <div class="prog-track" style="flex:1"><div class="prog-fill" style="width:${pct}%"></div></div>
      <span class="prog-pct">${pct}%</span>
      <span style="font-size:.68rem;color:var(--text2)">${done}/${total}</span>
    </div>
  </div>`;

  html += `<div class="fech-orient"><b>Orientação.</b> ${esc(ORIENTACAO_TEXTO)}</div>`;

  html += `<div class="fech-filters">
    <span class="filter-label">Equipe</span>
    <button class="fech-btn ${filterEquipe === "all" ? "on" : ""}" data-action="filter-equipe" data-val="all">Todas as equipes</button>
    ${config.equipes.map(eq => `<button class="fech-btn ${String(filterEquipe) === String(eq.n) ? "on" : ""}" data-action="filter-equipe" data-val="${eq.n}">${esc(eq.nome)}</button>`).join("")}
    <button class="fech-btn ${selectMode ? "on" : ""}" data-action="toggle-selectmode" style="margin-left:auto">🗓️ ${selectMode ? "Sair da seleção" : "Definir prazos em lote"}</button>
    <label class="fech-chk">
      <input type="checkbox" data-action="toggle-hide-done" ${hideDone ? "checked" : ""}> Ocultar concluídas
    </label>
  </div>`;

  if (selectMode) {
    html += `<div class="fech-bulkbar">
      <span class="cnt">${selectedIds.size} tarefa(s) selecionada(s)</span>
      <input type="date" id="fechBulkDate">
      <button class="fech-btn primary" data-action="bulk-apply-prazo">Aplicar prazo às selecionadas</button>
      <button class="fech-btn" data-action="bulk-clear-prazo">Remover prazo das selecionadas</button>
      <button class="fech-btn" data-action="select-clear">Limpar seleção</button>
      <span style="font-size:.66rem;color:var(--text2)">Marque as tarefas na lista abaixo (dentro de uma ou mais empresas), escolha a data e clique em Aplicar.</span>
    </div>`;
  }

  if (!total) {
    html += `<div class="fech-empty">Nenhuma tarefa cadastrada pra ${esc(fmtCompetencia(competencia))} ainda.`;
    // 24/09/2026: aberto pra qualquer colaborador do DP, não só Admin — mesmo pedido do Leonardo
    // que abriu criar/renomear/reordenar/copiar/excluir tarefa (ver renderTaskRow/renderCompanyCard).
    html += ` <button class="fech-btn primary" data-action="copy-prev" style="margin-top:8px">📋 Copiar tarefas de ${esc(fmtCompetencia(prevYYYYMM(competencia)))}</button>`;
    html += `</div>`;
  }

  html += `<div class="fech-cols">`;
  config.equipes.forEach(eq => {
    if (filterEquipe !== "all" && String(filterEquipe) !== String(eq.n)) return;
    const empresasDaEquipe = empresasVisiveis.filter(e => String(e.equipe) === String(eq.n));
    const tarefasDaEquipe = tasksRaw.filter(t => empresasDaEquipe.some(e => e.id === t.company));
    const doneEquipe = tarefasDaEquipe.filter(t => t.done).length;
    const tc = eq.n === 1 || String(eq.n) === "1" ? "var(--fech-t1)" : "var(--fech-t2)";
    html += `<div class="fech-col">
      <div class="fech-col-head" style="--tc:${tc}">
        <span class="nome">${esc(eq.nome)}</span>
        <span class="grupo">${esc(eq.grupo || "")}</span>
        <span class="cnt">${doneEquipe}/${tarefasDaEquipe.length}</span>
      </div>`;
    empresasDaEquipe.forEach(emp => {
      html += renderCompanyCard(emp, isAdmin);
    });
    html += `</div>`;
  });
  html += `</div>`;

  mountEl.innerHTML = html;
}

function renderCompanyCard(emp, isAdmin) {
  const collapsed = getCollapsed().has(emp.id);
  let tarefas = tasksRaw.filter(t => t.company === emp.id).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (hideDone) tarefas = tarefas.filter(t => !t.done);
  const totalReal = tasksRaw.filter(t => t.company === emp.id).length;
  const doneReal = tasksRaw.filter(t => t.company === emp.id && t.done).length;
  const pct = totalReal ? Math.round((doneReal / totalReal) * 100) : 0;

  let html = `<div class="fech-card ${collapsed ? "collapsed" : ""}" data-company="${esc(emp.id)}">
    <div class="fech-card-head" data-action="toggle-collapse" data-val="${esc(emp.id)}">
      <span class="car">▾</span>
      <span class="emp">${esc(emp.nome)}</span>
      <span class="cnt">${doneReal}/${totalReal}</span>
    </div>
    <div class="fech-minibar"><div class="fech-minibar-fill" style="width:${pct}%"></div></div>
    <div class="fech-card-body">`;

  if (!tarefas.length) {
    html += `<div style="font-size:.72rem;color:var(--text3);padding:6px 0">${hideDone ? "Todas as tarefas desta empresa já foram concluídas." : "Nenhuma tarefa cadastrada."}</div>`;
  }

  tarefas.forEach(t => {
    html += renderTaskRow(t, emp, isAdmin);
  });

  // 24/09/2026: criar tarefa aberto a qualquer colaborador do DP, não só Admin (pedido do Leonardo)
  html += `<div class="fech-addrow">
    <input type="text" placeholder="Nova tarefa para ${esc(emp.nome)}" data-newtask="${esc(emp.id)}">
    <button class="fech-btn" data-action="add-task" data-val="${esc(emp.id)}">Adicionar</button>
  </div>`;

  html += `</div></div>`;
  return html;
}

function renderTaskRow(t, emp, isAdmin) {
  const isEditing = editingId === t.id;
  const isCopying = copyingId === t.id;
  const isDeleting = confirmingDeleteId === t.id;
  const isSettingPrazo = editingPrazoId === t.id;
  const nome = t.doneByName || (t.doneBy ? (window && ctx.getMembers().find(m => m.id === t.doneBy)?.name) : "") || "";

  let txtHtml;
  if (isEditing) {
    txtHtml = `<input type="text" class="fech-renameinp" data-renameinp="${esc(t.id)}" value="${esc(t.text)}">`;
  } else {
    txtHtml = `<span class="fech-task-txt">${esc(t.text)}</span>${t.tag === "geral" ? `<span class="fech-tag">Todas as empresas</span>` : ""}${prazoBadge(t.prazo, t.done)}`;
  }

  let metaHtml = "";
  if (t.done && !isEditing) {
    metaHtml = `<div class="fech-task-meta">✓ ${esc(nome || "—")} · ${fmtDT(t.doneAt)}</div>`;
  }

  let actionsHtml = "";
  // 24/09/2026: renomear/copiar/excluir/prazo abertos a qualquer colaborador do DP, não só Admin (pedido do Leonardo)
  if (!isEditing) {
    if (isDeleting) {
      actionsHtml = `<div class="fech-delbox">Excluir esta tarefa?
        <button class="fech-btn" data-action="delete-confirm" data-val="${esc(t.id)}">Sim</button>
        <button class="fech-btn" data-action="delete-cancel">Não</button>
      </div>`;
    } else if (isCopying) {
      const outras = config.empresas.filter(e => e.id !== emp.id);
      actionsHtml = `<div class="fech-copybox">
        <select data-copyselect="${esc(t.id)}">
          <option value="__all__">Todas as outras</option>
          ${outras.map(e => `<option value="${esc(e.id)}">${esc(e.nome)}</option>`).join("")}
        </select>
        <button class="fech-btn" data-action="copy-confirm" data-val="${esc(t.id)}">Copiar</button>
        <button class="fech-btn" data-action="copy-cancel">Cancelar</button>
      </div>`;
    } else if (isSettingPrazo) {
      actionsHtml = `<div class="fech-copybox">
        <input type="date" class="fech-prazoinp" data-prazoinp="${esc(t.id)}" value="${esc(t.prazo || "")}">
        <button class="fech-btn" data-action="prazo-save" data-val="${esc(t.id)}">Salvar</button>
        <button class="fech-btn" data-action="prazo-clear" data-val="${esc(t.id)}">Remover prazo</button>
        <button class="fech-btn" data-action="prazo-cancel">Cancelar</button>
      </div>`;
    }
  }

  let btnsHtml = "";
  // 24/09/2026: reordenar/renomear/copiar/excluir/prazo abertos a qualquer colaborador do DP, não só Admin
  if (!isEditing && !isDeleting && !isCopying && !isSettingPrazo) {
    btnsHtml = `<div class="fech-task-actions">
      <button class="fech-ibtn" data-action="reorder-up" data-val="${esc(t.id)}" title="Mover pra cima">↑</button>
      <button class="fech-ibtn" data-action="reorder-down" data-val="${esc(t.id)}" title="Mover pra baixo">↓</button>
      <button class="fech-ibtn" data-action="rename-start" data-val="${esc(t.id)}" title="Renomear">✎</button>
      <button class="fech-ibtn" data-action="prazo-start" data-val="${esc(t.id)}" title="Definir prazo">📅</button>
      <button class="fech-ibtn" data-action="copy-start" data-val="${esc(t.id)}" title="Copiar pra outra empresa">⧉</button>
      <button class="fech-ibtn" data-action="delete-start" data-val="${esc(t.id)}" title="Excluir">🗑</button>
    </div>`;
  } else if (isEditing) {
    btnsHtml = `<div class="fech-task-actions">
      <button class="fech-ibtn" data-action="rename-save" data-val="${esc(t.id)}" title="Salvar">✓</button>
      <button class="fech-ibtn" data-action="rename-cancel" title="Cancelar">✕</button>
    </div>`;
  }

  // 24/09/2026: em modo seleção (prazo em lote), troca a caixinha de "feito" por uma de seleção —
  // evita marcar a tarefa como concluída sem querer enquanto se está só escolhendo o grupo pro prazo.
  const checkboxHtml = selectMode
    ? `<input type="checkbox" class="fech-selchk" data-action="toggle-select" data-val="${esc(t.id)}" ${selectedIds.has(t.id) ? "checked" : ""}>`
    : `<input type="checkbox" data-action="toggle-done" data-val="${esc(t.id)}" ${t.done ? "checked" : ""} ${isEditing ? "disabled" : ""}>`;

  return `<div class="fech-task ${t.done ? "done" : ""}" data-taskid="${esc(t.id)}">
    ${checkboxHtml}
    <div class="fech-task-main">
      ${txtHtml}
      ${metaHtml}
      ${actionsHtml}
    </div>
    ${btnsHtml}
  </div>`;
}

// ---- eventos (delegados no mountEl, registrados uma única vez) ----
function wireEvents() {
  mountEl.addEventListener("click", async e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const val = btn.dataset.val;

    if (action === "toggle-collapse") {
      const set = getCollapsed();
      if (set.has(val)) set.delete(val); else set.add(val);
      setCollapsed(set); render(); return;
    }
    if (action === "filter-equipe") { filterEquipe = val; render(); return; }
    if (action === "toggle-done") { toggleDone(val); return; }
    if (action === "add-task") {
      const inp = mountEl.querySelector(`[data-newtask="${CSS.escape(val)}"]`);
      if (inp) { const v = inp.value; inp.value = ""; await addTask(val, v); }
      return;
    }
    if (action === "rename-start") { editingId = val; copyingId = null; confirmingDeleteId = null; editingPrazoId = null; render();
      const inp = mountEl.querySelector(`[data-renameinp="${CSS.escape(val)}"]`); if (inp) { inp.focus(); inp.select(); } return; }
    if (action === "rename-cancel") { editingId = null; render(); return; }
    if (action === "rename-save") {
      const inp = mountEl.querySelector(`[data-renameinp="${CSS.escape(val)}"]`);
      const novo = inp ? inp.value : "";
      editingId = null;
      await renameTask(val, novo); return;
    }
    if (action === "reorder-up") { await reorder(val, -1); return; }
    if (action === "reorder-down") { await reorder(val, 1); return; }
    if (action === "copy-start") { copyingId = val; editingId = null; confirmingDeleteId = null; editingPrazoId = null; render(); return; }
    if (action === "copy-cancel") { copyingId = null; render(); return; }
    if (action === "copy-confirm") {
      const sel = mountEl.querySelector(`[data-copyselect="${CSS.escape(val)}"]`);
      const dest = sel ? sel.value : null;
      copyingId = null;
      if (dest) await copyTask(val, dest);
      return;
    }
    if (action === "delete-start") { confirmingDeleteId = val; editingId = null; copyingId = null; editingPrazoId = null; render(); return; }
    if (action === "delete-cancel") { confirmingDeleteId = null; render(); return; }
    if (action === "delete-confirm") { confirmingDeleteId = null; await deleteTask(val); return; }
    if (action === "copy-prev") { await copyFromCompetencia(prevYYYYMM(competencia)); return; }

    // ---- prazo (24/09/2026) — edição individual ----
    if (action === "prazo-start") { editingPrazoId = val; editingId = null; copyingId = null; confirmingDeleteId = null; render();
      const inp = mountEl.querySelector(`[data-prazoinp="${CSS.escape(val)}"]`); if (inp) inp.focus(); return; }
    if (action === "prazo-cancel") { editingPrazoId = null; render(); return; }
    if (action === "prazo-save") {
      const inp = mountEl.querySelector(`[data-prazoinp="${CSS.escape(val)}"]`);
      const v = inp ? inp.value : "";
      editingPrazoId = null;
      await setPrazoSingle(val, v || null); return;
    }
    if (action === "prazo-clear") { editingPrazoId = null; await setPrazoSingle(val, null); return; }

    // ---- prazo (24/09/2026) — seleção múltipla + aplicar em lote ----
    if (action === "toggle-selectmode") {
      selectMode = !selectMode;
      selectedIds.clear();
      render(); return;
    }
    if (action === "toggle-select") {
      if (selectedIds.has(val)) selectedIds.delete(val); else selectedIds.add(val);
      render(); return;
    }
    if (action === "select-clear") { selectedIds.clear(); render(); return; }
    if (action === "bulk-apply-prazo") {
      const inp = document.getElementById("fechBulkDate");
      const v = inp ? inp.value : "";
      if (!v) { alert("Escolha uma data antes de aplicar."); return; }
      if (!selectedIds.size) { alert("Selecione ao menos uma tarefa."); return; }
      const ids = [...selectedIds];
      selectedIds.clear();
      await setPrazoBulk(ids, v);
      return;
    }
    if (action === "bulk-clear-prazo") {
      if (!selectedIds.size) { alert("Selecione ao menos uma tarefa."); return; }
      const ids = [...selectedIds];
      selectedIds.clear();
      await setPrazoBulk(ids, null);
      return;
    }
  });

  mountEl.addEventListener("change", e => {
    if (e.target.matches('[data-action="change-competencia"]')) {
      const v = e.target.value;
      if (v && /^\d{4}-\d{2}$/.test(v)) { competencia = v; selectedIds.clear(); subscribeTasks(); render(); }
      return;
    }
    if (e.target.matches('[data-action="toggle-hide-done"]')) { hideDone = e.target.checked; render(); return; }
  });

  mountEl.addEventListener("keydown", e => {
    if (e.target.matches("[data-renameinp]")) {
      if (e.key === "Enter") { e.target.closest(".fech-task").querySelector('[data-action="rename-save"]')?.click(); }
      if (e.key === "Escape") { editingId = null; render(); }
    }
    if (e.target.matches("[data-prazoinp]")) {
      if (e.key === "Enter") { e.target.closest(".fech-task").querySelector('[data-action="prazo-save"]')?.click(); }
      if (e.key === "Escape") { editingPrazoId = null; render(); }
    }
  });
}

// ---- API pública ----
export function initFechamento(c) {
  ctx = c;
  mountEl = document.getElementById("fechRoot");
  if (!mountEl) return () => {};
  wireEvents();
  (async () => {
    await ensureConfigSeeded();
    await ensureSeedTasks();
    subscribeTasks();
  })();
  return function stopFechamento() {
    if (unsubTasks) { unsubTasks(); unsubTasks = null; }
    if (unsubConfig) { unsubConfig(); unsubConfig = null; }
  };
}

export function renderFechamento() {
  render();
}
