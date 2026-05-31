// ============================================================
// hub.js — Integração completa com Supabase
// CommerceHub · carregado em ecommerce_hub.html
// ============================================================

// ── Utilitários ────────────────────────────────────────────

function toast(msg, tipo = 'ok') {
  const t = document.createElement('div')
  t.className = 'toast toast-' + tipo
  t.textContent = msg
  Object.assign(t.style, {
    position:'fixed', bottom:'20px', right:'20px', zIndex:'9999',
    padding:'10px 16px', borderRadius:'8px', fontSize:'13px',
    background: tipo === 'ok' ? '#2d7a1f' : tipo === 'err' ? '#c0392b' : '#1a5fa8',
    color:'#fff', boxShadow:'0 4px 16px rgba(0,0,0,.15)',
    transition:'opacity .3s', opacity:'1'
  })
  document.body.appendChild(t)
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300) }, 3000)
}

function loading(id, show) {
  const el = document.getElementById(id)
  if (!el) return
  el.innerHTML = show
    ? '<tr><td colspan="20" style="text-align:center;padding:24px;color:#999;font-size:13px"><i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Carregando...</td></tr>'
    : ''
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function formatBRL(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function confirmar(msg) { return confirm(msg) }

// ── Autenticação ───────────────────────────────────────────

let currentUser = null

async function initHub() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { window.location.href = 'index.html'; return }
  currentUser = user

  // Mostrar nome do usuário no header se tiver elemento
  const nameEl = document.getElementById('user-name')
  if (nameEl) nameEl.textContent = user.email.split('@')[0]

  // Carregar dados iniciais
  await Promise.all([
    carregarDashboardPedidos(),
    carregarDashboard(),
    carregarProdutos(),
    carregarEstoque(),
    carregarFornecedores(),
    carregarPedidos(),
    carregarLojas(),
    carregarFuncionarios(),
    carregarSAC(),
    carregarChat()
  ])
}

// ── DASHBOARD ─────────────────────────────────────────────

async function carregarDashboard() {
  const uid = currentUser.id

  // Pedidos pendentes
  const { count: pendentes } = await supabase
    .from('pedidos').select('*', { count: 'exact', head: true })
    .eq('user_id', uid).eq('status', 'aguard_envio')

  // Alertas estoque
  const { data: alertas } = await supabase
    .from('alertas_estoque').select('*')
    .eq('user_id', uid).in('nivel_alerta', ['zerado', 'critico'])

  // Tickets SAC abertos
  const { count: tickets } = await supabase
    .from('tickets_sac').select('*', { count: 'exact', head: true })
    .eq('user_id', uid).eq('status', 'aberto')

  // Pedidos enviados hoje
  const hoje = new Date().toISOString().slice(0, 10)
  const { count: enviados } = await supabase
    .from('pedidos').select('*', { count: 'exact', head: true })
    .eq('user_id', uid).eq('status', 'enviado').eq('data_pedido', hoje)

  // Atualizar KPIs
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v }
  set('kpi-pendentes', pendentes ?? 0)
  set('kpi-alertas', alertas?.length ?? 0)
  set('kpi-tickets', tickets ?? 0)
  set('kpi-enviados', enviados ?? 0)

  // Alertas críticos no dashboard
  if (alertas?.length) renderAlertasDashboard(alertas.slice(0, 3))
}

function renderAlertasDashboard(alertas) {
  const el = document.getElementById('dash-alertas')
  if (!el) return
  el.innerHTML = alertas.map(a => {
    const nivel = a.nivel_alerta === 'zerado' ? 'stock-critical' : 'stock-critical'
    return `
    <div class="stock-alert ${nivel}">
      <div class="stock-alert-icon" style="background:var(--danger-bg)">
        <i class="ti ti-${a.quantidade === 0 ? 'package-off' : 'alert-triangle'}" style="color:var(--danger)"></i>
      </div>
      <div class="stock-alert-body">
        <div class="stock-alert-title">${escapeHtml(a.produto)} — ${a.quantidade === 0 ? 'ZERADO' : 'Abaixo do mínimo'} · ${escapeHtml(a.loja)}</div>
        <div class="stock-alert-sub">Venda semanal: ${a.venda_semanal} un. · Mínimo: ${a.quantidade_minima} · Atual: ${a.quantidade}</div>
      </div>
      <button class="btn btn-sm btn-primary" onclick="openM('m-pedido-fornecedor');preencherPedidoFornecedor('${a.produto}')">
        <i class="ti ti-send"></i>Pedir
      </button>
    </div>`
  }).join('')
}

// ── PRODUTOS ──────────────────────────────────────────────

async function carregarProdutos() {
  loading('tbody-produtos', true)
  const { data, error } = await supabase
    .from('produtos').select('*')
    .eq('user_id', currentUser.id)
    .order('nome')

  if (error) { toast('Erro ao carregar produtos', 'err'); return }

  const el = document.getElementById('tbody-produtos')
  if (!el) return

  if (!data?.length) {
    el.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#999;font-size:13px">Nenhum produto cadastrado ainda.</td></tr>'
    return
  }

  el.innerHTML = data.map(p => {
    const margem = p.preco && p.custo ? Math.round((1 - p.custo / p.preco) * 100) : 0
    const canais = (p.canais || []).map(c => `<span class="pill pill-p">${escapeHtml(c)}</span>`).join(' ')
    const statusPill = p.status === 'ativo'
      ? '<span class="pill pill-g">Ativo</span>'
      : '<span class="pill pill-r">Inativo</span>'
    return `
    <tr>
      <td class="strong">${escapeHtml(p.nome)}</td>
      <td style="font-family:var(--mono);font-size:10px">${escapeHtml(p.sku)}</td>
      <td>${escapeHtml(p.categoria)}</td>
      <td>${formatBRL(p.preco)}</td>
      <td>${formatBRL(p.custo)}</td>
      <td style="color:var(--success);font-weight:500">${margem}%</td>
      <td>${canais}</td>
      <td>${statusPill}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-ghost" onclick="editarProduto('${p.id}')" title="Editar"><i class="ti ti-pencil"></i></button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="excluirProduto('${p.id}','${escapeHtml(p.nome)}')" title="Excluir"><i class="ti ti-trash"></i></button>
        </div>
      </td>
    </tr>`
  }).join('')

  // Atualizar selects de produto nos modais
  atualizarSelectsProdutos(data)
}

function atualizarSelectsProdutos(produtos) {
  document.querySelectorAll('.select-produto').forEach(sel => {
    const val = sel.value
    sel.innerHTML = '<option value="">Selecione...</option>' +
      produtos.map(p => `<option value="${p.id}">${escapeHtml(p.nome)} (${p.sku})</option>`).join('')
    if (val) sel.value = val
  })
}

async function salvarProduto() {
  const id = document.getElementById('prod-id').value
  const payload = {
    nome:       document.getElementById('prod-nome').value.trim(),
    sku:        document.getElementById('prod-sku').value.trim().toUpperCase(),
    categoria:  document.getElementById('prod-categoria').value,
    preco:      parseFloat(document.getElementById('prod-preco').value),
    custo:      parseFloat(document.getElementById('prod-custo').value),
    status:     'ativo',
    canais:     [...document.querySelectorAll('.prod-canal:checked')].map(c => c.value),
    user_id:    currentUser.id
  }

  if (!payload.nome || !payload.sku || !payload.preco) {
    toast('Preencha nome, SKU e preço', 'err'); return
  }

  let error
  if (id) {
    ;({ error } = await supabase.from('produtos').update(payload).eq('id', id).eq('user_id', currentUser.id))
  } else {
    const estoqueInicial = parseInt(document.getElementById('prod-estoque-inicial').value) || 0
    const estoqueMinimo  = parseInt(document.getElementById('prod-estoque-minimo').value) || 0
    const { data: novo, error: e } = await supabase.from('produtos').insert(payload).select().single()
    error = e
    // Criar registro de estoque inicial se houver loja padrão
    if (!error && estoqueInicial >= 0) {
      const { data: lojas } = await supabase.from('lojas').select('id').eq('user_id', currentUser.id).limit(1)
      if (lojas?.length) {
        await supabase.from('estoque').insert({
          produto_id: novo.id,
          loja_id: lojas[0].id,
          quantidade: estoqueInicial,
          quantidade_minima: estoqueMinimo,
          user_id: currentUser.id
        })
      }
    }
  }

  if (error) { toast('Erro: ' + error.message, 'err'); return }

  toast(id ? 'Produto atualizado!' : 'Produto cadastrado!')
  closeM('m-produto')
  limparFormProduto()
  await carregarProdutos()
  await carregarEstoque()
}

async function editarProduto(id) {
  const { data: p } = await supabase.from('produtos').select('*').eq('id', id).single()
  if (!p) return
  document.getElementById('prod-id').value = p.id
  document.getElementById('prod-nome').value = p.nome
  document.getElementById('prod-sku').value = p.sku
  document.getElementById('prod-categoria').value = p.categoria
  document.getElementById('prod-preco').value = p.preco
  document.getElementById('prod-custo').value = p.custo
  document.querySelectorAll('.prod-canal').forEach(c => { c.checked = (p.canais || []).includes(c.value) })
  document.getElementById('m-produto-titulo').textContent = 'Editar Produto'
  document.getElementById('prod-estoque-row').style.display = 'none'
  openM('m-produto')
}

async function excluirProduto(id, nome) {
  if (!confirmar(`Excluir "${nome}" permanentemente? O estoque associado também será removido.`)) return
  const { error } = await supabase.from('produtos').delete().eq('id', id).eq('user_id', currentUser.id)
  if (error) { toast('Erro ao excluir: ' + error.message, 'err'); return }
  toast('Produto excluído')
  await carregarProdutos()
  await carregarEstoque()
}

function limparFormProduto() {
  document.getElementById('prod-id').value = ''
  document.getElementById('prod-nome').value = ''
  document.getElementById('prod-sku').value = ''
  document.getElementById('prod-preco').value = ''
  document.getElementById('prod-custo').value = ''
  document.getElementById('prod-estoque-inicial').value = ''
  document.getElementById('prod-estoque-minimo').value = ''
  document.querySelectorAll('.prod-canal').forEach(c => { c.checked = false })
  document.getElementById('m-produto-titulo').textContent = 'Cadastrar Produto'
  document.getElementById('prod-estoque-row').style.display = ''
}

// ── ESTOQUE ───────────────────────────────────────────────

async function carregarEstoque() {
  loading('tbody-estoque', true)
  const { data, error } = await supabase
    .from('alertas_estoque').select('*')
    .eq('user_id', currentUser.id)
    .order('nivel_alerta')

  if (error) { toast('Erro ao carregar estoque', 'err'); return }

  // KPIs de estoque
  const criticos   = data?.filter(e => ['zerado','critico'].includes(e.nivel_alerta)).length ?? 0
  const atencao    = data?.filter(e => e.nivel_alerta === 'atencao').length ?? 0
  const totalSkus  = data?.length ?? 0
  const ok         = totalSkus - criticos - atencao

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v }
  set('kpi-total-skus', totalSkus)
  set('kpi-criticos', criticos)
  set('kpi-atencao', atencao)
  set('kpi-ok', ok)
  set('kpi-alertas', criticos) // atualiza dashboard também

  const el = document.getElementById('tbody-estoque')
  if (!el) return

  if (!data?.length) {
    el.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#999;font-size:13px">Nenhum item no estoque ainda. Cadastre produtos e lojas primeiro.</td></tr>'
    return
  }

  el.innerHTML = data.map(e => {
    const pill = e.nivel_alerta === 'zerado' || e.nivel_alerta === 'critico'
      ? '<span class="pill pill-r">Crítico</span>'
      : e.nivel_alerta === 'atencao'
        ? '<span class="pill pill-a">Atenção</span>'
        : '<span class="pill pill-g">OK</span>'
    const cor = (e.nivel_alerta === 'zerado' || e.nivel_alerta === 'critico') ? 'var(--danger)' : 'inherit'
    return `
    <tr>
      <td class="strong">${escapeHtml(e.produto)}</td>
      <td style="font-family:var(--mono);font-size:10px">${escapeHtml(e.sku)}</td>
      <td>${escapeHtml(e.loja)}</td>
      <td style="font-family:var(--mono);color:${cor};font-weight:600">${e.quantidade}</td>
      <td style="font-family:var(--mono)">${e.quantidade_minima}</td>
      <td style="font-family:var(--mono)">${e.venda_semanal}</td>
      <td>${pill}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-ghost" onclick="abrirAjusteEstoque('${e.id}')" title="Ajustar quantidade"><i class="ti ti-edit"></i></button>
          <button class="btn btn-sm btn-primary" onclick="openM('m-pedido-fornecedor');preencherPedidoFornecedor('${escapeHtml(e.produto)}')"><i class="ti ti-send"></i></button>
        </div>
      </td>
    </tr>`
  }).join('')
}

async function abrirAjusteEstoque(estoqueId) {
  document.getElementById('est-id').value = estoqueId
  const { data } = await supabase.from('estoque').select('quantidade,quantidade_minima,venda_semanal').eq('id', estoqueId).single()
  if (data) {
    document.getElementById('est-quantidade').value = data.quantidade
    document.getElementById('est-minimo').value = data.quantidade_minima
    document.getElementById('est-venda-semanal').value = data.venda_semanal
  }
  openM('m-ajuste-estoque')
}

async function salvarAjusteEstoque() {
  const id = document.getElementById('est-id').value
  const payload = {
    quantidade:       parseInt(document.getElementById('est-quantidade').value),
    quantidade_minima:parseInt(document.getElementById('est-minimo').value),
    venda_semanal:    parseInt(document.getElementById('est-venda-semanal').value) || 0,
    updated_at:       new Date().toISOString()
  }

  const { error } = await supabase.from('estoque').update(payload).eq('id', id)
  if (error) { toast('Erro: ' + error.message, 'err'); return }

  toast('Estoque atualizado!')
  closeM('m-ajuste-estoque')
  await carregarEstoque()
  await carregarDashboard()
}

// ── FORNECEDORES ──────────────────────────────────────────

async function carregarFornecedores() {
  loading('tbody-fornecedores', true)
  const { data } = await supabase.from('fornecedores').select('*')
    .eq('user_id', currentUser.id).order('razao_social')

  const el = document.getElementById('tbody-fornecedores')
  if (!el) return

  if (!data?.length) {
    el.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#999;font-size:13px">Nenhum fornecedor cadastrado.</td></tr>'
    return
  }

  el.innerHTML = data.map(f => `
    <tr>
      <td class="strong">${escapeHtml(f.razao_social)}</td>
      <td style="font-family:var(--mono);font-size:10px">${escapeHtml(f.cnpj || '—')}</td>
      <td>${escapeHtml(f.categoria || '—')}</td>
      <td>${escapeHtml(f.prazo_entrega || '—')}</td>
      <td><span class="pill pill-a">—</span></td>
      <td>${escapeHtml(f.telefone || '—')}</td>
      <td><span class="pill ${f.status === 'ativo' ? 'pill-g' : 'pill-r'}">${f.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-primary" onclick="openM('m-pedido-fornecedor');preencherFornecedor('${f.id}')"><i class="ti ti-plus"></i>Pedir</button>
          <button class="btn btn-sm btn-ghost" onclick="editarFornecedor('${f.id}')" title="Editar"><i class="ti ti-pencil"></i></button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="excluirFornecedor('${f.id}','${escapeHtml(f.razao_social)}')" title="Excluir"><i class="ti ti-trash"></i></button>
        </div>
      </td>
    </tr>`).join('')

  // Atualizar select de fornecedores nos modais
  const sels = document.querySelectorAll('.select-fornecedor')
  sels.forEach(sel => {
    sel.innerHTML = '<option value="">Selecione...</option>' +
      data.map(f => `<option value="${f.id}">${escapeHtml(f.razao_social)}</option>`).join('')
  })
}

async function salvarFornecedor() {
  const id = document.getElementById('forn-id').value
  const payload = {
    razao_social:   document.getElementById('forn-razao').value.trim(),
    cnpj:           document.getElementById('forn-cnpj').value.trim(),
    categoria:      document.getElementById('forn-categoria').value.trim(),
    prazo_entrega:  document.getElementById('forn-prazo').value.trim(),
    telefone:       document.getElementById('forn-telefone').value.trim(),
    email:          document.getElementById('forn-email').value.trim(),
    observacoes:    document.getElementById('forn-obs').value.trim(),
    user_id:        currentUser.id
  }

  if (!payload.razao_social) { toast('Informe a razão social', 'err'); return }

  let error
  if (id) {
    ;({ error } = await supabase.from('fornecedores').update(payload).eq('id', id).eq('user_id', currentUser.id))
  } else {
    ;({ error } = await supabase.from('fornecedores').insert(payload))
  }

  if (error) { toast('Erro: ' + error.message, 'err'); return }
  toast(id ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!')
  closeM('m-fornecedor')
  document.getElementById('forn-id').value = ''
  await carregarFornecedores()
}

async function editarFornecedor(id) {
  const { data: f } = await supabase.from('fornecedores').select('*').eq('id', id).single()
  if (!f) return
  document.getElementById('forn-id').value = f.id
  document.getElementById('forn-razao').value = f.razao_social
  document.getElementById('forn-cnpj').value = f.cnpj || ''
  document.getElementById('forn-categoria').value = f.categoria || ''
  document.getElementById('forn-prazo').value = f.prazo_entrega || ''
  document.getElementById('forn-telefone').value = f.telefone || ''
  document.getElementById('forn-email').value = f.email || ''
  document.getElementById('forn-obs').value = f.observacoes || ''
  openM('m-fornecedor')
}

async function excluirFornecedor(id, nome) {
  if (!confirmar(`Excluir fornecedor "${nome}"?`)) return
  const { error } = await supabase.from('fornecedores').delete().eq('id', id).eq('user_id', currentUser.id)
  if (error) { toast('Erro: ' + error.message, 'err'); return }
  toast('Fornecedor excluído')
  await carregarFornecedores()
}

// ── PEDIDOS A FORNECEDORES ─────────────────────────────────

async function salvarPedidoFornecedor() {
  const payload = {
    fornecedor_id:    document.getElementById('pforn-fornecedor').value || null,
    produto_id:       document.getElementById('pforn-produto').value || null,
    quantidade:       parseInt(document.getElementById('pforn-qtd').value),
    urgencia:         document.getElementById('pforn-urgencia').value,
    observacoes:      document.getElementById('pforn-obs').value.trim(),
    previsao_entrega: document.getElementById('pforn-previsao').value || null,
    numero:           'PF-' + Date.now().toString().slice(-6),
    user_id:          currentUser.id
  }

  if (!payload.quantidade) { toast('Informe a quantidade', 'err'); return }

  const { error } = await supabase.from('pedidos_fornecedor').insert(payload)
  if (error) { toast('Erro: ' + error.message, 'err'); return }
  toast('Pedido ao fornecedor emitido!')
  closeM('m-pedido-fornecedor')
  await carregarFornecedores()
}

function preencherPedidoFornecedor(nomeProduto) {
  const input = document.getElementById('pforn-produto-nome')
  if (input) input.value = nomeProduto
}

function preencherFornecedor(fornId) {
  const sel = document.getElementById('pforn-fornecedor')
  if (sel) sel.value = fornId
}

// ── PEDIDOS DE CLIENTES ───────────────────────────────────

async function carregarPedidos() {
  loading('tbody-pedidos', true)
  const { data } = await supabase.from('pedidos').select('*')
    .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(100)

  const el = document.getElementById('tbody-pedidos')
  if (!el) return

  if (!data?.length) {
    el.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#999;font-size:13px">Nenhum pedido cadastrado.</td></tr>'
    return
  }

  const statusLabel = {
    novo: ['Novo','pill-b'], em_separacao: ['Em separação','pill-b'],
    aguard_envio: ['Aguard. envio','pill-a'], enviado: ['Enviado','pill-g'],
    entregue: ['Entregue','pill-g'], dev_solicitada: ['Dev. solicitada','pill-r'], cancelado: ['Cancelado','pill-r']
  }

  el.innerHTML = data.map(p => {
    const [label, cls] = statusLabel[p.status] || [p.status, 'pill-b']
    return `
    <tr>
      <td class="strong" style="font-family:var(--mono)">${escapeHtml(p.numero)}</td>
      <td><span class="pill pill-p">${escapeHtml(p.canal)}</span></td>
      <td>${escapeHtml(p.comprador || '—')}</td>
      <td>${escapeHtml(p.produto_nome || '—')}</td>
      <td>${formatBRL(p.valor)}</td>
      <td>${p.data_pedido || '—'}</td>
      <td><span class="pill ${cls}">${label}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-ghost" onclick="editarStatusPedido('${p.id}','${p.status}')" title="Alterar status"><i class="ti ti-edit"></i></button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="excluirPedido('${p.id}','${escapeHtml(p.numero)}')" title="Excluir"><i class="ti ti-trash"></i></button>
        </div>
      </td>
    </tr>`
  }).join('')
}

async function editarStatusPedido(id, statusAtual) {
  const opcoes = ['novo','em_separacao','aguard_envio','enviado','entregue','dev_solicitada','cancelado']
  const labels = ['Novo','Em separação','Aguardando envio','Enviado','Entregue','Devolução solicitada','Cancelado']
  const novo = prompt(`Status atual: ${labels[opcoes.indexOf(statusAtual)]}\n\nNovos status disponíveis:\n${labels.map((l,i) => `${i+1}. ${l}`).join('\n')}\n\nDigite o número:`)
  const idx = parseInt(novo) - 1
  if (isNaN(idx) || idx < 0 || idx >= opcoes.length) return
  const { error } = await supabase.from('pedidos').update({ status: opcoes[idx] }).eq('id', id)
  if (error) { toast('Erro: ' + error.message, 'err'); return }
  toast('Status atualizado!')
  await carregarPedidos()
  await carregarDashboard()
}

async function excluirPedido(id, numero) {
  if (!confirmar(`Excluir pedido ${numero}?`)) return
  const { error } = await supabase.from('pedidos').delete().eq('id', id).eq('user_id', currentUser.id)
  if (error) { toast('Erro: ' + error.message, 'err'); return }
  toast('Pedido removido')
  await carregarPedidos()
}

// ── LOJAS ─────────────────────────────────────────────────

async function carregarLojas() {
  const { data } = await supabase.from('lojas').select('*')
    .eq('user_id', currentUser.id).order('nome')

  const el = document.getElementById('grid-lojas')
  if (!el || !data) return

  if (!data.length) {
    el.innerHTML = '<div style="color:#999;font-size:13px;padding:20px">Nenhuma loja cadastrada ainda.</div>'
    return
  }

  el.innerHTML = data.map(l => `
    <div class="wh-card">
      <div class="wh-header">
        <div class="wh-icon" style="background:var(--brand-light)"><i class="ti ti-building-store" style="color:var(--brand);font-size:18px"></i></div>
        <div>
          <div style="font-size:13px;font-weight:500">${escapeHtml(l.nome)}</div>
          <div style="font-size:10px;color:var(--text3)">${escapeHtml(l.tipo.replace('_',' '))}</div>
        </div>
        <span class="pill ${l.status === 'ativo' ? 'pill-g' : 'pill-r'}" style="margin-left:auto">${l.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
      </div>
      <div class="wh-stats">
        <div class="wh-stat"><div class="wh-stat-val" style="color:var(--brand)">${formatBRL(l.faturamento_mes)}</div><div class="wh-stat-lbl">Fat. mês</div></div>
        <div class="wh-stat"><div class="wh-stat-val">${l.pedidos_mes}</div><div class="wh-stat-lbl">Pedidos</div></div>
        <div class="wh-stat"><div class="wh-stat-val">${l.avaliacao ?? '—'}${l.avaliacao ? '★' : ''}</div><div class="wh-stat-lbl">Avaliação</div></div>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn btn-sm" onclick="editarLoja('${l.id}')"><i class="ti ti-pencil"></i>Editar</button>
        <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="excluirLoja('${l.id}','${escapeHtml(l.nome)}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('')

  // Atualizar selects de loja
  const opts = data.map(l => `<option value="${l.id}">${escapeHtml(l.nome)}</option>`).join('')
  document.querySelectorAll('.select-loja').forEach(sel => {
    const v = sel.value
    sel.innerHTML = '<option value="">Selecione...</option>' + opts
    if (v) sel.value = v
  })
}

async function salvarLoja() {
  const id = document.getElementById('loja-id').value
  const payload = {
    nome:        document.getElementById('loja-nome').value.trim(),
    tipo:        document.getElementById('loja-tipo').value,
    marketplace: document.getElementById('loja-marketplace').value,
    responsavel: document.getElementById('loja-responsavel').value.trim(),
    endereco:    document.getElementById('loja-endereco').value.trim(),
    user_id:     currentUser.id
  }

  if (!payload.nome) { toast('Informe o nome da loja', 'err'); return }

  let error
  if (id) {
    ;({ error } = await supabase.from('lojas').update(payload).eq('id', id).eq('user_id', currentUser.id))
  } else {
    ;({ error } = await supabase.from('lojas').insert(payload))
  }

  if (error) { toast('Erro: ' + error.message, 'err'); return }
  toast(id ? 'Loja atualizada!' : 'Loja cadastrada!')
  closeM('m-nova-loja')
  document.getElementById('loja-id').value = ''
  await carregarLojas()
}

async function editarLoja(id) {
  const { data: l } = await supabase.from('lojas').select('*').eq('id', id).single()
  if (!l) return
  document.getElementById('loja-id').value = l.id
  document.getElementById('loja-nome').value = l.nome
  document.getElementById('loja-tipo').value = l.tipo
  document.getElementById('loja-marketplace').value = l.marketplace || ''
  document.getElementById('loja-responsavel').value = l.responsavel || ''
  document.getElementById('loja-endereco').value = l.endereco || ''
  openM('m-nova-loja')
}

async function excluirLoja(id, nome) {
  if (!confirmar(`Excluir loja "${nome}"? O estoque vinculado será removido.`)) return
  const { error } = await supabase.from('lojas').delete().eq('id', id).eq('user_id', currentUser.id)
  if (error) { toast('Erro: ' + error.message, 'err'); return }
  toast('Loja removida')
  await carregarLojas()
  await carregarEstoque()
}

// ── FUNCIONÁRIOS ──────────────────────────────────────────

async function carregarFuncionarios() {
  const { data } = await supabase.from('funcionarios').select('*')
    .eq('user_id', currentUser.id).order('nome')

  const el = document.getElementById('grid-funcionarios')
  if (!el || !data) return

  if (!data.length) {
    el.innerHTML = '<div style="color:#999;font-size:13px;padding:20px">Nenhum funcionário cadastrado.</div>'
    return
  }

  el.innerHTML = data.map(f => `
    <div class="emp-card">
      <div class="emp-av">${f.nome.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}</div>
      <div class="emp-info">
        <div class="emp-name">${escapeHtml(f.nome)}</div>
        <div class="emp-role">${escapeHtml(f.cargo || '—')}</div>
      </div>
      <span class="pill ${f.status === 'ativo' ? 'pill-g' : 'pill-r'}">${f.status === 'ativo' ? 'Ativo' : 'Suspenso'}</span>
      <div style="display:flex;gap:4px;margin-top:8px">
        <button class="btn btn-sm btn-ghost" onclick="editarFuncionario('${f.id}')"><i class="ti ti-pencil"></i></button>
        <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="excluirFuncionario('${f.id}','${escapeHtml(f.nome)}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('')
}

async function salvarFuncionario() {
  const id = document.getElementById('func-id').value
  const payload = {
    nome:     document.getElementById('func-nome').value.trim(),
    email:    document.getElementById('func-email').value.trim(),
    cargo:    document.getElementById('func-cargo').value,
    telefone: document.getElementById('func-telefone').value.trim(),
    status:   'ativo',
    user_id:  currentUser.id
  }

  if (!payload.nome || !payload.email) { toast('Nome e e-mail são obrigatórios', 'err'); return }

  let error
  if (id) {
    ;({ error } = await supabase.from('funcionarios').update(payload).eq('id', id).eq('user_id', currentUser.id))
  } else {
    ;({ error } = await supabase.from('funcionarios').insert(payload))
  }

  if (error) { toast('Erro: ' + error.message, 'err'); return }
  toast(id ? 'Funcionário atualizado!' : 'Funcionário cadastrado!')
  closeM('m-funcionario')
  document.getElementById('func-id').value = ''
  await carregarFuncionarios()
}

async function editarFuncionario(id) {
  const { data: f } = await supabase.from('funcionarios').select('*').eq('id', id).single()
  if (!f) return
  document.getElementById('func-id').value = f.id
  document.getElementById('func-nome').value = f.nome
  document.getElementById('func-email').value = f.email
  document.getElementById('func-cargo').value = f.cargo || ''
  document.getElementById('func-telefone').value = f.telefone || ''
  openM('m-funcionario')
}

async function excluirFuncionario(id, nome) {
  if (!confirmar(`Excluir funcionário "${nome}"?`)) return
  const { error } = await supabase.from('funcionarios').delete().eq('id', id).eq('user_id', currentUser.id)
  if (error) { toast('Erro: ' + error.message, 'err'); return }
  toast('Funcionário removido')
  await carregarFuncionarios()
}

// ── SAC ───────────────────────────────────────────────────

async function carregarSAC() {
  const { data } = await supabase.from('tickets_sac').select('*')
    .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(50)

  const el = document.getElementById('tbody-sac')
  if (!el || !data) return

  if (!data.length) {
    el.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#999;font-size:13px">Nenhum ticket aberto.</td></tr>'
    return
  }

  const prioCls = { normal: 'pill-b', alta: 'pill-a', urgente: 'pill-r' }
  const statusLabel = {
    aberto: ['Aberto','pill-r'], em_andamento: ['Em andamento','pill-a'],
    fechado_resolvido: ['Resolvido','pill-g'], fechado_sem_resolucao: ['Fechado','pill-b']
  }

  el.innerHTML = data.map(t => {
    const [sLabel, sCls] = statusLabel[t.status] || [t.status, 'pill-b']
    return `
    <tr>
      <td class="strong" style="font-family:var(--mono)">#SAC-${t.numero || t.id.slice(-4)}</td>
      <td><span class="pill pill-p">${escapeHtml(t.canal)}</span></td>
      <td>${escapeHtml(t.cliente || '—')}</td>
      <td>${escapeHtml(t.tipo)}</td>
      <td>${t.valor ? formatBRL(t.valor) : '—'}</td>
      <td><span class="pill ${prioCls[t.prioridade] || 'pill-b'}">${t.prioridade}</span></td>
      <td><span class="pill ${sCls}">${sLabel}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-ghost" onclick="editarTicket('${t.id}')"><i class="ti ti-pencil"></i></button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="excluirTicket('${t.id}')"><i class="ti ti-trash"></i></button>
        </div>
      </td>
    </tr>`
  }).join('')
}

async function salvarTicket() {
  const id = document.getElementById('sac-id').value
  const payload = {
    canal:            document.getElementById('sac-canal').value,
    tipo:             document.getElementById('sac-tipo').value,
    cliente:          document.getElementById('sac-cliente').value.trim(),
    pedido_numero:    document.getElementById('sac-pedido').value.trim(),
    descricao:        document.getElementById('sac-descricao').value.trim(),
    valor:            parseFloat(document.getElementById('sac-valor').value) || null,
    prioridade:       document.getElementById('sac-prioridade').value,
    responsavel:      document.getElementById('sac-responsavel').value.trim(),
    sla_horas:        parseInt(document.getElementById('sac-sla').value) || 24,
    processo_judicial:document.getElementById('sac-processo').value !== 'Não',
    status:           'aberto',
    numero:           String(Date.now()).slice(-6),
    user_id:          currentUser.id
  }

  let error
  if (id) {
    ;({ error } = await supabase.from('tickets_sac').update(payload).eq('id', id).eq('user_id', currentUser.id))
  } else {
    ;({ error } = await supabase.from('tickets_sac').insert(payload))
  }

  if (error) { toast('Erro: ' + error.message, 'err'); return }
  toast(id ? 'Ticket atualizado!' : 'Ticket aberto!')
  closeM('m-sac')
  document.getElementById('sac-id').value = ''
  await carregarSAC()
  await carregarDashboard()
}

async function editarTicket(id) {
  const { data: t } = await supabase.from('tickets_sac').select('*').eq('id', id).single()
  if (!t) return
  document.getElementById('sac-id').value = t.id
  document.getElementById('sac-canal').value = t.canal
  document.getElementById('sac-tipo').value = t.tipo
  document.getElementById('sac-cliente').value = t.cliente || ''
  document.getElementById('sac-pedido').value = t.pedido_numero || ''
  document.getElementById('sac-descricao').value = t.descricao || ''
  document.getElementById('sac-valor').value = t.valor || ''
  document.getElementById('sac-prioridade').value = t.prioridade
  document.getElementById('sac-responsavel').value = t.responsavel || ''
  document.getElementById('sac-sla').value = t.sla_horas
  openM('m-sac')
}

async function excluirTicket(id) {
  if (!confirmar('Excluir este ticket?')) return
  await supabase.from('tickets_sac').delete().eq('id', id).eq('user_id', currentUser.id)
  toast('Ticket removido')
  await carregarSAC()
}

// ── CHAT ──────────────────────────────────────────────────

async function carregarChat() {
  const { data } = await supabase.from('chat_mensagens').select('*')
    .eq('user_id', currentUser.id).order('created_at').limit(50)

  const el = document.getElementById('chat-msgs')
  if (!el || !data) return

  el.innerHTML = data.map(m => `
    <div class="chat-msg">
      <div class="chat-av">${escapeHtml(m.autor_iniciais)}</div>
      <div>
        <div class="chat-bubble">${escapeHtml(m.mensagem)}</div>
        <div class="chat-time">${new Date(m.created_at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</div>
      </div>
    </div>`).join('')

  el.scrollTop = el.scrollHeight
}

async function sendChat() {
  const input = document.getElementById('chat-input')
  const text = input?.value.trim()
  if (!text) return

  const nome = currentUser.email.split('@')[0]
  const iniciais = nome.slice(0,2).toUpperCase()

  const { error } = await supabase.from('chat_mensagens').insert({
    canal: 'geral',
    autor_nome: nome,
    autor_iniciais: iniciais,
    mensagem: text,
    user_id: currentUser.id
  })

  if (error) { toast('Erro ao enviar', 'err'); return }
  input.value = ''
  await carregarChat()
}

// ── REALTIME (estoque) ────────────────────────────────────

function ativarRealtime() {
  supabase.channel('estoque-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'estoque' }, () => {
      carregarEstoque()
      carregarDashboard()
    })
    .subscribe()
}

// ── INICIAR ───────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await initHub()
  ativarRealtime()
})

// ── Dashboard pedidos recentes ─────────────────────────────
async function carregarDashboardPedidos() {
  const { data } = await supabase.from('pedidos').select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false }).limit(5)

  const el = document.getElementById('dash-pedidos-tbody')
  if (!el || !data) return

  if (!data.length) {
    el.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999;padding:12px;font-size:12px">Nenhum pedido ainda.</td></tr>'
    return
  }

  const statusLabel = {
    novo:'Novo', em_separacao:'Em separação', aguard_envio:'Aguard. envio',
    enviado:'Enviado', entregue:'Entregue', dev_solicitada:'Dev. solicitada', cancelado:'Cancelado'
  }
  const statusCls = {
    novo:'pill-b', em_separacao:'pill-b', aguard_envio:'pill-a',
    enviado:'pill-g', entregue:'pill-g', dev_solicitada:'pill-r', cancelado:'pill-r'
  }

  el.innerHTML = data.map(p => `
    <tr>
      <td class="strong" style="font-family:var(--mono)">${escapeHtml(p.numero)}</td>
      <td>${escapeHtml(p.canal)}</td>
      <td>${formatBRL(p.valor)}</td>
      <td><span class="pill ${statusCls[p.status] || 'pill-b'}">${statusLabel[p.status] || p.status}</span></td>
    </tr>`).join('')
}
