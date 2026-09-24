// ============================================================================
// Dados & Acessos — módulo separado (não mexe no restante do index.html)
// Criado em 24/09/2026 a pedido do Leonardo: um lugar prático dentro da aba
// "Informações" pra reunir CNPJ, sistema (Dexion/Domínio), nº no sistema,
// diretora/responsável e contato de cada empresa/unidade — no mesmo formato
// da planilha "Cadastro de Clientes — Departamento Pessoal" que o Leonardo já
// usa, com um bloco por empresa (cor igual à cor da empresa no resto do app).
//
// Redesenhado em 24/09/2026 (5ª rodada), a pedido do Leonardo, depois que ele
// mandou prints da planilha real: os campos agora seguem exatamente o que tem
// lá (Sistema, Nº no Sistema, Matriz/Unidade, CNPJ, Diretora, E-mail,
// Telefone), reaproveitando a mesma lista de empresas/filiais e as mesmas
// cores já usadas em Desligamentos/Admissões/Fechamento. Também foi
// adicionado: (1) um botão dedicado — em formato de modal, igual ao "Novo
// Desligamento" — só pra cadastrar rapidamente usuário/senha do Empregador
// Web de uma empresa/unidade; e (2) botões pra baixar o modelo de planilha
// (Desligamentos/Pendências/Admissões) direto daqui.
//
// Mesmo padrão de fechamento.js/admissoes.js: dp.html chama initDadosAcessos(ctx)
// uma vez, depois do login, passando as funções do Firestore já importadas lá
// (agora incluindo getEmpresas()/getFiliais(), pra reaproveitar o mesmo
// cadastro usado em Desligamentos/Admissões). Este arquivo injeta seu próprio
// <style>, desenha dentro de #infoDadosRoot, escuta o Firestore em tempo real
// e trata os cliques.
//
// Atenção (importante pro Leonardo saber): os campos de acesso/senha ficam
// salvos como texto no Firestore, protegidos pelas mesmas regras de segurança
// do resto do app (só quem é do DP consegue ler) — não existe criptografia
// extra aqui, é o mesmo nível de proteção que o resto da Central Dias já tem.
// ============================================================================

const COLLECTION = "dados_acessos_dp";
const SISTEMAS = ["Dexion", "Domínio"];

// ---- estado do módulo ----
let ctx = null;
let mountEl = null;
let stylesInjected = false;
let unsubItems = null;
let itemsRaw = [];
let filterEmp = "all";
let searchTerm = "";
let editingId = null; // "__new__" pra criar, ou o id do doc sendo editado
let confirmingDeleteId = null;
let draft = {}; // campos do formulário aberto (novo ou edição)

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function getCollapsedGroups() {
  try { return new Set(JSON.parse(localStorage.getItem("cdDadosGruposColapsados") || "[]")); } catch (e) { return new Set(); }
}
function setCollapsedGroups(set) {
  try { localStorage.setItem("cdDadosGruposColapsados", JSON.stringify([...set])); } catch (e) {}
}

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
#dadosRoot{display:flex;flex-direction:column;gap:14px;}
#dadosRoot .dados-orient{background:var(--s2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:12px 14px;font-size:.76rem;color:var(--text2);line-height:1.55;}
#dadosRoot .dados-modelos{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--s2);border:1px dashed var(--border2);border-radius:8px;padding:10px 12px;}
#dadosRoot .dados-modelos .lbl{font-size:.72rem;color:var(--text3);font-weight:600;margin-right:2px;}
#dadosRoot .dados-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
#dadosRoot .dados-search{flex:1;min-width:160px;background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.8rem;padding:7px 10px;}
#dadosRoot .dados-btn{background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.76rem;padding:7px 11px;cursor:pointer;white-space:nowrap;}
#dadosRoot .dados-btn:hover{background:var(--s2);}
#dadosRoot .dados-btn.on{background:var(--accent2);color:#fff;border-color:var(--accent2);}
#dadosRoot .dados-btn.primary{background:var(--accent);color:#fff;border-color:var(--accent);}
#dadosRoot .dados-empty{font-size:.8rem;color:var(--text2);padding:14px;text-align:center;border:1px dashed var(--border2);border-radius:10px;}
#dadosRoot .dados-empsec{margin-bottom:6px;}
#dadosRoot .dados-emphd{display:flex;align-items:center;gap:8px;padding:8px 2px;cursor:pointer;user-select:none;border-bottom:2px solid var(--ec);margin-bottom:8px;}
#dadosRoot .dados-emphd .car{transition:transform .15s;color:var(--text3);font-size:.7rem;}
#dadosRoot .dados-empsec.collapsed .car{transform:rotate(-90deg);}
#dadosRoot .dados-empsec.collapsed .dados-empbody{display:none;}
#dadosRoot .dados-emphd .nome{font-weight:700;font-size:.86rem;color:var(--ec);}
#dadosRoot .dados-emphd .cnt{margin-left:auto;font-size:.7rem;color:var(--text2);}
#dadosRoot .dados-empbody{display:flex;flex-direction:column;gap:8px;}
#dadosRoot .dados-card{background:var(--s1);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;}
#dadosRoot .dados-card-head{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none;}
#dadosRoot .dados-card-head:hover{background:var(--s2);}
#dadosRoot .dados-card-head .car{transition:transform .15s;color:var(--text3);font-size:.7rem;}
#dadosRoot .dados-card.collapsed .car{transform:rotate(-90deg);}
#dadosRoot .dados-card-head .tit{font-weight:600;font-size:.84rem;color:var(--text);flex:1;}
#dadosRoot .dados-tag{font-size:.62rem;color:var(--text2);background:var(--s3);border:1px solid var(--border);border-radius:20px;padding:2px 9px;flex:none;}
#dadosRoot .dados-tag.matriz{background:rgba(124,111,205,.16);color:var(--accent2);border-color:transparent;font-weight:700;text-transform:uppercase;letter-spacing:.02em;}
#dadosRoot .dados-card.collapsed .dados-card-body{display:none;}
#dadosRoot .dados-card-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:8px;}
#dadosRoot .dados-row{display:flex;gap:8px;font-size:.78rem;color:var(--text);line-height:1.5;}
#dadosRoot .dados-row .lbl{flex:0 0 150px;color:var(--text3);font-size:.7rem;padding-top:2px;}
#dadosRoot .dados-row .val{flex:1;word-break:break-word;white-space:pre-wrap;}
#dadosRoot .dados-row .val.mono{font-family:ui-monospace,Menlo,Consolas,monospace;}
#dadosRoot .dados-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;}
#dadosRoot .dados-form{display:flex;flex-direction:column;gap:8px;padding:12px 14px;}
#dadosRoot .dados-form label{font-size:.68rem;color:var(--text3);margin-bottom:2px;display:block;}
#dadosRoot .dados-form input[type=text],#dadosRoot .dados-form select,#dadosRoot .dados-form textarea{width:100%;background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.8rem;padding:7px 9px;box-sizing:border-box;}
#dadosRoot .dados-form textarea{resize:vertical;min-height:52px;font-family:ui-monospace,Menlo,Consolas,monospace;}
#dadosRoot .dados-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
#dadosRoot .dados-radios{display:flex;gap:14px;flex-wrap:wrap;}
#dadosRoot .dados-radios label{display:flex;align-items:center;gap:5px;font-size:.76rem;color:var(--text);cursor:pointer;margin-bottom:0;}
#dadosRoot .dados-confirm{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--s2);font-size:.78rem;color:var(--text2);}
@media (max-width:640px){#dadosRoot .dados-grid2{grid-template-columns:1fr;}}
`;
  document.head.appendChild(style);
}

function subscribeItems() {
  if (unsubItems) { unsubItems(); unsubItems = null; }
  const { db, collection, onSnapshot } = ctx;
  unsubItems = onSnapshot(
    collection(db, COLLECTION),
    snap => { itemsRaw = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); },
    () => { itemsRaw = []; render(); }
  );
}

// ---- helpers de empresa/filial (reaproveita as mesmas listas de Desligamentos/Admissões) ----
function visEmpresas() {
  const all = ctx.getEmpresas() || [];
  return ctx.getIsAdmin() ? all : all.filter(e => !e.adminOnly);
}
function getEmpresa(id) {
  return (ctx.getEmpresas() || []).find(e => e.id === id) || { id, label: id || "—", color: "#888" };
}
function filiaisDaEmpresa(empId) {
  return (ctx.getFiliais() || []).filter(f => f.empId === empId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function emptyDraft() {
  const emps = visEmpresas();
  return { emp: emps[0]?.id || "", tipo: "unidade", unidade: "", sistema: SISTEMAS[0], numeroSistema: "", cnpj: "", diretora: "", email: "", telefone: "", usuarioWeb: "", senhaWeb: "", obs: "" };
}

async function saveDraft() {
  if (!draft.emp) { alert("Selecione a empresa."); return; }
  if (draft.tipo === "unidade" && !(draft.unidade || "").trim()) { alert("Informe o nome da unidade (ou marque \"Matriz\")."); return; }
  const { db, doc, collection, addDoc, updateDoc, serverTimestamp } = ctx;
  const user = ctx.getUser();
  const nome = ctx.getMembers().find(m => m.id === user?.uid)?.name || user?.displayName || user?.email || null;
  const payload = {
    emp: draft.emp,
    tipo: draft.tipo === "matriz" ? "matriz" : "unidade",
    unidade: draft.tipo === "matriz" ? "" : (draft.unidade || "").trim(),
    sistema: draft.sistema || "",
    numeroSistema: (draft.numeroSistema || "").trim(),
    cnpj: (draft.cnpj || "").trim(),
    diretora: (draft.diretora || "").trim(),
    email: (draft.email || "").trim(),
    telefone: (draft.telefone || "").trim(),
    usuarioWeb: (draft.usuarioWeb || "").trim(),
    senhaWeb: (draft.senhaWeb || "").trim(),
    obs: (draft.obs || "").trim(),
    updatedAt: serverTimestamp(),
    updatedBy: nome
  };
  try {
    if (editingId === "__new__") {
      await addDoc(collection(db, COLLECTION), { ...payload, createdAt: serverTimestamp(), createdBy: nome });
    } else {
      await updateDoc(doc(db, COLLECTION, editingId), payload);
    }
    editingId = null; draft = {};
  } catch (e) { alert("Não foi possível salvar. Tente novamente."); }
}

async function deleteItem(id) {
  const { db, doc, deleteDoc } = ctx;
  try { await deleteDoc(doc(db, COLLECTION, id)); } catch (e) {}
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text || ""); } catch (e) { /* sem permissão de clipboard — silencioso */ }
}

// ---- cadastro rápido de usuário/senha do Empregador Web (modal, igual ao "Novo Desligamento") ----
function openEmpregadorWebModal() {
  const emps = visEmpresas();
  if (!emps.length) { alert("Cadastre uma empresa antes (aba Desligamentos → Empresas)."); return; }
  const ov = document.createElement("div");
  ov.className = "modal-ov open";
  ov.innerHTML = `<div class="modal" style="max-width:460px">
    <h2>🔑 Cadastrar usuário/senha do Empregador Web</h2>
    <p style="font-size:.78rem;color:var(--text2);margin:-6px 0 12px">Só os dados de acesso ao Empregador Web. Se a empresa/unidade já tiver um card em Dados &amp; Acessos, os outros campos dele não são alterados.</p>
    <div class="fg-grid">
      <div class="fg"><label>Empresa *</label>
        <select id="ew-emp">${emps.map(e => `<option value="${esc(e.id)}">${esc(e.label)}</option>`).join("")}</select>
      </div>
      <div class="fg"><label>É a Matriz ou uma Unidade? *</label>
        <select id="ew-tipo">
          <option value="unidade">Unidade</option>
          <option value="matriz">Matriz</option>
        </select>
      </div>
      <div class="fg full" id="ew-unidade-wrap"><label>Nome da unidade *</label>
        <input type="text" id="ew-unidade" list="ew-unidade-list" placeholder="Ex.: ALECRIM, JOCKEY...">
        <datalist id="ew-unidade-list"></datalist>
      </div>
      <div class="fg full"><label>Usuário (Empregador Web) *</label><input type="text" id="ew-usuario"></div>
      <div class="fg full"><label>Senha (Empregador Web) *</label><input type="text" id="ew-senha"></div>
    </div>
    <div class="mf-row">
      <button class="btn-cancel" id="ew-cancel">Cancelar</button>
      <button class="btn-save-m" id="ew-save">💾 Salvar</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
  ov.querySelector("#ew-cancel").addEventListener("click", () => ov.remove());

  const empSel = ov.querySelector("#ew-emp");
  const tipoSel = ov.querySelector("#ew-tipo");
  const unidadeWrap = ov.querySelector("#ew-unidade-wrap");
  const unidadeInp = ov.querySelector("#ew-unidade");
  const unidadeList = ov.querySelector("#ew-unidade-list");

  function refreshUnidades() {
    const filiais = filiaisDaEmpresa(empSel.value);
    unidadeList.innerHTML = filiais.map(f => `<option value="${esc(f.label)}"></option>`).join("");
  }
  function refreshTipo() {
    unidadeWrap.style.display = tipoSel.value === "matriz" ? "none" : "block";
  }
  empSel.addEventListener("change", refreshUnidades);
  tipoSel.addEventListener("change", refreshTipo);
  refreshUnidades(); refreshTipo();

  ov.querySelector("#ew-save").addEventListener("click", async () => {
    const emp = empSel.value;
    const tipo = tipoSel.value === "matriz" ? "matriz" : "unidade";
    const unidade = tipo === "matriz" ? "" : unidadeInp.value.trim();
    const usuarioWeb = ov.querySelector("#ew-usuario").value.trim();
    const senhaWeb = ov.querySelector("#ew-senha").value.trim();
    if (tipo === "unidade" && !unidade) { alert("Informe o nome da unidade."); return; }
    if (!usuarioWeb || !senhaWeb) { alert("Preencha usuário e senha."); return; }

    const existing = itemsRaw.find(it => it.emp === emp && (it.tipo || "unidade") === tipo &&
      (tipo === "matriz" || (it.unidade || "").trim().toUpperCase() === unidade.toUpperCase()));

    const { db, doc, collection, addDoc, updateDoc, serverTimestamp } = ctx;
    const user = ctx.getUser();
    const nome = ctx.getMembers().find(m => m.id === user?.uid)?.name || user?.displayName || user?.email || null;
    try {
      if (existing) {
        await updateDoc(doc(db, COLLECTION, existing.id), { usuarioWeb, senhaWeb, updatedAt: serverTimestamp(), updatedBy: nome });
      } else {
        await addDoc(collection(db, COLLECTION), {
          emp, tipo, unidade, sistema: "", numeroSistema: "", cnpj: "", diretora: "", email: "", telefone: "",
          usuarioWeb, senhaWeb, obs: "",
          createdAt: serverTimestamp(), createdBy: nome, updatedAt: serverTimestamp(), updatedBy: nome
        });
      }
      ov.remove();
    } catch (e) { alert("Não foi possível salvar: " + (e?.message || e)); }
  });
}

// ---- modelos de planilha (mesmo formato lido pelos importadores de Desligamentos/Pendências/Admissões) ----
function baixarModelo(tipo) {
  if (!window.XLSX) { alert("A biblioteca de Excel ainda não carregou. Aguarde um instante e tente de novo."); return; }
  let headers, exemplo, nomeAba, nomeArquivo;
  if (tipo === "desligamentos") {
    headers = ["Instituição", "Filial", "Colaborador", "Tipo de Dispensa", "Início", "Término", "Vencimento", "Pagamento", "Descontos", "Homologação"];
    exemplo = ["CEDAP", "ALECRIM", "Maria da Silva", "Término de Contrato", "01/09/2026", "30/09/2026", "10/10/2026", "Pendente", "", "05/09/2026 14:30"];
    nomeAba = "Modelo Desligamentos"; nomeArquivo = "modelo_importacao_desligamentos.xlsx";
  } else if (tipo === "pendencias") {
    headers = ["Instituição", "DRE", "Responsável", "Filial", "Trimestre", "Recebimento", "Entrega", "Descrição", "Observação", "Status"];
    exemplo = ["CEDAP", "Butantã", "", "ALECRIM", "3º TRI 2026", "01/10/2026", "20/10/2026", "Envio de guias trimestrais", "", "Não iniciado"];
    nomeAba = "Modelo Pendencias"; nomeArquivo = "modelo_importacao_pendencias.xlsx";
  } else {
    headers = ["Instituição", "Filial", "Colaboradora", "Cargo", "Início", "Matrícula", "Matrícula eSocial", "Experiência", "Prorrogação Experiência"];
    exemplo = ["CEDAP", "ALECRIM", "Maria da Silva", "Auxiliar Administrativo", "01/09/2026", "1234", "987654321", "15/10/2026", "30/11/2026"];
    nomeAba = "Modelo Admissoes"; nomeArquivo = "modelo_importacao_admissoes.xlsx";
  }
  const ws = window.XLSX.utils.aoa_to_sheet([headers, exemplo]);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, nomeAba);
  window.XLSX.writeFile(wb, nomeArquivo);
}

// ---- render ----
function render() {
  if (!mountEl) return;
  ensureStyles();
  const termo = searchTerm.trim().toLowerCase();
  let lista = itemsRaw.filter(it => {
    if (filterEmp !== "all" && it.emp !== filterEmp) return false;
    if (termo) {
      const alvo = [(it.unidade || ""), (it.diretora || ""), (it.cnpj || ""), (it.numeroSistema || "")].join(" ").toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });

  let html = "";
  html += `<div class="dados-orient"><b>Orientação.</b> Guarde aqui o cadastro de cada empresa/unidade (Sistema, Nº no Sistema, CNPJ, Diretora responsável, contato) e, se precisar, o usuário/senha do Empregador Web. Essas informações ficam protegidas pelas mesmas regras de acesso do resto da Central Dias — só quem é do DP consegue ver.</div>`;

  html += `<div class="dados-modelos"><span class="lbl">📎 Modelos de planilha para importação:</span>
    <button class="dados-btn" data-action="modelo" data-val="desligamentos">Desligamentos</button>
    <button class="dados-btn" data-action="modelo" data-val="pendencias">Pendências</button>
    <button class="dados-btn" data-action="modelo" data-val="admissoes">Admissões</button>
  </div>`;

  const emps = visEmpresas();
  html += `<div class="dados-toolbar">
    <input type="text" class="dados-search" placeholder="Buscar por unidade, diretora, CNPJ ou nº no sistema..." value="${esc(searchTerm)}" data-action="search">
    <button class="dados-btn ${filterEmp === "all" ? "on" : ""}" data-action="filter-emp" data-val="all">Todas</button>
    ${emps.map(e => `<button class="dados-btn ${filterEmp === e.id ? "on" : ""}" data-action="filter-emp" data-val="${esc(e.id)}" style="${filterEmp === e.id ? `background:${e.color}22;border-color:${e.color};color:${e.color};` : ""}">${esc(e.label)}</button>`).join("")}
  </div>`;

  html += `<div class="dados-toolbar">
    <button class="dados-btn" data-action="empregador-web" style="margin-left:auto">🔑 Cadastrar usuário/senha do Empregador Web</button>
    <button class="dados-btn primary" data-action="add-start">＋ Novo card</button>
  </div>`;

  if (editingId === "__new__") html += renderForm();

  if (!lista.length && editingId !== "__new__") {
    html += `<div class="dados-empty">Nenhuma informação cadastrada ainda${termo || filterEmp !== "all" ? " com esse filtro" : ""}. Clique em "＋ Novo card" pra começar.</div>`;
  } else {
    const byEmp = {};
    lista.forEach(it => { (byEmp[it.emp] || (byEmp[it.emp] = [])).push(it); });
    const collapsedGroups = getCollapsedGroups();
    // mantém a mesma ordem das empresas cadastradas (visEmpresas), depois quem sobrar (empresa apagada, por ex.)
    const empIds = [...emps.map(e => e.id), ...Object.keys(byEmp).filter(id => !emps.some(e => e.id === id))];
    empIds.forEach(empId => {
      const items = byEmp[empId];
      if (!items || !items.length) return;
      const emp = getEmpresa(empId);
      const collapsed = collapsedGroups.has(empId);
      items.sort((a, b) => {
        const am = (a.tipo || "unidade") === "matriz", bm = (b.tipo || "unidade") === "matriz";
        if (am !== bm) return am ? -1 : 1;
        return (a.unidade || "").localeCompare(b.unidade || "");
      });
      html += `<div class="dados-empsec ${collapsed ? "collapsed" : ""}" style="--ec:${emp.color || "#888"}">
        <div class="dados-emphd" data-action="toggle-group" data-val="${esc(empId)}">
          <span class="car">▾</span><span class="nome">${esc(emp.label)}</span><span class="cnt">${items.length}</span>
        </div>
        <div class="dados-empbody">`;
      items.forEach(it => {
        if (editingId === it.id) { html += renderForm(it.id); return; }
        if (confirmingDeleteId === it.id) { html += renderConfirmDelete(it); return; }
        html += renderCard(it);
      });
      html += `</div></div>`;
    });
  }

  mountEl.innerHTML = html;
}

function renderCard(it) {
  const titulo = (it.tipo || "unidade") === "matriz" ? "MATRIZ" : (it.unidade || "(sem nome de unidade)");
  let html = `<div class="dados-card" data-id="${esc(it.id)}">
    <div class="dados-card-head" data-action="toggle-collapse" data-val="${esc(it.id)}">
      <span class="car">▾</span>
      <span class="tit">${esc(titulo)}</span>
      ${(it.tipo || "unidade") === "matriz" ? `<span class="dados-tag matriz">Matriz</span>` : ""}
      ${it.sistema ? `<span class="dados-tag">${esc(it.sistema)}</span>` : ""}
    </div>
    <div class="dados-card-body">`;
  const campos = [
    ["Nº no Sistema", it.numeroSistema, "mono"], ["CNPJ", it.cnpj, "mono"], ["Diretora/Responsável", it.diretora, ""],
    ["Telefone", it.telefone, "mono"], ["E-mail", it.email, "mono"]
  ];
  campos.forEach(([lbl, val, cls]) => {
    if (!val) return;
    html += `<div class="dados-row"><span class="lbl">${esc(lbl)}</span><span class="val ${cls}">${esc(val)}</span></div>`;
  });
  if (it.usuarioWeb || it.senhaWeb) {
    html += `<div class="dados-row"><span class="lbl">🔑 Empregador Web</span><span class="val mono">${it.usuarioWeb ? `Usuário: ${esc(it.usuarioWeb)}` : ""}${it.usuarioWeb && it.senhaWeb ? " · " : ""}${it.senhaWeb ? `Senha: ${esc(it.senhaWeb)}` : ""}</span></div>`;
  }
  if (it.obs) {
    html += `<div class="dados-row"><span class="lbl">Observações</span><span class="val">${esc(it.obs)}</span></div>`;
  }
  html += `<div class="dados-actions">
    ${(it.usuarioWeb || it.senhaWeb) ? `<button class="dados-btn" data-action="copy-web" data-val="${esc(it.id)}">📋 Copiar usuário/senha</button>` : ""}
    <button class="dados-btn" data-action="edit-start" data-val="${esc(it.id)}">✏️ Editar</button>
    <button class="dados-btn" data-action="delete-start" data-val="${esc(it.id)}">🗑️ Excluir</button>
  </div>`;
  html += `</div></div>`;
  return html;
}

function renderConfirmDelete(it) {
  const titulo = (it.tipo || "unidade") === "matriz" ? `MATRIZ — ${getEmpresa(it.emp).label}` : it.unidade;
  return `<div class="dados-card"><div class="dados-confirm">
    <span>Excluir "${esc(titulo)}"? Essa ação não pode ser desfeita.</span>
    <button class="dados-btn primary" data-action="delete-confirm" data-val="${esc(it.id)}" style="margin-left:auto">Excluir</button>
    <button class="dados-btn" data-action="delete-cancel">Cancelar</button>
  </div></div>`;
}

function renderForm(id) {
  const d = id ? { ...(itemsRaw.find(x => x.id === id) || {}), ...draft } : (Object.keys(draft).length ? draft : emptyDraft());
  const emps = visEmpresas();
  const empSel = d.emp || emps[0]?.id || "";
  const tipo = d.tipo === "matriz" ? "matriz" : "unidade";
  const filiais = filiaisDaEmpresa(empSel);
  return `<div class="dados-card"><div class="dados-form">
    <div class="dados-grid2">
      <div><label>Empresa *</label><select data-f="emp">${emps.map(e => `<option value="${esc(e.id)}" ${e.id === empSel ? "selected" : ""}>${esc(e.label)}</option>`).join("")}</select></div>
      <div><label>É a Matriz ou uma Unidade? *</label>
        <div class="dados-radios" style="padding:7px 0">
          <label><input type="radio" name="dadosTipo" value="unidade" data-f="tipo" ${tipo === "unidade" ? "checked" : ""}> Unidade</label>
          <label><input type="radio" name="dadosTipo" value="matriz" data-f="tipo" ${tipo === "matriz" ? "checked" : ""}> Matriz</label>
        </div>
      </div>
    </div>
    <div data-unidade-wrap style="display:${tipo === "unidade" ? "block" : "none"}">
      <label>Nome da unidade *</label>
      <input type="text" data-f="unidade" list="dadosUnidadesList" value="${esc(d.unidade || "")}" placeholder="Ex.: ALECRIM, JOCKEY...">
      <datalist id="dadosUnidadesList">${filiais.map(f => `<option value="${esc(f.label)}"></option>`).join("")}</datalist>
    </div>
    <div class="dados-grid2">
      <div><label>Sistema</label><select data-f="sistema"><option value="">—</option>${SISTEMAS.map(s => `<option value="${esc(s)}" ${d.sistema === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
      <div><label>Nº no Sistema</label><input type="text" data-f="numeroSistema" value="${esc(d.numeroSistema || "")}"></div>
      <div><label>CNPJ</label><input type="text" data-f="cnpj" value="${esc(d.cnpj || "")}"></div>
      <div><label>Diretora/Responsável</label><input type="text" data-f="diretora" value="${esc(d.diretora || "")}"></div>
      <div><label>Telefone (CEI/cel. diretora)</label><input type="text" data-f="telefone" value="${esc(d.telefone || "")}"></div>
      <div><label>E-mail</label><input type="text" data-f="email" value="${esc(d.email || "")}"></div>
    </div>
    <div class="dados-grid2">
      <div><label>Usuário (Empregador Web)</label><input type="text" data-f="usuarioWeb" value="${esc(d.usuarioWeb || "")}"></div>
      <div><label>Senha (Empregador Web)</label><input type="text" data-f="senhaWeb" value="${esc(d.senhaWeb || "")}"></div>
    </div>
    <div><label>Observações</label><textarea data-f="obs">${esc(d.obs || "")}</textarea></div>
    <div class="dados-actions">
      <button class="dados-btn primary" data-action="edit-save" data-val="${esc(id || "__new__")}">💾 Salvar</button>
      <button class="dados-btn" data-action="edit-cancel">Cancelar</button>
    </div>
  </div></div>`;
}

function readFormInto(container) {
  container.querySelectorAll("[data-f]").forEach(el => {
    if (el.type === "radio") { if (el.checked) draft[el.dataset.f] = el.value; }
    else draft[el.dataset.f] = el.value;
  });
}

// ---- eventos ----
function wireEvents() {
  mountEl.addEventListener("click", async e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const val = btn.dataset.val;

    if (action === "modelo") { baixarModelo(val); return; }
    if (action === "empregador-web") { openEmpregadorWebModal(); return; }
    if (action === "filter-emp") { filterEmp = val; render(); return; }
    if (action === "toggle-group") {
      const set = getCollapsedGroups();
      if (set.has(val)) set.delete(val); else set.add(val);
      setCollapsedGroups(set); render(); return;
    }
    if (action === "toggle-collapse") {
      const card = mountEl.querySelector(`.dados-card[data-id="${CSS.escape(val)}"]`);
      card?.classList.toggle("collapsed"); return;
    }
    if (action === "add-start") { editingId = "__new__"; draft = emptyDraft(); confirmingDeleteId = null; render(); return; }
    if (action === "edit-start") { editingId = val; draft = {}; confirmingDeleteId = null; render(); return; }
    if (action === "edit-cancel") { editingId = null; draft = {}; render(); return; }
    if (action === "edit-save") {
      const form = btn.closest(".dados-form");
      if (form) readFormInto(form);
      await saveDraft(); render(); return;
    }
    if (action === "delete-start") { confirmingDeleteId = val; editingId = null; render(); return; }
    if (action === "delete-cancel") { confirmingDeleteId = null; render(); return; }
    if (action === "delete-confirm") { confirmingDeleteId = null; await deleteItem(val); return; }
    if (action === "copy-web") {
      const it = itemsRaw.find(x => x.id === val);
      if (it) await copyToClipboard(`Usuário: ${it.usuarioWeb || ""}\nSenha: ${it.senhaWeb || ""}`);
      return;
    }
  });

  mountEl.addEventListener("change", e => {
    if (e.target.matches('[data-f="emp"]')) {
      const form = e.target.closest(".dados-form");
      if (form) {
        readFormInto(form);
        render();
      }
      return;
    }
    if (e.target.matches('[data-f="tipo"]')) {
      const form = e.target.closest(".dados-form");
      if (form) {
        const wrap = form.querySelector("[data-unidade-wrap]");
        if (wrap) wrap.style.display = e.target.value === "unidade" ? "block" : "none";
      }
      return;
    }
  });

  mountEl.addEventListener("input", e => {
    if (e.target.matches('[data-action="search"]')) { searchTerm = e.target.value; render();
      const inp = mountEl.querySelector('[data-action="search"]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      return;
    }
  });
}

// ---- API pública ----
export function initDadosAcessos(c) {
  ctx = c;
  mountEl = document.getElementById("infoDadosRoot");
  if (!mountEl) return () => {};
  wireEvents();
  subscribeItems();
  return function stopDadosAcessos() {
    if (unsubItems) { unsubItems(); unsubItems = null; }
  };
}

export function renderInfoDados() {
  render();
}
