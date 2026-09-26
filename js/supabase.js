import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://uyhynxvqmmzinojdidml.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5aHlueHZxbW16aW5vamRpZG1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNzgyOTYsImV4cCI6MjEwNTk1NDI5Nn0.g55ekIqILI9Nd3bc9W5hWMpYUSht9SDN5gtlAzlipaQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

const BUCKET_AVATARES = 'chronos-avatars'

export async function enviarFotoPerfil(arquivo) {
  const usuario = await obterUsuarioAtual()
  if (!usuario) throw new Error('Entre na sua conta para alterar a foto.')
  if (!(arquivo instanceof File)) throw new Error('Selecione um arquivo de imagem.')

  const extensoes = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  }
  const extensao = extensoes[arquivo.type]
  if (!extensao) throw new Error('Use uma imagem JPG, PNG ou WebP.')
  if (arquivo.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.')

  const pastaUsuario = usuario.id
  const caminho = `${pastaUsuario}/avatar.${extensao}`
  const { error } = await supabase.storage.from(BUCKET_AVATARES).upload(caminho, arquivo, {
    upsert: true,
    cacheControl: '0',
    contentType: arquivo.type
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET_AVATARES).getPublicUrl(caminho)
  const url = new URL(data.publicUrl)
  url.searchParams.set('v', String(Date.now()))

  return url.toString()
}

export async function removerFotosAntigasPerfil(urlAtual) {
  const usuario = await obterUsuarioAtual()
  if (!usuario || !urlAtual) return
  const url = new URL(urlAtual)
  const marcador = `/storage/v1/object/public/${BUCKET_AVATARES}/`
  const indice = url.pathname.indexOf(marcador)
  if (indice < 0) return
  const caminhoAtual = decodeURIComponent(url.pathname.slice(indice + marcador.length))
  if (!caminhoAtual.startsWith(`${usuario.id}/`)) return

  const { data: arquivos, error: erroLista } = await supabase.storage
    .from(BUCKET_AVATARES)
    .list(usuario.id, { limit: 20 })

  if (!erroLista && arquivos?.length) {
    const antigos = arquivos
      .map(item => `${usuario.id}/${item.name}`)
      .filter(item => item !== caminhoAtual && /^.+\/avatar\.(jpg|png|webp)$/.test(item))
    if (antigos.length) {
      const { error: erroRemocao } = await supabase.storage.from(BUCKET_AVATARES).remove(antigos)
      if (erroRemocao) console.warn('Foto antiga mantida no Storage:', erroRemocao)
    }
  }
}

export async function salvarPerfilUsuario(dados = {}) {
  const usuario = await obterUsuarioAtual()
  if (!usuario) throw new Error('Entre na sua conta para salvar o perfil.')

  const payload = {
    user_id: usuario.id,
    nome: dados.nome || '',
    idade: dados.idade ?? null,
    cronotipo: dados.cronotipo || null,
    data_nascimento: dados.data_nascimento || null,
    genero: dados.genero || null,
    objetivo: dados.objetivo || null,
    horario_preferido: dados.horario_preferido || null,
    horas_trabalho: dados.horas_trabalho ?? null,
    tipo_trabalho: dados.tipo_trabalho || null,
    pausa_preferida: dados.pausa_preferida || null,
    avatar_url: dados.avatar_url || null,
    email: dados.email || null,
    questionario: dados.questionario || null,
    rotina: dados.rotina || null,
    primeiro_acesso: dados.primeiro_acesso ?? true,
    atualizado_em: new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function cadastrarUsuario(email, senha, perfil = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      data: {
        nome: perfil.nome || '',
        idade: perfil.idade ?? null,
        cronotipo: perfil.cronotipo || 'intermediario',
        data_nascimento: perfil.data_nascimento || null,
        genero: perfil.genero || null,
        objetivo: perfil.objetivo || null,
        horario_preferido: perfil.horario_preferido || null,
        horas_trabalho: perfil.horas_trabalho ?? null,
        avatar_url: perfil.avatar_url || null,
        tipo_trabalho: perfil.tipo_trabalho || null,
        pausa_preferida: perfil.pausa_preferida || null,
        primeiro_acesso: perfil.primeiro_acesso ?? true
      }
    }
  })

  if (error) {
    if (error.message?.toLowerCase().includes('user already registered')) {
      throw new Error('Esse e-mail já está cadastrado. Tente entrar com a senha correta.')
    }
    throw error
  }

  const usuario = data.user
  if (!usuario) throw new Error('Usuário não foi criado.')
  return data
}

export async function entrarUsuario(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) {
    if (error.message?.toLowerCase().includes('invalid login credentials')) {
      throw new Error('Credenciais inválidas. Verifique o e-mail, a senha e se esta conta foi criada no mesmo projeto do Supabase.')
    }
    if (error.message?.toLowerCase().includes('email not confirmed')) {
      throw new Error('E-mail ainda não foi confirmado. Abra o link de confirmação enviado para sua caixa de entrada.')
    }
    throw error
  }
  return data
}

export async function reenviarConfirmacaoEmail(email, redirectTo) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: redirectTo }
  })
  if (error) throw error
}

export async function solicitarRedefinicaoSenha(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}

export async function atualizarSenhaUsuario(senha) {
  const { data, error } = await supabase.auth.updateUser({ password: senha })
  if (error) throw error
  return data
}

export async function iniciarDesafioMfa() {
  const { data: nivel, error: erroNivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (erroNivel) throw erroNivel
  if (nivel.currentLevel === 'aal2' || nivel.nextLevel !== 'aal2') return null

  const fatores = await listarFatoresTotp()
  const fator = fatores.find(item => item.status === 'verified')
  if (!fator) return null

  const { data: desafio, error } = await supabase.auth.mfa.challenge({ factorId: fator.id })
  if (error) throw error
  return { factorId: fator.id, challengeId: desafio.id }
}

export async function listarFatoresTotp() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data?.totp || []
}

export async function inscreverFatorTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Chronos Ultra'
  })
  if (error) throw error
  return data
}

export async function desafiarFatorTotp(factorId) {
  const { data, error } = await supabase.auth.mfa.challenge({ factorId })
  if (error) throw error
  return data
}

export async function verificarFatorTotp(factorId, challengeId, code) {
  const { data, error } = await supabase.auth.mfa.verify({ factorId, challengeId, code })
  if (error) throw error
  return data
}

export async function desativarFatorTotp(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}

export async function sairUsuario() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function obterUsuarioAtual() {
  const { data: { session }, error: erroSessao } = await supabase.auth.getSession()
  if (erroSessao) throw erroSessao
  if (!session?.user) return null

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

export async function atualizarEmailUsuario(email) {
  if (!email) return null
  const { data, error } = await supabase.auth.updateUser({ email })
  if (error) throw error
  return data
}

export async function obterPerfilUsuario() {
  const usuario = await obterUsuarioAtual()
  if (!usuario) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', usuario.id)
    .maybeSingle()

  if (error) throw error
  if (data) return data

  const metadata = usuario.user_metadata || {}
  const dataNascimento = metadata.data_nascimento || null
  const idadeCalculada = dataNascimento
    ? Math.max(8, new Date().getFullYear() - new Date(dataNascimento).getFullYear())
    : null

  return salvarPerfilUsuario({
    nome: metadata.nome || usuario.email?.split('@')[0] || 'Usuário',
    email: usuario.email || '',
    idade: Number(metadata.idade) || idadeCalculada,
    cronotipo: metadata.cronotipo || 'intermediario',
    data_nascimento: dataNascimento,
    genero: metadata.genero || null,
    objetivo: metadata.objetivo || null,
    horario_preferido: metadata.horario_preferido || null,
    horas_trabalho: Number(metadata.horas_trabalho) || null,
    tipo_trabalho: metadata.tipo_trabalho || null,
    pausa_preferida: metadata.pausa_preferida || null,
    avatar_url: metadata.avatar_url || null,
    primeiro_acesso: metadata.primeiro_acesso ?? true
  })
}

export async function obterDocumentoUsuario() {
  const usuario = await obterUsuarioAtual()
  if (!usuario) throw new Error('Entre na sua conta para carregar seus dados.')

  const { data, error } = await supabase
    .from('user_documents')
    .select('document, revision')
    .eq('user_id', usuario.id)
    .maybeSingle()

  if (error) throw error
  return data || { document: null, revision: 0 }
}

export async function salvarDocumentoUsuario(documento, revisaoEsperada = 0) {
  const { data, error } = await supabase.rpc('salvar_documento_usuario', {
    p_documento: documento,
    p_revision_esperada: revisaoEsperada
  })

  if (error) throw error
  const salvo = Array.isArray(data) ? data[0] : data
  if (!salvo || !Number.isInteger(Number(salvo.revision))) {
    throw new Error('O Supabase não confirmou a gravação do documento.')
  }
  return salvo
}
