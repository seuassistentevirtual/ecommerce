// auth.js — só protege páginas que NÃO são o index
// Roda em ecommerce_hub.html e painel_admin.html
(async () => {
  const paginaAtual = window.location.pathname.split('/').pop()
  const paginasPublicas = ['index.html', '', '/']
  if (paginasPublicas.includes(paginaAtual)) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    window.location.href = 'index.html'
  }
})()
