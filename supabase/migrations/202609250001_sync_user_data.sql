begin;

create table if not exists public.profiles (
  user_id uuid constraint profiles_user_id_auth_fkey references auth.users (id) on delete cascade,
  nome text not null default '',
  idade integer,
  cronotipo text not null default 'intermediario',
  data_nascimento date,
  genero text,
  objetivo text,
  horario_preferido text,
  horas_trabalho integer,
  tipo_trabalho text,
  pausa_preferida text,
  avatar_url text,
  email text,
  questionario jsonb,
  rotina jsonb,
  primeiro_acesso boolean not null default true,
  atualizado_em timestamptz not null default now()
);

alter table public.profiles add column if not exists user_id uuid;
alter table public.profiles add column if not exists nome text not null default '';
alter table public.profiles add column if not exists idade integer;
alter table public.profiles add column if not exists cronotipo text not null default 'intermediario';
alter table public.profiles add column if not exists data_nascimento date;
alter table public.profiles add column if not exists genero text;
alter table public.profiles add column if not exists objetivo text;
alter table public.profiles add column if not exists horario_preferido text;
alter table public.profiles add column if not exists horas_trabalho integer;
alter table public.profiles add column if not exists tipo_trabalho text;
alter table public.profiles add column if not exists pausa_preferida text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists questionario jsonb;
alter table public.profiles add column if not exists rotina jsonb;
alter table public.profiles add column if not exists primeiro_acesso boolean not null default true;
alter table public.profiles add column if not exists atualizado_em timestamptz not null default now();

do $migration$
begin
  if exists (select 1 from public.profiles where user_id is null) then
    raise exception 'profiles.user_id contains NULL values; assign each row to an auth user before applying this migration';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_user_id_auth_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_user_id_auth_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end;
$migration$;

alter table public.profiles alter column user_id set not null;
create unique index if not exists profiles_user_id_unique_idx on public.profiles (user_id);

create table if not exists public.user_documents (
  user_id uuid not null references auth.users (id) on delete cascade,
  document jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists user_documents_user_id_unique_idx on public.user_documents (user_id);

alter table public.profiles enable row level security;
alter table public.user_documents enable row level security;

do $policies$
declare
  politica record;
begin
  for politica in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'user_documents')
  loop
    execute format('drop policy %I on public.%I', politica.policyname, politica.tablename);
  end loop;
end;
$policies$;

revoke all on table public.profiles from public, anon;
revoke all on table public.user_documents from public, anon;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update on table public.user_documents to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_documents_select_own on public.user_documents;
create policy user_documents_select_own on public.user_documents
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_documents_insert_own on public.user_documents;
create policy user_documents_insert_own on public.user_documents
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_documents_update_own on public.user_documents;
create policy user_documents_update_own on public.user_documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.salvar_documento_usuario(
  p_documento jsonb,
  p_revision_esperada bigint
)
returns table (revision bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_documento is null or jsonb_typeof(p_documento) <> 'object' then
    raise exception 'DOCUMENT_MUST_BE_JSON_OBJECT' using errcode = '22023';
  end if;

  insert into public.user_documents (user_id, document, revision, updated_at)
  values (v_user_id, p_documento, 1, statement_timestamp())
  on conflict (user_id) do update
    set document = excluded.document,
        revision = user_documents.revision + 1,
        updated_at = statement_timestamp()
    where user_documents.revision = p_revision_esperada
  returning user_documents.revision, user_documents.updated_at
    into v_revision, v_updated_at;

  if not found then
    raise exception 'DOCUMENT_VERSION_CONFLICT' using errcode = '40001';
  end if;

  return query select v_revision, v_updated_at;
end;
$function$;

revoke all on function public.salvar_documento_usuario(jsonb, bigint) from public, anon;
grant execute on function public.salvar_documento_usuario(jsonb, bigint) to authenticated;

notify pgrst, 'reload schema';

commit;
