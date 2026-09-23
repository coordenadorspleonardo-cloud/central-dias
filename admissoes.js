// ============================================================================
// Admissões — módulo separado (não mexe no restante do index.html)
// Criado em 23/09/2026 a pedido do Leonardo: uma aba própria pra acompanhar
// cada admissão em andamento, no mesmo espírito da aba Desligamentos (filtros
// por empresa/status/período, mini-dashboard, pendentes/concluídas/atrasadas/
// total) e do checklist do Fechamento da Folha (passo a passo com checkbox,
// aberto pra qualquer colaborador do DP marcar).
//
// Como funciona: dp.html chama initAdmissoes(ctx) uma vez, depois do login,
// passando as funções do Firestore já importadas lá, mais getEmpresas()/
// getFiliais() pra reaproveitar as mesmas listas usadas em Desligamentos —
// não duplicamos esse cadastro aqui. Este arquivo cuida do resto: injeta seu
// próprio <style>, desenha dentro de #admissoesRoot, escuta o Firestore em
// tempo real e trata os cliques.
// ============================================================================

const COLLECTION = "admissoes_dp";

// ---- passo a passo do checklist (mesma ordem sempre; cruzado com o documento
// que o Leonardo escreveu — ver auditoria comparacao_admissao_atestado_rescisao_23-09.md) ----
const PASSOS = [
  { key: "recebDocs", texto: "Receber a documentação da colaboradora sempre por e-mail (se vier por WhatsApp, formalizar antes de seguir)" },
  { key: "checklistDocs", texto: "Bater o checklist de documentos e verificar se não está faltando nada" },
  { key: "recontratacaoCheck", texto: "Verificar se é recontratação (consultar o CPF no eSocial da empresa)" },
  { key: "conferirDocs", texto: "Conferir os documentos recebidos e esclarecer dúvidas com o responsável pela contratação" },
  { key: "salvarRede", texto: "Salvar todos os documentos na rede" },
  { key: "dexionContrato", texto: "Incluir a admissão no Dexion/Domínio e gerar o contrato de trabalho" },
  { key: "lerContrato", texto: "Ler o contrato gerado (cargo, salário, horário, carga horária, nome, estado civil, prazo/modalidade)" },
  { key: "s2200", texto: "Enviar o evento de admissão ao eSocial (S-2200)" },
  { key: "emailCliente", texto: "Enviar e-mail ao cliente informando início, prazo de experiência ou modalidade do contrato" }
];

const TIPO_LABELS = { experiencia: "Prazo de Experiência", determinado: "Prazo Determinado", indeterminado: "Prazo Indeterminado" };
const COMBOS = {
  "45-45": { p1: 45, p2: 45, label: "45 + 45 dias" },
  "30-60": { p1: 30, p2: 60, label: "30 + 60 dias" },
  "60-30": { p1: 60, p2: 30, label: "60 + 30 dias" }
};

// Particularidades por empresa no recebimento da documentação — mesmo texto
// já usado na aba Processos → Consulta (ver DEF_PROCESSOS_DP.admissao no dp.html).
const NOTAS_EMPRESA = {
  jardim: "A Rosa manda a documentação por WhatsApp. Repasse por e-mail nomeando \"contratação da unidade\" e cobre pendências direto com a Rosa por e-mail — nunca respondendo o e-mail do Leonardo marcando ela."
};

const ORIENTACAO_TEXTO = `Cada card abaixo é uma admissão em andamento. Marquem os passos conforme forem concluídos — aberto pra qualquer colaborador do DP. Documento não impeditivo faltando: se há prazo hábil, cobrem por e-mail e, sem retorno, por WhatsApp, registrando e seguindo; se não há prazo hábil, enviem a admissão e cobrem o documento no mesmo e-mail. Se o cliente mandar fora do prazo do S-2200 e pedir para registrar mesmo assim, registrem mas formalizem por e-mail que foi fora do prazo recomendado. As datas de vencimento da experiência/contrato são calculadas automaticamente a partir da data de início — são estimativas, confirmem sempre no Dexion/Domínio.`;

// ---- estado do módulo ----
let ctx = null;
let mountEl = null;
let stylesInjected = false;
let unsubAdmissoes = null;
let registros = [];
let filterEmp = "all";
let filterStatus = "pendente"; // pendente | concluido | atrasado | all
let filterPeriodo = "all";
let periodoDe = "";
let periodoAte = "";
let formOpen = false;
let editingId = null;
let confirmingDeleteId = null;
let collapsedEmp = getCollapsedSet();

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function today() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function addDays(dateStr, n) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}
function addMonths(dateStr, n) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1 + n, d);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}
function fmtD(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}
function fmtDFull(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
function getCollapsedSet() {
  try { return new Set(JSON.parse(localStorage.getItem("cdAdmissoesColapsados") || "[]")); } catch (e) { return new Set(); }
}
function setCollapsedSet(set) {
  try { localStorage.setItem("cdAdmissoesColapsados", JSON.stringify([...set])); } catch (e) {}
}

// ---- cálculo das datas (estimativa — sempre exibida com aviso pra confirmar no sistema de folha) ----
function computeDatas({ tipoContrato, experienciaCombo, determinadoMeses, inicio }) {
  const out = { prazoS2200: null, fimPeriodo1: null, vencimentoContrato: null };
  if (!inicio) return out;
  out.prazoS2200 = addDays(inicio, -1);
  if (tipoContrato === "experiencia") {
    const combo = COMBOS[experienciaCombo] || COMBOS["45-45"];
    out.fimPeriodo1 = addDays(inicio, combo.p1 - 1);
    out.vencimentoContrato = addDays(inicio, combo.p1 + combo.p2 - 1);
  } else if (tipoContrato === "determinado") {
    const meses = Math.max(1, Number(determinadoMeses) || 1);
    out.vencimentoContrato = addDays(addMonths(inicio, meses), -1);
  }
  return out;
}

function isConcluido(passos) {
  return PASSOS.every(p => !!(passos && passos[p.key]));
}

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
#admissoesRoot{display:flex;flex-direction:column;gap:16px;}
#admissoesRoot .adm-header{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;}
#admissoesRoot .adm-title{font-size:1.05rem;font-weight:700;color:var(--text);}
#admissoesRoot .adm-sub{font-size:.74rem;color:var(--text2);margin-top:2px;}
#admissoesRoot .adm-orient{background:var(--s2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:12px 14px;font-size:.76rem;color:var(--text2);line-height:1.55;}
#admissoesRoot .adm-orient b{color:var(--text);}
#admissoesRoot .adm-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
#admissoesRoot .adm-btn{background:var(--s3);border:1px solid var(--border2);color:var(--text);font-family:inherit;font-size:.72rem;font-weight:600;padding:6px 11px;border-radius:7px;cursor:pointer;white-space:nowrap;}
#admissoesRoot .adm-btn:hover{background:var(--border2);}
#admissoesRoot .adm-btn.on{background:var(--accent2);border-color:var(--accent2);color:#fff;}
#admissoesRoot .adm-btn.primary{background:var(--accent);border-color:var(--accent);color:#0f0f13;}
#admissoesRoot .adm-sel{background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.72rem;padding:6px 9px;}
#admissoesRoot .adm-minidash{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:11px;}
#admissoesRoot .adm-kpi{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);padding:12px;text-align:center;}
#admissoesRoot .adm-kpi .v{font-size:1.5rem;font-weight:700;color:var(--text);}
#admissoesRoot .adm-kpi .l{font-size:.66rem;color:var(--text2);margin-top:2px;}
#admissoesRoot .adm-form{background:var(--s1);border:1px solid var(--accent2);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;gap:12px;}
#admissoesRoot .adm-form-title{font-size:.86rem;font-weight:700;color:var(--text);}
#admissoesRoot .adm-fg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;}
#admissoesRoot .adm-fg{display:flex;flex-direction:column;gap:4px;}
#admissoesRoot .adm-fg.full{grid-column:1/-1;}
#admissoesRoot .adm-fg label{font-size:.68rem;color:var(--text2);font-weight:600;}
#admissoesRoot .adm-fg input[type=text],#admissoesRoot .adm-fg input[type=date],#admissoesRoot .adm-fg input[type=number],#admissoesRoot .adm-fg select{background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.78rem;padding:7px 9px;}
#admissoesRoot .adm-radios{display:flex;gap:14px;flex-wrap:wrap;}
#admissoesRoot .adm-radios label{display:flex;align-items:center;gap:5px;font-size:.76rem;color:var(--text);cursor:pointer;}
#admissoesRoot .adm-warn{background:rgba(224,140,58,.12);border:1px solid rgba(224,140,58,.35);border-radius:8px;padding:8px 10px;font-size:.72rem;color:var(--imp);line-height:1.5;}
#admissoesRoot .adm-preview{background:var(--s2);border:1px dashed var(--border2);border-radius:8px;padding:10px 12px;font-size:.72rem;color:var(--text2);line-height:1.6;}
#admissoesRoot .adm-preview b{color:var(--text);}
#admissoesRoot .adm-form-actions{display:flex;gap:8px;justify-content:flex-end;}
#admissoesRoot .adm-empsec{margin-bottom:6px;}
#admissoesRoot .adm-emphd{display:flex;align-items:center;gap:8px;padding:8px 2px;cursor:pointer;user-select:none;border-bottom:2px solid var(--ec);margin-bottom:8px;}
#admissoesRoot .adm-emphd .car{transition:transform .15s;color:var(--text3);font-size:.7rem;}
#admissoesRoot .adm-empsec.collapsed .car{transform:rotate(-90deg);}
#admissoesRoot .adm-empsec.collapsed .adm-empbody{display:none;}
#admissoesRoot .adm-emphd .nome{font-weight:700;font-size:.84rem;color:var(--ec);}
#admissoesRoot .adm-emphd .cnt{margin-left:auto;font-size:.7rem;color:var(--text2);}
#admissoesRoot .adm-filgroup{margin-bottom:14px;}
#admissoesRoot .adm-filgroup .fl{font-size:.7rem;color:var(--text3);font-weight:600;margin-bottom:6px;}
#admissoesRoot .adm-card{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:10px;}
#admissoesRoot .adm-card.atrasado{border-color:rgba(224,92,92,.45);}
#admissoesRoot .adm-card-hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;cursor:pointer;}
#admissoesRoot .adm-card-hd:hover{background:var(--s2);}
#admissoesRoot .adm-card-hd .car{transition:transform .15s;color:var(--text3);font-size:.7rem;}
#admissoesRoot .adm-card.collapsed .car{transform:rotate(-90deg);}
#admissoesRoot .adm-card.collapsed .adm-card-body{display:none;}
#admissoesRoot .adm-nome{font-weight:700;font-size:.84rem;color:var(--text);}
#admissoesRoot .adm-tag{font-size:.64rem;font-weight:600;border-radius:99px;padding:2px 8px;white-space:nowrap;}
#admissoesRoot .adm-tag.tipo{background:rgba(124,111,205,.16);color:var(--accent2);}
#admissoesRoot .adm-tag.recontrat{background:rgba(224,140,58,.18);color:var(--imp);text-transform:uppercase;letter-spacing:.02em;}
#admissoesRoot .adm-tag.filial{background:var(--s3);color:var(--text2);}
#admissoesRoot .adm-prazo{display:inline-block;font-size:.64rem;font-weight:600;border-radius:99px;padding:2px 9px;white-space:nowrap;}
#admissoesRoot .adm-prazo-urg{background:rgba(224,92,92,.2);color:var(--urg);}
#admissoesRoot .adm-prazo-imp{background:rgba(224,140,58,.2);color:var(--imp);}
#admissoesRoot .adm-prazo-nor{background:rgba(76,175,125,.2);color:var(--nor);}
#admissoesRoot .adm-prazo-ok{background:var(--s3);color:var(--text3);}
#admissoesRoot .adm-cnt{margin-left:auto;font-size:.7rem;color:var(--text2);font-variant-numeric:tabular-nums;}
#admissoesRoot .adm-minibar{height:4px;background:var(--s3);border-radius:3px;overflow:hidden;margin:0 12px 10px;}
#admissoesRoot .adm-minibar-fill{height:100%;background:var(--nor);transition:width .3s;}
#admissoesRoot .adm-card-body{padding:0 12px 12px;}
#admissoesRoot .adm-note{background:rgba(200,169,110,.1);border:1px solid rgba(200,169,110,.35);border-radius:8px;padding:8px 10px;font-size:.72rem;color:var(--accent);margin-bottom:8px;line-height:1.5;}
#admissoesRoot .adm-note b{color:var(--text);}
#admissoesRoot .adm-task{display:flex;align-items:flex-start;gap:9px;padding:6px 4px;border-bottom:1px solid var(--border);}
#admissoesRoot .adm-task:last-child{border-bottom:none;}
#admissoesRoot .adm-task input[type=checkbox]{width:17px;height:17px;margin-top:2px;accent-color:var(--nor);cursor:pointer;flex-shrink:0;}
#admissoesRoot .adm-task-txt{font-size:.78rem;color:var(--text);line-height:1.4;}
#admissoesRoot .adm-task.done .adm-task-txt{text-decoration:line-through;color:var(--text3);}
#admissoesRoot .adm-card-actions{display:flex;gap:4px;margin-left:auto;flex-shrink:0;}
#admissoesRoot .adm-ibtn{background:none;border:1px solid transparent;color:var(--text3);cursor:pointer;font-size:.74rem;padding:3px 6px;border-radius:6px;line-height:1;}
#admissoesRoot .adm-ibtn:hover{background:var(--s3);color:var(--text);border-color:var(--border2);}
#admissoesRoot .adm-delbox{display:flex;gap:6px;align-items:center;font-size:.72rem;color:var(--urg);padding:6px 12px 10px;}
#admissoesRoot .adm-empty{font-size:.8rem;color:var(--text2);background:var(--s2);border:1px dashed var(--border2);border-radius:10px;padding:16px;text-align:center;}
`;
  document.head.appendChild(style);
}

// ---- Firestore ----
function subscribeAdmissoes() {
  if (unsubAdmissoes) { unsubAdmissoes(); unsubAdmissoes = null; }
  const { db, collection, onSnapshot } = ctx;
  unsubAdmissoes = onSnapshot(
    collection(db, COLLECTION),
    snap => { registros = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); },
    () => { registros = []; render(); }
  );
}

async function saveRecord(data, id) {
  const { db, doc, collection, addDoc, updateDoc, serverTimestamp } = ctx;
  const datas = computeDatas(data);
  const payload = { ...data, ...datas };
  try {
    if (id) {
      await updateDoc(doc(db, COLLECTION, id), payload);
    } else {
      payload.passos = {};
      PASSOS.forEach(p => { payload.passos[p.key] = false; });
      payload.concluido = false;
      payload.createdBy = ctx.getUser()?.uid || null;
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, COLLECTION), payload);
    }
    return true;
  } catch (e) { alert("Não foi possível salvar: " + (e?.message || e)); return false; }
}

async function togglePasso(id, key) {
  const r = registros.find(x => x.id === id); if (!r) return;
  const { db, doc, updateDoc } = ctx;
  const novoPassos = { ...(r.passos || {}), [key]: !(r.passos && r.passos[key]) };
  const concluido = isConcluido(novoPassos);
  try { await updateDoc(doc(db, COLLECTION, id), { passos: novoPassos, concluido }); } catch (e) {}
}

async function deleteRecord(id) {
  const { db, doc, deleteDoc } = ctx;
  try { await deleteDoc(doc(db, COLLECTION, id)); } catch (e) {}
}

// ---- helpers de empresa/filial (reaproveita as mesmas listas de Desligamentos) ----
function visEmpresas() {
  const all = ctx.getEmpresas() || [];
  return ctx.getIsAdmin() ? all : all.filter(e => !e.adminOnly);
}
function getEmpresa(id) {
  return (ctx.getEmpresas() || []).find(e => e.id === id) || { id, label: id, color: "#888" };
}
function filiaisDaEmpresa(empId) {
  return (ctx.getFiliais() || []).filter(f => f.empId === empId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function prazoBadge(dataStr, label, concluidoFlag) {
  if (!dataStr) return "";
  if (concluidoFlag) return `<span class="adm-prazo adm-prazo-ok">📅 ${esc(label)} ${esc(fmtD(dataStr))}</span>`;
  const hoje = today();
  const dias = Math.round((new Date(dataStr + "T00:00:00") - new Date(hoje + "T00:00:00")) / 86400000);
  let cls, txt;
  if (dias < 0) { cls = "urg"; txt = `Vencido — era ${fmtD(dataStr)}`; }
  else if (dias === 0) { cls = "imp"; txt = "Vence hoje"; }
  else if (dias <= 3) { cls = "imp"; txt = `Vence em ${dias}d (${fmtD(dataStr)})`; }
  else { cls = "nor"; txt = `${label} ${fmtD(dataStr)}`; }
  return `<span class="adm-prazo adm-prazo-${cls}">📅 ${esc(txt)}</span>`;
}

function isAtrasado(r) {
  return !r.concluido && r.prazoS2200 && r.prazoS2200 < today();
}

function filtraPorPeriodo(arr) {
  if (filterPeriodo === "all") return arr;
  const hoje = today();
  if (filterPeriodo === "atrasado") return arr.filter(r => r.vencimentoContrato && r.vencimentoContrato < hoje);
  if (filterPeriodo === "custom") {
    return arr.filter(r => {
      if (!r.vencimentoContrato) return false;
      if (periodoDe && r.vencimentoContrato < periodoDe) return false;
      if (periodoAte && r.vencimentoContrato > periodoAte) return false;
      return true;
    });
  }
  const dias = Number(filterPeriodo);
  const limite = addDays(hoje, dias);
  return arr.filter(r => r.vencimentoContrato && r.vencimentoContrato >= hoje && r.vencimentoContrato <= limite);
}

// ---- render ----
function render() {
  if (!mountEl) return;
  ensureStyles();

  let html = `<div class="adm-header">
    <div>
      <div class="adm-title">📥 Admissões</div>
      <div class="adm-sub">Departamento Pessoal · acompanhamento de cada admissão em andamento</div>
    </div>
  </div>`;

  html += `<div class="adm-orient"><b>Orientação.</b> ${esc(ORIENTACAO_TEXTO)}</div>`;

  // filtros
  const emps = visEmpresas();
  html += `<div class="adm-filters">
    <span class="filter-label">Empresa</span>
    <button class="adm-btn ${filterEmp === "all" ? "on" : ""}" data-action="filter-emp" data-val="all">Todas</button>
    ${emps.map(e => `<button class="adm-btn ${filterEmp === e.id ? "on" : ""}" data-action="filter-emp" data-val="${esc(e.id)}" style="${filterEmp === e.id ? `background:${e.color}22;border-color:${e.color};color:${e.color};` : ""}">${esc(e.label)}</button>`).join("")}
  </div>`;

  html += `<div class="adm-filters">
    <span class="filter-label">Status</span>
    <button class="adm-btn ${filterStatus === "pendente" ? "on" : ""}" data-action="filter-status" data-val="pendente">Pendentes</button>
    <button class="adm-btn ${filterStatus === "concluido" ? "on" : ""}" data-action="filter-status" data-val="concluido">Concluídas</button>
    <button class="adm-btn ${filterStatus === "atrasado" ? "on" : ""}" data-action="filter-status" data-val="atrasado">Atrasadas</button>
    <button class="adm-btn ${filterStatus === "all" ? "on" : ""}" data-action="filter-status" data-val="all">Todas</button>
    <button class="adm-btn primary" style="margin-left:auto" data-action="toggle-form">${formOpen ? "✕ Cancelar" : "＋ Nova Admissão"}</button>
  </div>`;

  html += `<div class="adm-filters">
    <span class="filter-label">Período (vencimento do contrato)</span>
    <select class="adm-sel" data-action="periodo-sel">
      <option value="all" ${filterPeriodo === "all" ? "selected" : ""}>Todo período</option>
      <option value="atrasado" ${filterPeriodo === "atrasado" ? "selected" : ""}>Vencidos</option>
      <option value="0" ${filterPeriodo === "0" ? "selected" : ""}>Hoje</option>
      <option value="3" ${filterPeriodo === "3" ? "selected" : ""}>Próximos 3 dias</option>
      <option value="7" ${filterPeriodo === "7" ? "selected" : ""}>Próximos 7 dias</option>
      <option value="30" ${filterPeriodo === "30" ? "selected" : ""}>Próximos 30 dias</option>
      <option value="custom" ${filterPeriodo === "custom" ? "selected" : ""}>Personalizado</option>
    </select>
    ${filterPeriodo === "custom" ? `<input type="date" class="adm-sel" data-action="periodo-de" value="${esc(periodoDe)}"><span style="font-size:.72rem;color:var(--text2)">até</span><input type="date" class="adm-sel" data-action="periodo-ate" value="${esc(periodoAte)}">` : ""}
  </div>`;

  // dados visíveis (empresa + período, sem o filtro de status — pro mini-dashboard)
  let visBase = registros;
  if (filterEmp !== "all") visBase = visBase.filter(r => r.emp === filterEmp);
  visBase = filtraPorPeriodo(visBase);

  const pendentes = visBase.filter(r => !r.concluido).length;
  const concluidas = visBase.filter(r => r.concluido).length;
  const atrasadas = visBase.filter(isAtrasado).length;
  html += `<div class="adm-minidash">
    <div class="adm-kpi"><div class="v">${pendentes}</div><div class="l">⏳ Pendentes</div></div>
    <div class="adm-kpi"><div class="v">${concluidas}</div><div class="l">✅ Concluídas</div></div>
    <div class="adm-kpi"><div class="v">${atrasadas}</div><div class="l">⚠️ Atrasadas</div></div>
    <div class="adm-kpi"><div class="v">${visBase.length}</div><div class="l">📊 Total</div></div>
  </div>`;

  const badge = document.getElementById("admissoesTabBadge");
  if (badge) {
    const pendTotal = registros.filter(r => !r.concluido).length;
    if (pendTotal > 0) { badge.style.display = "inline-flex"; badge.textContent = pendTotal; }
    else badge.style.display = "none";
  }

  if (formOpen) html += renderForm();

  // aplica filtro de status por cima
  let visD = visBase;
  if (filterStatus === "pendente") visD = visD.filter(r => !r.concluido);
  else if (filterStatus === "concluido") visD = visD.filter(r => r.concluido);
  else if (filterStatus === "atrasado") visD = visD.filter(isAtrasado);

  if (!visD.length) {
    html += `<div class="adm-empty">Nenhuma admissão encontrada com esses filtros.</div>`;
  } else {
    const byEmp = {};
    visD.forEach(r => { (byEmp[r.emp] || (byEmp[r.emp] = [])).push(r); });
    html += `<div id="admListWrap"></div>`;
    mountEl.innerHTML = html;
    const wrap = mountEl.querySelector("#admListWrap");
    Object.keys(byEmp).forEach(empId => {
      wrap.appendChild(buildEmpSection(empId, byEmp[empId]));
    });
    wireFormEvents();
    return;
  }

  mountEl.innerHTML = html;
  wireFormEvents();
}

function buildEmpSection(empId, items) {
  const emp = getEmpresa(empId);
  const collapsed = collapsedEmp.has(empId);
  const sec = document.createElement("div");
  sec.className = `adm-empsec ${collapsed ? "collapsed" : ""}`;
  sec.style.setProperty("--ec", emp.color || "#888");
  const hd = document.createElement("div");
  hd.className = "adm-emphd";
  hd.innerHTML = `<span class="car">▾</span><span class="nome">${esc(emp.label)}</span><span class="cnt">${items.length}</span>`;
  hd.addEventListener("click", () => {
    if (collapsedEmp.has(empId)) collapsedEmp.delete(empId); else collapsedEmp.add(empId);
    setCollapsedSet(collapsedEmp);
    render();
  });
  sec.appendChild(hd);
  const body = document.createElement("div");
  body.className = "adm-empbody";
  sec.appendChild(body);

  const byFilial = {};
  items.forEach(r => {
    const filObj = (ctx.getFiliais() || []).find(f => f.id === r.filial);
    const key = filObj ? filObj.label : "Sem filial definida";
    (byFilial[key] || (byFilial[key] = [])).push(r);
  });
  Object.keys(byFilial).forEach(filKey => {
    const g = document.createElement("div");
    g.className = "adm-filgroup";
    if (Object.keys(byFilial).length > 1 || filKey !== "Sem filial definida") {
      g.innerHTML = `<div class="fl">${esc(filKey)}</div>`;
    }
    byFilial[filKey].sort((a, b) => (a.vencimentoContrato || "9999").localeCompare(b.vencimentoContrato || "9999"))
      .forEach(r => g.appendChild(buildCard(r)));
    body.appendChild(g);
  });
  return sec;
}

function buildCard(r) {
  const collapsedSet = getCardCollapsedSet();
  const collapsed = collapsedSet.has(r.id);
  const atrasado = isAtrasado(r);
  const done = PASSOS.filter(p => r.passos && r.passos[p.key]).length;
  const pct = Math.round((done / PASSOS.length) * 100);
  const nota = NOTAS_EMPRESA[r.emp];
  const isDeleting = confirmingDeleteId === r.id;

  const div = document.createElement("div");
  div.className = `adm-card ${collapsed ? "collapsed" : ""} ${atrasado ? "atrasado" : ""}`;

  let tipoTxt = TIPO_LABELS[r.tipoContrato] || r.tipoContrato;
  if (r.tipoContrato === "experiencia" && r.experienciaCombo) tipoTxt += ` (${COMBOS[r.experienciaCombo]?.label || r.experienciaCombo})`;
  if (r.tipoContrato === "determinado" && r.determinadoMeses) tipoTxt += ` (${r.determinadoMeses}m)`;

  div.innerHTML = `
    <div class="adm-card-hd" data-action="toggle-card" data-val="${esc(r.id)}">
      <span class="car">▾</span>
      <span class="adm-nome">${esc(r.colaborador)}</span>
      <span class="adm-tag tipo">${esc(tipoTxt)}</span>
      ${r.recontratacao ? '<span class="adm-tag recontrat">Recontratação</span>' : ""}
      ${prazoBadge(r.prazoS2200, "S-2200 até", r.concluido || !!(r.passos && r.passos.s2200))}
      ${r.vencimentoContrato ? `<span class="adm-tag filial">Vencimento ${esc(fmtD(r.vencimentoContrato))}</span>` : ""}
      <span class="adm-cnt">${done}/${PASSOS.length}</span>
      <div class="adm-card-actions">
        <button class="adm-ibtn" data-action="edit-start" data-val="${esc(r.id)}" title="Editar">✎</button>
        <button class="adm-ibtn" data-action="delete-start" data-val="${esc(r.id)}" title="Excluir">🗑</button>
      </div>
    </div>
    <div class="adm-minibar"><div class="adm-minibar-fill" style="width:${pct}%"></div></div>
    <div class="adm-card-body">
      ${nota ? `<div class="adm-note"><b>⚠️ ${esc(getEmpresa(r.emp).label)}:</b> ${esc(nota)}</div>` : ""}
      ${r.observacao ? `<div class="adm-note">📝 ${esc(r.observacao)}</div>` : ""}
      ${PASSOS.map(p => `<div class="adm-task ${r.passos && r.passos[p.key] ? "done" : ""}">
        <input type="checkbox" data-action="toggle-passo" data-val="${esc(r.id)}" data-key="${esc(p.key)}" ${r.passos && r.passos[p.key] ? "checked" : ""}>
        <span class="adm-task-txt">${esc(p.texto)}</span>
      </div>`).join("")}
    </div>
    ${isDeleting ? `<div class="adm-delbox">Excluir esta admissão?
      <button class="adm-btn" data-action="delete-confirm" data-val="${esc(r.id)}">Sim</button>
      <button class="adm-btn" data-action="delete-cancel">Não</button>
    </div>` : ""}
  `;
  return div;
}

function getCardCollapsedSet() {
  try { return new Set(JSON.parse(localStorage.getItem("cdAdmissoesCardsColapsados") || "[]")); } catch (e) { return new Set(); }
}
function setCardCollapsedSet(set) {
  try { localStorage.setItem("cdAdmissoesCardsColapsados", JSON.stringify([...set])); } catch (e) {}
}

function renderForm() {
  const editing = editingId ? registros.find(r => r.id === editingId) : null;
  const emps = visEmpresas();
  const empSel = editing ? editing.emp : (emps[0]?.id || "");
  const filiais = filiaisDaEmpresa(empSel);
  const tipoContrato = editing ? editing.tipoContrato : "experiencia";
  const combo = editing ? (editing.experienciaCombo || "45-45") : "45-45";
  const meses = editing ? (editing.determinadoMeses || 12) : 12;
  const inicio = editing ? (editing.inicio || "") : "";

  return `<div class="adm-form">
    <div class="adm-form-title">${editing ? "✎ Editar admissão" : "＋ Nova admissão"}</div>
    <div class="adm-fg-grid">
      <div class="adm-fg"><label>Empresa *</label>
        <select data-f="emp">${emps.map(e => `<option value="${esc(e.id)}" ${e.id === empSel ? "selected" : ""}>${esc(e.label)}</option>`).join("")}</select>
      </div>
      <div class="adm-fg"><label>Filial/Unidade</label>
        <select data-f="filial"><option value="">— Nenhuma —</option>${filiais.map(f => `<option value="${esc(f.id)}" ${editing && editing.filial === f.id ? "selected" : ""}>${esc(f.label)}</option>`).join("")}</select>
      </div>
      <div class="adm-fg full"><label>Nome da colaboradora *</label><input type="text" data-f="colaborador" value="${esc(editing ? editing.colaborador : "")}" placeholder="Nome completo"></div>
      <div class="adm-fg full">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" data-f="recontratacao" ${editing && editing.recontratacao ? "checked" : ""} style="width:auto"> É uma recontratação (já trabalhou nesta empresa antes)?</label>
      </div>
      <div class="adm-fg full" data-recontrat-warn style="display:${editing && editing.recontratacao ? "block" : "none"}">
        <div class="adm-warn">⚠️ Consulte o CPF da colaboradora no eSocial da empresa. Se a recontratação for recente (cerca de 1 ano) e na mesma função, normalmente não se faz novo período de experiência — o contrato deve ser por prazo indeterminado.</div>
      </div>
      <div class="adm-fg full"><label>Tipo de contrato *</label>
        <div class="adm-radios">
          <label><input type="radio" name="admTipo" value="experiencia" data-f="tipoContrato" ${tipoContrato === "experiencia" ? "checked" : ""}> Prazo de Experiência</label>
          <label><input type="radio" name="admTipo" value="determinado" data-f="tipoContrato" ${tipoContrato === "determinado" ? "checked" : ""}> Prazo Determinado</label>
          <label><input type="radio" name="admTipo" value="indeterminado" data-f="tipoContrato" ${tipoContrato === "indeterminado" ? "checked" : ""}> Prazo Indeterminado</label>
        </div>
      </div>
      <div class="adm-fg" data-combo-wrap style="display:${tipoContrato === "experiencia" ? "flex" : "none"}"><label>Combinação da experiência</label>
        <select data-f="experienciaCombo">${Object.entries(COMBOS).map(([k, c]) => `<option value="${k}" ${combo === k ? "selected" : ""}>${c.label}</option>`).join("")}</select>
      </div>
      <div class="adm-fg" data-meses-wrap style="display:${tipoContrato === "determinado" ? "flex" : "none"}"><label>Duração (meses, máx. 24)</label>
        <input type="number" data-f="determinadoMeses" min="1" max="24" value="${meses}">
      </div>
      <div class="adm-fg"><label>Data de início *</label><input type="date" data-f="inicio" value="${esc(inicio)}"></div>
    </div>
    <div class="adm-preview" data-preview></div>
    <div class="adm-fg full"><label>Observação (opcional)</label><input type="text" data-f="observacao" value="${esc(editing ? (editing.observacao || "") : "")}"></div>
    <div class="adm-form-actions">
      <button class="adm-btn" data-action="form-cancel">Cancelar</button>
      <button class="adm-btn primary" data-action="form-save" data-val="${editing ? esc(editing.id) : ""}">💾 Salvar</button>
    </div>
  </div>`;
}

function readForm() {
  const f = mountEl.querySelector(".adm-form"); if (!f) return null;
  const get = sel => f.querySelector(`[data-f="${sel}"]`);
  const tipoRadio = f.querySelector('[data-f="tipoContrato"]:checked');
  return {
    emp: get("emp")?.value || "",
    filial: get("filial")?.value || "",
    colaborador: (get("colaborador")?.value || "").trim(),
    recontratacao: !!get("recontratacao")?.checked,
    tipoContrato: tipoRadio ? tipoRadio.value : "experiencia",
    experienciaCombo: get("experienciaCombo")?.value || "45-45",
    determinadoMeses: Number(get("determinadoMeses")?.value) || 12,
    inicio: get("inicio")?.value || "",
    observacao: (get("observacao")?.value || "").trim()
  };
}

function updatePreview() {
  const f = mountEl.querySelector(".adm-form"); if (!f) return;
  const data = readForm();
  const prev = f.querySelector("[data-preview]");
  if (!prev) return;
  if (!data.inicio) { prev.innerHTML = "Preencha a data de início pra ver as datas calculadas."; return; }
  const d = computeDatas(data);
  let html = `<b>📅 Datas calculadas (estimativa — confirme no Dexion/Domínio):</b><br>`;
  html += `Prazo pra enviar o S-2200: <b>${fmtDFull(d.prazoS2200)}</b><br>`;
  if (data.tipoContrato === "experiencia") {
    html += `Fim do 1º período: <b>${fmtDFull(d.fimPeriodo1)}</b><br>`;
    html += `Vencimento da experiência (fim da prorrogação): <b>${fmtDFull(d.vencimentoContrato)}</b>`;
  } else if (data.tipoContrato === "determinado") {
    html += `Término do contrato: <b>${fmtDFull(d.vencimentoContrato)}</b>`;
  } else {
    html += `Prazo indeterminado — sem data de término.`;
  }
  prev.innerHTML = html;
}

function wireFormEvents() {
  const f = mountEl.querySelector(".adm-form");
  if (f) {
    updatePreview();
    f.querySelector('[data-f="emp"]')?.addEventListener("change", e => {
      const filSel = f.querySelector('[data-f="filial"]');
      const filiais = filiaisDaEmpresa(e.target.value);
      filSel.innerHTML = '<option value="">— Nenhuma —</option>' + filiais.map(fl => `<option value="${esc(fl.id)}">${esc(fl.label)}</option>`).join("");
    });
    f.querySelectorAll('[data-f="tipoContrato"]').forEach(r => r.addEventListener("change", () => {
      const tipo = f.querySelector('[data-f="tipoContrato"]:checked')?.value;
      f.querySelector("[data-combo-wrap]").style.display = tipo === "experiencia" ? "flex" : "none";
      f.querySelector("[data-meses-wrap]").style.display = tipo === "determinado" ? "flex" : "none";
      updatePreview();
    }));
    f.querySelector('[data-f="recontratacao"]')?.addEventListener("change", e => {
      f.querySelector("[data-recontrat-warn]").style.display = e.target.checked ? "block" : "none";
    });
    ["experienciaCombo", "determinadoMeses", "inicio"].forEach(k => {
      f.querySelector(`[data-f="${k}"]`)?.addEventListener("input", updatePreview);
      f.querySelector(`[data-f="${k}"]`)?.addEventListener("change", updatePreview);
    });
  }
}

// ---- eventos (delegados no mountEl, registrados uma única vez) ----
function wireEvents() {
  mountEl.addEventListener("click", async e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const val = btn.dataset.val;

    if (action === "filter-emp") { filterEmp = val; render(); return; }
    if (action === "filter-status") { filterStatus = val; render(); return; }
    if (action === "toggle-form") { formOpen = !formOpen; editingId = null; render(); return; }
    if (action === "edit-start") { editingId = val; formOpen = true; render();
      mountEl.querySelector(".adm-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (action === "form-cancel") { formOpen = false; editingId = null; render(); return; }
    if (action === "form-save") {
      const data = readForm();
      if (!data.emp) { alert("Selecione a empresa."); return; }
      if (!data.colaborador) { alert("Informe o nome da colaboradora."); return; }
      if (!data.inicio) { alert("Informe a data de início."); return; }
      if (data.tipoContrato === "determinado" && data.determinadoMeses > 24) { alert("O prazo determinado não pode passar de 24 meses (2 anos)."); return; }
      const ok = await saveRecord(data, val || null);
      if (ok) { formOpen = false; editingId = null; render(); }
      return;
    }
    if (action === "toggle-card") {
      const set = getCardCollapsedSet();
      if (set.has(val)) set.delete(val); else set.add(val);
      setCardCollapsedSet(set); render(); return;
    }
    if (action === "delete-start") { confirmingDeleteId = val; render(); return; }
    if (action === "delete-cancel") { confirmingDeleteId = null; render(); return; }
    if (action === "delete-confirm") { confirmingDeleteId = null; await deleteRecord(val); return; }
  });

  mountEl.addEventListener("change", e => {
    if (e.target.matches('[data-action="toggle-passo"]')) {
      togglePasso(e.target.dataset.val, e.target.dataset.key);
      return;
    }
    if (e.target.matches('[data-action="periodo-sel"]')) { filterPeriodo = e.target.value; render(); return; }
    if (e.target.matches('[data-action="periodo-de"]')) { periodoDe = e.target.value; render(); return; }
    if (e.target.matches('[data-action="periodo-ate"]')) { periodoAte = e.target.value; render(); return; }
  });
}

// ---- API pública ----
export function initAdmissoes(c) {
  ctx = c;
  mountEl = document.getElementById("admissoesRoot");
  if (!mountEl) return () => {};
  wireEvents();
  subscribeAdmissoes();
  return function stopAdmissoes() {
    if (unsubAdmissoes) { unsubAdmissoes(); unsubAdmissoes = null; }
  };
}

export function renderAdmissoes() {
  render();
}
