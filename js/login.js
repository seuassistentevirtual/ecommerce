// ── LOGIN ─────────────────────────────────────────────────
async function login() {
  const email = document.getElementById('login-email').value.trim()
  const senha = document.getElementById('login-senha').value

  document.getElementById('alert-erro').classList.remove('show')
  document.getElementById('alert-pendente').classList.remove('show')

  if (!email || !senha) {
    mostrarErro('Preencha e-mail e senha.')
    return
  }

  const btnLogin = document.querySelector('button[onclick="login()"]')
  if (btnLogin) { btnLogin.disabled = true; btnLogin.textContent = 'Entrando...' }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (btnLogin) { btnLogin.disabled = false; btnLogin.innerHTML = '<i class="ti ti-login"></i>Entrar' }

  if (error) {
    mostrarErro('E-mail ou senha incorretos.')
    return
  }

  const user = data.user
  const isAdmin =
    user.user_metadata?.role === 'admin' ||
    user.app_metadata?.role === 'admin'

  window.location.href = isAdmin ? 'painel_admin.html' : 'ecommerce_hub.html'
}

function mostrarErro(msg) {
  const el = document.getElementById('alert-erro')
  if (el) { el.textContent = msg; el.classList.add('show') }
}

// ── SOLICITAR ACESSO ──────────────────────────────────────
async function solicitarAcesso() {
  const nome  = document.getElementById('sol-nome').value.trim()
  const email = document.getElementById('sol-email').value.trim()
  const senha = document.getElementById('sol-senha').value
  const conf  = document.getElementById('sol-conf').value

  if (!nome || !email || !senha) { alert('Preencha nome, e-mail e senha.'); return }
  if (senha.length < 8)          { alert('A senha deve ter pelo menos 8 caracteres.'); return }
  if (senha !== conf)            { alert('As senhas não coincidem.'); return }

  const btn = document.getElementById('btn-solicitar')
  btn.disabled = true; btn.textContent = 'Enviando...'

  const { error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: { data: { nome_completo: nome, role: 'pendente' } }
  })

  btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i>Enviar solicitação'

  if (error) { alert('Erro: ' + error.message); return }

  goStep('step-aguardando')
}

// ── RECUPERAR SENHA ───────────────────────────────────────
async function recuperarSenha() {
  const email = document.getElementById('rec-email').value.trim()
  if (!email) { alert('Informe seu e-mail.'); return }

  const btn = document.getElementById('btn-recuperar')
  btn.disabled = true; btn.textContent = 'Enviando...'

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/index.html'
  })

  btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail"></i>Enviar link de recuperação'

  if (error) { alert('Erro: ' + error.message); return }

  goStep('step-email-enviado')
}

// Enter no campo senha → login
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-senha')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') login()
  })
})
