-- ============================================================
-- CommerceHub — Script de criação de tabelas no Supabase
-- Execute no SQL Editor do seu projeto Supabase
-- ============================================================

-- 1. LOJAS / CANAIS
create table if not exists lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('digital_marketplace','digital_site','fisico_galpao','fisico_loja')),
  marketplace text,
  responsavel text,
  endereco text,
  status text not null default 'ativo' check (status in ('ativo','inativo')),
  faturamento_mes numeric(12,2) default 0,
  pedidos_mes int default 0,
  avaliacao numeric(3,1),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 2. PRODUTOS
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sku text not null,
  categoria text not null,
  preco numeric(10,2) not null,
  custo numeric(10,2) not null,
  status text not null default 'ativo' check (status in ('ativo','inativo','rascunho')),
  canais text[] default '{}',
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(sku, user_id)
);

-- 3. ESTOQUE (por produto + loja)
create table if not exists estoque (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid references produtos(id) on delete cascade,
  loja_id uuid references lojas(id) on delete cascade,
  quantidade int not null default 0,
  quantidade_minima int not null default 0,
  venda_semanal int default 0,
  user_id uuid references auth.users(id) on delete cascade,
  updated_at timestamptz default now(),
  unique(produto_id, loja_id)
);

-- 4. FORNECEDORES
create table if not exists fornecedores (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  cnpj text,
  categoria text,
  prazo_entrega text,
  telefone text,
  email text,
  observacoes text,
  status text not null default 'ativo' check (status in ('ativo','inativo')),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 5. PEDIDOS A FORNECEDORES
create table if not exists pedidos_fornecedor (
  id uuid primary key default gen_random_uuid(),
  numero text,
  fornecedor_id uuid references fornecedores(id),
  produto_id uuid references produtos(id),
  quantidade int not null,
  urgencia text default 'normal' check (urgencia in ('normal','urgente','critico')),
  status text not null default 'pendente' check (status in ('pendente','em_transito','recebido','cancelado','atrasado')),
  observacoes text,
  emitido_em date default current_date,
  previsao_entrega date,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 6. PEDIDOS DE CLIENTES
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  canal text not null,
  comprador text,
  produto_id uuid references produtos(id),
  produto_nome text,
  valor numeric(10,2) not null,
  status text not null default 'novo' check (status in ('novo','em_separacao','aguard_envio','enviado','entregue','dev_solicitada','cancelado')),
  data_pedido date default current_date,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 7. DEVOLUÇÕES
create table if not exists devolucoes (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references pedidos(id),
  motivo text,
  valor numeric(10,2),
  status text not null default 'aberta' check (status in ('aberta','em_analise','aprovada','rejeitada','concluida')),
  resolucao text,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 8. COMPRADORES
create table if not exists compradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  telefone text,
  total_pedidos int default 0,
  total_gasto numeric(12,2) default 0,
  canal_principal text,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 9. FUNCIONÁRIOS
create table if not exists funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  cargo text,
  telefone text,
  status text not null default 'ativo' check (status in ('ativo','suspenso','inativo')),
  permissoes jsonb default '{}',
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 10. TICKETS SAC
create table if not exists tickets_sac (
  id uuid primary key default gen_random_uuid(),
  numero text,
  canal text not null,
  tipo text not null,
  cliente text,
  pedido_numero text,
  descricao text,
  valor numeric(10,2),
  prioridade text default 'normal' check (prioridade in ('normal','alta','urgente')),
  responsavel text,
  sla_horas int default 24,
  processo_judicial boolean default false,
  numero_processo text,
  status text not null default 'aberto' check (status in ('aberto','em_andamento','fechado_resolvido','fechado_sem_resolucao')),
  resolucao text,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 11. CHAT INTERNO (mensagens)
create table if not exists chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  canal text not null default 'geral',
  autor_nome text not null,
  autor_iniciais text not null,
  mensagem text not null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 12. CONCORRENTES
create table if not exists concorrentes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  site text,
  produtos_monitorados text,
  notas text,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 13. REMANEJO DE ESTOQUE
create table if not exists remanejamentos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid references produtos(id),
  loja_origem_id uuid references lojas(id),
  loja_destino_id uuid references lojas(id),
  quantidade int not null,
  motivo text,
  previsao date,
  status text default 'pendente' check (status in ('pendente','em_transito','concluido','cancelado')),
  observacoes text,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY — cada usuário vê apenas seus dados
-- ============================================================

alter table lojas enable row level security;
alter table produtos enable row level security;
alter table estoque enable row level security;
alter table fornecedores enable row level security;
alter table pedidos_fornecedor enable row level security;
alter table pedidos enable row level security;
alter table devolucoes enable row level security;
alter table compradores enable row level security;
alter table funcionarios enable row level security;
alter table tickets_sac enable row level security;
alter table chat_mensagens enable row level security;
alter table concorrentes enable row level security;
alter table remanejamentos enable row level security;

-- Políticas: dono vê e edita apenas os próprios registros
do $$
declare
  t text;
begin
  foreach t in array array[
    'lojas','produtos','estoque','fornecedores','pedidos_fornecedor',
    'pedidos','devolucoes','compradores','funcionarios','tickets_sac',
    'chat_mensagens','concorrentes','remanejamentos'
  ] loop
    execute format('create policy "%s_owner" on %s for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- ============================================================
-- TRIGGER: atualiza updated_at no estoque automaticamente
-- ============================================================
create or replace function update_estoque_timestamp()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger trg_estoque_updated
  before update on estoque
  for each row execute procedure update_estoque_timestamp();

-- ============================================================
-- VIEW: alertas de estoque (crítico = qty < mínimo)
-- ============================================================
create or replace view alertas_estoque as
select
  e.id,
  p.nome as produto,
  p.sku,
  l.nome as loja,
  e.quantidade,
  e.quantidade_minima,
  e.venda_semanal,
  case
    when e.quantidade = 0 then 'zerado'
    when e.quantidade < e.quantidade_minima then 'critico'
    when e.venda_semanal > 0 and (e.quantidade - e.quantidade_minima) / nullif(e.venda_semanal,0) <= 5 then 'atencao'
    else 'ok'
  end as nivel_alerta,
  e.user_id
from estoque e
join produtos p on p.id = e.produto_id
join lojas l on l.id = e.loja_id;
