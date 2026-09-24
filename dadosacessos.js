// ============================================================================
// Dados & Acessos — módulo separado (não mexe no restante do index.html)
// Criado em 24/09/2026 a pedido do Leonardo: um lugar prático dentro da aba
// "Informações" pra reunir CNPJ, sistema (Dexion/Domínio), nº no sistema,
// diretora/responsável e contato de cada empresa/unidade — no mesmo formato
// da planilha "Cadastro de Clientes — Departamento Pessoal" que o Leonardo já
// usa, com um bloco por empresa (cor igual à cor da empresa no resto do app).
//
// Redesenhado em 24/09/2026 (6ª rodada): campos passaram a seguir a planilha
// real (Sistema, Nº no Sistema, Matriz/Unidade, CNPJ, Diretora, E-mail,
// Telefone) e ganhou o modal de cadastro rápido do Empregador Web.
//
// Redesenhado de novo em 24/09/2026 (7ª rodada), a pedido do Leonardo — ele
// reportou que a tela estava "feia"/"antiquada". Causa raiz encontrada: o
// CSS deste arquivo estava todo escopado em `#dadosRoot`, mas o elemento
// onde o módulo é montado (por `dp.html`) sempre foi `#infoDadosRoot` — ou
// seja, NENHUM estilo deste arquivo nunca chegou a valer, desde a criação da
// aba; por isso tudo aparecia com a aparência padrão (não estilizada) do
// navegador. Esse bug existia mesmo antes desta rodada e passou despercebido
// nos testes anteriores porque a tela de fato funcionava — só não tinha a
// aparência do resto do app. Corrigido nesta rodada, junto com: (1) troca do
// layout de cards empilhados por uma tabela compacta por empresa (mais
// parecida com a planilha que o Leonardo já usa e mais fácil de escanear);
// (2) cadastro/edição completos também viraram modal (`.modal-ov`/`.modal`,
// igual ao resto do app), no lugar do formulário que ficava expandido dentro
// do card; (3) importação por colar (Ctrl+C na planilha do Leonardo, Ctrl+V
// aqui), no mesmo espírito de Desligamentos/Pendências — como a planilha
// dele organiza os dados em blocos por empresa (cor), sem uma coluna
// "Empresa" própria, o colar aqui pede primeiro qual empresa daquele bloco
// (botão "📋 Colar dados" em cada grupo) e depois processa o Ctrl+V.
//
// Mesmo padrão de fechamento.js/admissoes.js: dp.html chama initDadosAcessos(ctx)
// uma vez, depois do login, passando as funções do Firestore já importadas lá
// (incluindo getEmpresas()/getFiliais(), pra reaproveitar o mesmo cadastro de
// empresas/filiais usado em Desligamentos/Admissões). Este arquivo injeta seu
// próprio <style>, desenha dentro de #infoDadosRoot, escuta o Firestore em
// tempo real e trata os cliques.
//
// Atenção (importante pro Leonardo saber): os campos de acesso/senha ficam
// salvos como texto no Firestore, protegidos pelas mesmas regras de segurança
// do resto do app (só quem é do DP consegue ler) — não existe criptografia
// extra aqui, é o mesmo nível de proteção que o resto da Central Dias já tem.
// ============================================================================

const COLLECTION = "dados_acessos_dp";
const SISTEMAS = ["Dexion", "Domínio"];
const MOUNT_ID = "infoDadosRoot"; // id real do elemento onde dp.html monta este módulo

// ---- estado do módulo ----
let ctx = null;
let mountEl = null;
let stylesInjected = false;
let unsubItems = null;
let itemsRaw = [];
let searchTerm = "";
let pasteTargetEmp = ""; // empresa "armada" pra receber o próximo Ctrl+V colado

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function normalizeStr(s) {
  return String(s == null ? "" : s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim().toUpperCase().replace(/\s+/g, " ");
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
#${MOUNT_ID}{display:flex;flex-direction:column;gap:14px;}
#${MOUNT_ID} .dse-orient{background:var(--s2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;padding:12px 14px;font-size:.76rem;color:var(--text2);line-height:1.55;}
#${MOUNT_ID} .dse-modelos{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--s2);border:1px dashed var(--border2);border-radius:8px;padding:10px 12px;}
#${MOUNT_ID} .dse-modelos .lbl{font-size:.72rem;color:var(--text3);font-weight:600;margin-right:2px;}
#${MOUNT_ID} .dse-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
#${MOUNT_ID} .dse-search{flex:1;min-width:160px;background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.8rem;padding:7px 10px;}
#${MOUNT_ID} .dse-btn{background:var(--s3);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit;font-size:.76rem;padding:7px 11px;cursor:pointer;white-space:nowrap;}
#${MOUNT_ID} .dse-btn:hover{background:var(--s2);}
#${MOUNT_ID} .dse-btn.on{background:var(--accent2);color:#fff;border-color:var(--accent2);}
#${MOUNT_ID} .dse-btn.primary{background:var(--accent);color:#0f0f13;border-color:var(--accent);font-weight:600;}
#${MOUNT_ID} .dse-btn.small{font-size:.68rem;padding:4px 9px;}
#${MOUNT_ID} .dse-btn.ghost{background:transparent;}
#${MOUNT_ID} .dse-pastebanner{display:flex;align-items:center;gap:8px;background:rgba(124,111,205,.14);border:1px solid var(--accent2);border-radius:8px;padding:9px 12px;font-size:.78rem;color:var(--text);}
#${MOUNT_ID} .dse-pastebanner b{color:var(--accent2);}
#${MOUNT_ID} .dse-empty{font-size:.8rem;color:var(--text2);padding:14px;text-align:center;border:1px dashed var(--border2);border-radius:10px;}
#${MOUNT_ID} .dse-group{background:var(--s1);border:1px solid var(--border);border-left:4px solid var(--ec,var(--border));border-radius:var(--r);overflow:hidden;}
#${MOUNT_ID} .dse-grouphd{display:flex;align-items:center;gap:9px;padding:10px 14px;cursor:pointer;user-select:none;}
#${MOUNT_ID} .dse-grouphd:hover{background:var(--s2);}
#${MOUNT_ID} .dse-grouphd .car{transition:transform .15s;color:var(--text3);font-size:.7rem;}
#${MOUNT_ID} .dse-group.collapsed .car{transform:rotate(-90deg);}
#${MOUNT_ID} .dse-group.collapsed .dse-groupbody{display:none;}
#${MOUNT_ID} .dse-grouphd .nome{font-weight:700;font-size:.86rem;color:var(--ec);}
#${MOUNT_ID} .dse-grouphd .cnt{font-size:.7rem;color:var(--text2);}
#${MOUNT_ID} .dse-grouphd .sp{flex:1;}
#${MOUNT_ID} .dse-groupbody{overflow-x:auto;}
#${MOUNT_ID} table.dse-table{width:100%;border-collapse:collapse;font-size:.78rem;}
#${MOUNT_ID} table.dse-table th{text-align:left;font-size:.66rem;text-transform:uppercase;letter-spacing:.03em;color:var(--text3);font-weight:700;padding:6px 10px;border-bottom:1px solid var(--border);white-space:nowrap;}
#${MOUNT_ID} table.dse-table td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text);vertical-align:middle;white-space:nowrap;}
#${MOUNT_ID} table.dse-table tbody tr:last-child td{border-bottom:none;}
#${MOUNT_ID} table.dse-table tbody tr:hover td{background:var(--s2);}
#${MOUNT_ID} table.dse-table td.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.74rem;color:var(--text2);}
#${MOUNT_ID} table.dse-table td.unidade{font-weight:600;}
#${MOUNT_ID} .dse-matriz-badge{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;background:rgba(124,111,205,.16);color:var(--accent2);border-radius:20px;padding:2px 8px;margin-left:6px;}
#${MOUNT_ID} .dse-keydot{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;cursor:pointer;border:1px solid transparent;font-size:.8rem;}
#${MOUNT_ID} .dse-keydot.filled{background:rgba(76,175,125,.16);}
#${MOUNT_ID} .dse-keydot:hover{border-color:var(--border2);background:var(--s3);}
#${MOUNT_ID} .dse-rowactions{display:flex;gap:2px;justify-content:flex-end;}
#${MOUNT_ID} .dse-ibtn{background:none;border:1px solid transparent;color:var(--text3);cursor:pointer;font-size:.76rem;padding:4px 7px;border-radius:6px;line-height:1;}
#${MOUNT_ID} .dse-ibtn:hover{background:var(--s3);color:var(--text);border-color:var(--border2);}
#${MOUNT_ID} .dse-confirmrow td{background:rgba(224,92,92,.08);}
#${MOUNT_ID} .dse-confirmrow .dse-confirmtxt{display:flex;align-items:center;gap:8px;font-size:.76rem;color:var(--urg);white-space:normal;}
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
function currentUserName() {
  const user = ctx.getUser();
  return ctx.getMembers().find(m => m.id === user?.uid)?.name || user?.displayName || user?.email || null;
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text || ""); } catch (e) { /* sem permissão de clipboard — silencioso */ }
}

async function deleteItem(id) {
  const { db, doc, deleteDoc } = ctx;
  try { await deleteDoc(doc(db, COLLECTION, id)); } catch (e) {}
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

// ---- colar (Ctrl+V) direto do bloco da planilha "Cadastro de Clientes" ----
// A planilha do Leonardo organiza os dados em blocos coloridos por empresa, sem uma coluna
// "Empresa" própria (a empresa é o próprio bloco) — por isso o fluxo aqui é: escolhe a empresa
// daquele bloco (botão "📋 Colar dados" no grupo), copia o bloco inteiro (com cabeçalho) na
// planilha, e cola (Ctrl+V) nesta tela.
function getRowField(row, ...names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const found = keys.find(k => normalizeStr(k) === normalizeStr(name));
    if (found !== undefined) return (row[found] ?? "").toString();
  }
  return "";
}
function looksLikeHeaderCells(cells) {
  const norm = (cells || []).map(c => normalizeStr(c));
  return norm.some(c => c === "SISTEMA") && norm.some(c => c === "UNIDADE");
}
function parseTSVToRowsSmart(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.length);
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (looksLikeHeaderCells(lines[i].split("\t"))) { headerIdx = i; break; }
  }
  const headers = lines[headerIdx].split("\t").map(h => h.trim());
  return lines.slice(headerIdx + 1).map(line => {
    const cells = line.split("\t");
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] !== undefined ? cells[i] : ""; });
    return obj;
  });
}
async function processPastedRows(empId, rows) {
  const emp = getEmpresa(empId);
  const { db, doc, collection, addDoc, updateDoc, serverTimestamp } = ctx;
  const nome = currentUserName();
  let novos = 0, atualizados = 0, ignorados = 0;
  for (const row of rows) {
    const unidadeRaw = getRowField(row, "Unidade").trim();
    const unidadeNorm = normalizeStr(unidadeRaw);
    const tipo = (!unidadeNorm || unidadeNorm === "MATRIZ") ? "matriz" : "unidade";
    const unidade = tipo === "matriz" ? "" : unidadeRaw;
    const sistema = getRowField(row, "Sistema").trim();
    const numeroSistema = getRowField(row, "Nº no Sistema", "No Sistema", "N Sistema", "Numero no Sistema", "Número no Sistema", "N° no Sistema").trim();
    const cnpj = getRowField(row, "CNPJ").trim();
    const diretora = getRowField(row, "Diretora Responsável", "Diretora", "Responsável", "Responsavel").trim();
    const email = getRowField(row, "E-mail", "Email").trim();
    const telefone = getRowField(row, "Telefone CEI/Cel Diretora", "Telefone", "Cel Diretora", "Celular", "Cel").trim();
    if (!sistema && !numeroSistema && !cnpj && !diretora && !email && !telefone && tipo === "unidade" && !unidade) { ignorados++; continue; }

    const existing = itemsRaw.find(it => it.emp === empId && (it.tipo || "unidade") === tipo &&
      (tipo === "matriz" || (it.unidade || "").trim().toUpperCase() === unidade.toUpperCase()));
    try {
      if (existing) {
        const patch = { updatedAt: serverTimestamp(), updatedBy: nome };
        if (sistema) patch.sistema = sistema;
        if (numeroSistema) patch.numeroSistema = numeroSistema;
        if (cnpj) patch.cnpj = cnpj;
        if (diretora) patch.diretora = diretora;
        if (email) patch.email = email;
        if (telefone) patch.telefone = telefone;
        await updateDoc(doc(db, COLLECTION, existing.id), patch);
        atualizados++;
      } else {
        await addDoc(collection(db, COLLECTION), {
          emp: empId, tipo, unidade, sistema, numeroSistema, cnpj, diretora, email, telefone,
          usuarioWeb: "", senhaWeb: "", obs: "",
          createdAt: serverTimestamp(), createdBy: nome, updatedAt: serverTimestamp(), updatedBy: nome
        });
        novos++;
      }
    } catch (e) { ignorados++; }
  }
  alert(`Importação de "${emp.label}" concluída!\n\n✅ ${novos} novo(s)\n🔄 ${atualizados} atualizado(s)\n${ignorados ? `⚠️ ${ignorados} linha(s) ignorada(s) (vazias ou com erro)\n` : ""}`);
}
function armarColagem(empId) {
  pasteTargetEmp = empId;
  render();
}
function handleGlobalPaste(e) {
  const activeView = document.querySelector(".view.active");
  if (!activeView || activeView.id !== "view-dados") return;
  if (!pasteTargetEmp) return;
  if (["INPUT", "TEXTAREA"].includes(e.target.tagName) || e.target.isContentEditable) return;
  const text = e.clipboardData?.getData("text/plain") || "";
  if (!text || !text.includes("\t")) return; // só age se parecer uma tabela colada do Excel (com tabulações)
  e.preventDefault();
  const rows = parseTSVToRowsSmart(text);
  const emp = getEmpresa(pasteTargetEmp);
  if (!rows.length) { alert("Não consegui reconhecer os dados colados. Copie o bloco inteiro, incluindo a linha de cabeçalho (Sistema, Nº no Sistema, Unidade, CNPJ, Diretora Responsável, E-mail, Telefone)."); return; }
  if (!confirm(`Foram detectadas ${rows.length} linha(s) coladas. Importar como unidades de "${emp.label}"?`)) return;
  const empId = pasteTargetEmp;
  pasteTargetEmp = "";
  processPastedRows(empId, rows).then(render);
  render();
}

// ---- modal de cadastro/edição completo (substitui o formulário expansível antigo) ----
function openCardModal(id) {
  const emps = visEmpresas();
  if (!emps.length) { alert("Cadastre uma empresa antes (aba Desligamentos → Empresas)."); return; }
  const editing = id ? itemsRaw.find(x => x.id === id) : null;
  const empSel0 = editing ? editing.emp : emps[0]?.id;
  const tipo0 = editing && editing.tipo === "matriz" ? "matriz" : "unidade";

  const ov = document.createElement("div");
  ov.className = "modal-ov open";
  ov.innerHTML = `<div class="modal" style="max-width:520px">
    <h2>${editing ? "✏️ Editar cadastro" : "＋ Novo cadastro"}</h2>
    <div class="fg-grid">
      <div class="fg"><label>Empresa *</label>
        <select id="dc-emp">${emps.map(e => `<option value="${esc(e.id)}" ${e.id === empSel0 ? "selected" : ""}>${esc(e.label)}</option>`).join("")}</select>
      </div>
      <div class="fg"><label>É a Matriz ou uma Unidade? *</label>
        <select id="dc-tipo">
          <option value="unidade" ${tipo0 === "unidade" ? "selected" : ""}>Unidade</option>
          <option value="matriz" ${tipo0 === "matriz" ? "selected" : ""}>Matriz</option>
        </select>
      </div>
      <div class="fg full" id="dc-unidade-wrap"><label>Nome da unidade *</label>
        <input type="text" id="dc-unidade" list="dc-unidade-list" value="${esc(editing?.unidade || "")}" placeholder="Ex.: ALECRIM, JOCKEY...">
        <datalist id="dc-unidade-list"></datalist>
      </div>
      <div class="fg"><label>Sistema</label>
        <select id="dc-sistema"><option value="">—</option>${SISTEMAS.map(s => `<option value="${esc(s)}" ${editing?.sistema === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      </div>
      <div class="fg"><label>Nº no Sistema</label><input type="text" id="dc-numeroSistema" value="${esc(editing?.numeroSistema || "")}"></div>
      <div class="fg"><label>CNPJ</label><input type="text" id="dc-cnpj" value="${esc(editing?.cnpj || "")}"></div>
      <div class="fg"><label>Diretora/Responsável</label><input type="text" id="dc-diretora" value="${esc(editing?.diretora || "")}"></div>
      <div class="fg"><label>Telefone (CEI/cel. diretora)</label><input type="text" id="dc-telefone" value="${esc(editing?.telefone || "")}"></div>
      <div class="fg"><label>E-mail</label><input type="text" id="dc-email" value="${esc(editing?.email || "")}"></div>
      <div class="fg"><label>Usuário (Empregador Web)</label><input type="text" id="dc-usuarioWeb" value="${esc(editing?.usuarioWeb || "")}"></div>
      <div class="fg"><label>Senha (Empregador Web)</label><input type="text" id="dc-senhaWeb" value="${esc(editing?.senhaWeb || "")}"></div>
      <div class="fg full"><label>Observações</label><input type="text" id="dc-obs" value="${esc(editing?.obs || "")}"></div>
    </div>
    <div class="mf-row">
      <button class="btn-cancel" id="dc-cancel">Cancelar</button>
      <button class="btn-save-m" id="dc-save">💾 Salvar</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
  ov.querySelector("#dc-cancel").addEventListener("click", () => ov.remove());

  const empSelEl = ov.querySelector("#dc-emp");
  const tipoSelEl = ov.querySelector("#dc-tipo");
  const unidadeWrap = ov.querySelector("#dc-unidade-wrap");
  const unidadeList = ov.querySelector("#dc-unidade-list");
  function refreshUnidades() {
    const filiais = filiaisDaEmpresa(empSelEl.value);
    unidadeList.innerHTML = filiais.map(f => `<option value="${esc(f.label)}"></option>`).join("");
  }
  function refreshTipo() {
    unidadeWrap.style.display = tipoSelEl.value === "matriz" ? "none" : "block";
  }
  empSelEl.addEventListener("change", refreshUnidades);
  tipoSelEl.addEventListener("change", refreshTipo);
  refreshUnidades(); refreshTipo();

  ov.querySelector("#dc-save").addEventListener("click", async () => {
    const emp = empSelEl.value;
    const tipo = tipoSelEl.value === "matriz" ? "matriz" : "unidade";
    const unidade = tipo === "matriz" ? "" : ov.querySelector("#dc-unidade").value.trim();
    if (tipo === "unidade" && !unidade) { alert("Informe o nome da unidade (ou marque \"Matriz\")."); return; }
    const payload = {
      emp, tipo, unidade,
      sistema: ov.querySelector("#dc-sistema").value,
      numeroSistema: ov.querySelector("#dc-numeroSistema").value.trim(),
      cnpj: ov.querySelector("#dc-cnpj").value.trim(),
      diretora: ov.querySelector("#dc-diretora").value.trim(),
      telefone: ov.querySelector("#dc-telefone").value.trim(),
      email: ov.querySelector("#dc-email").value.trim(),
      usuarioWeb: ov.querySelector("#dc-usuarioWeb").value.trim(),
      senhaWeb: ov.querySelector("#dc-senhaWeb").value.trim(),
      obs: ov.querySelector("#dc-obs").value.trim()
    };
    const { db, doc, collection, addDoc, updateDoc, serverTimestamp } = ctx;
    const nome = currentUserName();
    try {
      if (editing) {
        await updateDoc(doc(db, COLLECTION, editing.id), { ...payload, updatedAt: serverTimestamp(), updatedBy: nome });
      } else {
        await addDoc(collection(db, COLLECTION), { ...payload, createdAt: serverTimestamp(), createdBy: nome, updatedAt: serverTimestamp(), updatedBy: nome });
      }
      ov.remove();
    } catch (e) { alert("Não foi possível salvar: " + (e?.message || e)); }
  });
}

// ---- cadastro rápido de usuário/senha do Empregador Web (modal focado, igual ao "Novo Desligamento") ----
function openEmpregadorWebModal(prefill) {
  const emps = visEmpresas();
  if (!emps.length) { alert("Cadastre uma empresa antes (aba Desligamentos → Empresas)."); return; }
  const ov = document.createElement("div");
  ov.className = "modal-ov open";
  ov.innerHTML = `<div class="modal" style="max-width:460px">
    <h2>🔑 Cadastrar usuário/senha do Empregador Web</h2>
    <p style="font-size:.78rem;color:var(--text2);margin:-6px 0 12px">Só os dados de acesso ao Empregador Web. Se a empresa/unidade já tiver um cadastro em Dados &amp; Acessos, os outros campos dele não são alterados.</p>
    <div class="fg-grid">
      <div class="fg"><label>Empresa *</label>
        <select id="ew-emp">${emps.map(e => `<option value="${esc(e.id)}" ${prefill?.emp === e.id ? "selected" : ""}>${esc(e.label)}</option>`).join("")}</select>
      </div>
      <div class="fg"><label>É a Matriz ou uma Unidade? *</label>
        <select id="ew-tipo">
          <option value="unidade" ${(!prefill || prefill.tipo !== "matriz") ? "selected" : ""}>Unidade</option>
          <option value="matriz" ${prefill?.tipo === "matriz" ? "selected" : ""}>Matriz</option>
        </select>
      </div>
      <div class="fg full" id="ew-unidade-wrap"><label>Nome da unidade *</label>
        <input type="text" id="ew-unidade" list="ew-unidade-list" value="${esc(prefill?.unidade || "")}" placeholder="Ex.: ALECRIM, JOCKEY...">
        <datalist id="ew-unidade-list"></datalist>
      </div>
      <div class="fg full"><label>Usuário (Empregador Web) *</label><input type="text" id="ew-usuario" value="${esc(prefill?.usuarioWeb || "")}"></div>
      <div class="fg full"><label>Senha (Empregador Web) *</label><input type="text" id="ew-senha" value="${esc(prefill?.senhaWeb || "")}"></div>
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
    const nome = currentUserName();
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

// ---- render ----
let confirmingDeleteId = null;

function render() {
  if (!mountEl) return;
  ensureStyles();
  const termo = searchTerm.trim().toLowerCase();
  let lista = itemsRaw.filter(it => {
    if (!termo) return true;
    const alvo = [(it.unidade || ""), (it.diretora || ""), (it.cnpj || ""), (it.numeroSistema || "")].join(" ").toLowerCase();
    return alvo.includes(termo);
  });

  let html = "";
  html += `<div class="dse-orient"><b>Orientação.</b> Guarde aqui o cadastro de cada empresa/unidade (Sistema, Nº no Sistema, CNPJ, Diretora responsável, contato) e, se precisar, o usuário/senha do Empregador Web. Essas informações ficam protegidas pelas mesmas regras de acesso do resto da Central Dias — só quem é do DP consegue ver.</div>`;

  html += `<div class="dse-modelos"><span class="lbl">📎 Modelos de planilha para importação:</span>
    <button class="dse-btn small" data-action="modelo" data-val="desligamentos">Desligamentos</button>
    <button class="dse-btn small" data-action="modelo" data-val="pendencias">Pendências</button>
    <button class="dse-btn small" data-action="modelo" data-val="admissoes">Admissões</button>
  </div>`;

  if (pasteTargetEmp) {
    const emp = getEmpresa(pasteTargetEmp);
    html += `<div class="dse-pastebanner">🖱️ Pronto pra colar os dados de <b>${esc(emp.label)}</b> — copie o bloco na sua planilha (com a linha de cabeçalho: Sistema, Nº no Sistema, Unidade, CNPJ, Diretora Responsável, E-mail, Telefone) e pressione <b>Ctrl+V</b> aqui nesta tela. <button class="dse-btn small ghost" data-action="cancelar-colagem" style="margin-left:auto">Cancelar</button></div>`;
  }

  html += `<div class="dse-toolbar">
    <input type="text" class="dse-search" placeholder="Buscar por unidade, diretora, CNPJ ou nº no sistema..." value="${esc(searchTerm)}" data-action="search">
    <button class="dse-btn" data-action="empregador-web">🔑 Cadastrar Empregador Web</button>
    <button class="dse-btn primary" data-action="add-start">＋ Novo cadastro</button>
  </div>`;

  const emps = visEmpresas();
  if (!lista.length) {
    html += `<div class="dse-empty">Nenhuma informação cadastrada ainda${termo ? " com esse filtro" : ""}. Clique em "＋ Novo cadastro" pra começar, ou use "📋 Colar dados" num grupo depois de criar ao menos um cadastro.</div>`;
  }

  const byEmp = {};
  lista.forEach(it => { (byEmp[it.emp] || (byEmp[it.emp] = [])).push(it); });
  const collapsedGroups = getCollapsedGroups();
  const empIds = [...emps.map(e => e.id), ...Object.keys(byEmp).filter(id => !emps.some(e => e.id === id))];
  empIds.forEach(empId => {
    const items = byEmp[empId];
    const emp = getEmpresa(empId);
    const collapsed = collapsedGroups.has(empId);
    if (!items || !items.length) {
      if (termo) return; // não mostra grupo vazio enquanto filtrando por texto
      html += `<div class="dse-group ${collapsed ? "collapsed" : ""}" style="--ec:${emp.color || "#888"}">
        <div class="dse-grouphd" data-action="toggle-group" data-val="${esc(empId)}">
          <span class="car">▾</span><span class="nome">${esc(emp.label)}</span><span class="cnt">0</span><span class="sp"></span>
          <button class="dse-btn small" data-action="paste-target" data-val="${esc(empId)}">📋 Colar dados</button>
        </div>
      </div>`;
      return;
    }
    items.sort((a, b) => {
      const am = (a.tipo || "unidade") === "matriz", bm = (b.tipo || "unidade") === "matriz";
      if (am !== bm) return am ? -1 : 1;
      return (a.unidade || "").localeCompare(b.unidade || "");
    });
    html += `<div class="dse-group ${collapsed ? "collapsed" : ""}" style="--ec:${emp.color || "#888"}">
      <div class="dse-grouphd" data-action="toggle-group" data-val="${esc(empId)}">
        <span class="car">▾</span><span class="nome">${esc(emp.label)}</span><span class="cnt">${items.length}</span><span class="sp"></span>
        <button class="dse-btn small" data-action="paste-target" data-val="${esc(empId)}">📋 Colar dados</button>
      </div>
      <div class="dse-groupbody">
        <table class="dse-table">
          <thead><tr><th>Unidade</th><th>Sistema</th><th>Nº Sistema</th><th>CNPJ</th><th>Diretora</th><th>Telefone</th><th>E-mail</th><th>🔑</th><th></th></tr></thead>
          <tbody>`;
    items.forEach(it => {
      if (confirmingDeleteId === it.id) {
        const titulo = (it.tipo || "unidade") === "matriz" ? `MATRIZ — ${emp.label}` : it.unidade;
        html += `<tr class="dse-confirmrow"><td colspan="9"><div class="dse-confirmtxt">Excluir "${esc(titulo)}"? Essa ação não pode ser desfeita.
          <button class="dse-btn small primary" data-action="delete-confirm" data-val="${esc(it.id)}">Excluir</button>
          <button class="dse-btn small" data-action="delete-cancel">Cancelar</button></div></td></tr>`;
        return;
      }
      const isMatriz = (it.tipo || "unidade") === "matriz";
      const temWeb = !!(it.usuarioWeb || it.senhaWeb);
      html += `<tr data-id="${esc(it.id)}">
        <td class="unidade">${isMatriz ? "Matriz" : esc(it.unidade || "—")}${isMatriz ? `<span class="dse-matriz-badge">Matriz</span>` : ""}</td>
        <td>${esc(it.sistema || "—")}</td>
        <td class="mono">${esc(it.numeroSistema || "—")}</td>
        <td class="mono">${esc(it.cnpj || "—")}</td>
        <td>${esc(it.diretora || "—")}</td>
        <td class="mono">${esc(it.telefone || "—")}</td>
        <td class="mono">${esc(it.email || "—")}</td>
        <td><span class="dse-keydot ${temWeb ? "filled" : ""}" data-action="key-click" data-val="${esc(it.id)}" title="${temWeb ? "Copiar usuário/senha do Empregador Web" : "Cadastrar usuário/senha do Empregador Web"}">${temWeb ? "🔑" : "➕"}</span></td>
        <td><div class="dse-rowactions">
          <button class="dse-ibtn" data-action="edit-start" data-val="${esc(it.id)}" title="Editar">✎</button>
          <button class="dse-ibtn" data-action="delete-start" data-val="${esc(it.id)}" title="Excluir">🗑</button>
        </div></td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  });

  mountEl.innerHTML = html;
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
    if (action === "add-start") { openCardModal(null); return; }
    if (action === "edit-start") { openCardModal(val); return; }
    if (action === "toggle-group") {
      const set = getCollapsedGroups();
      if (set.has(val)) set.delete(val); else set.add(val);
      setCollapsedGroups(set); render(); return;
    }
    if (action === "paste-target") { armarColagem(val); return; }
    if (action === "cancelar-colagem") { pasteTargetEmp = ""; render(); return; }
    if (action === "delete-start") { confirmingDeleteId = val; render(); return; }
    if (action === "delete-cancel") { confirmingDeleteId = null; render(); return; }
    if (action === "delete-confirm") { confirmingDeleteId = null; await deleteItem(val); return; }
    if (action === "key-click") {
      const it = itemsRaw.find(x => x.id === val);
      if (!it) return;
      if (it.usuarioWeb || it.senhaWeb) {
        await copyToClipboard(`Usuário: ${it.usuarioWeb || ""}\nSenha: ${it.senhaWeb || ""}`);
      } else {
        openEmpregadorWebModal({ emp: it.emp, tipo: it.tipo, unidade: it.unidade });
      }
      return;
    }
  });

  mountEl.addEventListener("input", e => {
    if (e.target.matches('[data-action="search"]')) {
      searchTerm = e.target.value; render();
      const inp = mountEl.querySelector('[data-action="search"]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      return;
    }
  });

  document.addEventListener("paste", handleGlobalPaste);
}

// ---- API pública ----
export function initDadosAcessos(c) {
  ctx = c;
  mountEl = document.getElementById(MOUNT_ID);
  if (!mountEl) return () => {};
  wireEvents();
  subscribeItems();
  return function stopDadosAcessos() {
    if (unsubItems) { unsubItems(); unsubItems = null; }
    document.removeEventListener("paste", handleGlobalPaste);
  };
}

export function renderInfoDados() {
  render();
}
