import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const MAP_MODULES = new Set([
  'dashboard','mapaInicial','mapaAtual','movimentacoes','nascimentos','mortalidade',
  'reidentificacao','fichaAnimal','inventario','relatorios','configuracoes'
]);

function corsFor(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const ok = origin === 'https://mapa-de-rebanho.vercel.app' ||
    origin === 'https://emersonsilvaol.github.io' ||
    /^https:\/\/mapa-de-rebanho(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin) ||
    /^http:\/\/localhost(?::\d+)?$/i.test(origin) ||
    !origin;
  const allowOrigin = ok && origin ? origin : 'https://mapa-de-rebanho.vercel.app';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  };
}

function cleanPermissions(input: unknown) {
  const out: Record<string,string[]> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [mod, actions] of Object.entries(input as Record<string,unknown>)) {
    if (!MAP_MODULES.has(mod) || !Array.isArray(actions)) continue;
    out[mod] = [...new Set(actions.filter(a => ['ver','editar','excluir','exportar'].includes(String(a))).map(String))];
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405);

  const origin = req.headers.get('Origin') || '';
  const originAllowed = !origin || origin === 'https://mapa-de-rebanho.vercel.app' ||
    origin === 'https://emersonsilvaol.github.io' ||
    /^https:\/\/mapa-de-rebanho(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin) ||
    /^http:\/\/localhost(?::\d+)?$/i.test(origin);
  if (!originAllowed) return reply({ error: 'Origem não autorizada.' }, 403);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return reply({ error: 'Sessão expirada. Entre novamente.' }, 401);

    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user) return reply({ error: 'Sessão expirada. Entre novamente.' }, 401);

    const { data: caller, error: callerError } = await admin.from('profiles')
      .select('id,role,ativo,email')
      .eq('id', user.id)
      .maybeSingle();

    const bootstrapAdmin = caller?.role === 'admin' && ['emerson.oliveira@fazendabodoquena.com.br','emersontec13@gmail.com'].includes(String(user.email || '').toLowerCase());
    if (callerError || !caller || caller.ativo !== true) return reply({ error: 'Usuário bloqueado.' }, 403);
    if (!bootstrapAdmin) {
      return reply({ error: 'Acesso exclusivo do administrador.' }, 403);
    }

    const body = await req.json();
    const action = String(body?.action || '');

    if (action === 'list') {
      const { data: profiles, error: pErr } = await admin.from('profiles')
        .select('id,nome,email,role,ativo,permissions,created_at')
        .order('nome');
      if (pErr) throw pErr;

      const authById = new Map<string, any>();
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        for (const u of data.users) authById.set(u.id, u);
        if (data.users.length < 1000) break;
      }

      const users = (profiles || []).map((p: any) => {
        const au = authById.get(p.id);
        return {
          ...p,
          email: p.email || au?.email || '',
          last_sign_in_at: au?.last_sign_in_at || null,
          created_at: p.created_at || au?.created_at || null
        };
      });
      return reply({ users });
    }

    if (!['create','update'].includes(action)) return reply({ error: 'Ação inválida.' }, 400);

    const nome = String(body?.nome || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const role = ['admin','gestor','controladoria','visualizacao','usuario'].includes(String(body?.role || ''))
      ? String(body.role)
      : 'usuario';
    const permissions = Object.fromEntries(Object.entries(cleanPermissions(body?.permissions)).map(([m,a])=>[m,a.filter(x=>['ver','exportar'].includes(x)||(x==='editar'&&['mapaInicial','movimentacoes','nascimentos','mortalidade','reidentificacao'].includes(m)))]));
    const ativo = body?.ativo !== false;

    if (!nome || nome.length > 100) return reply({ error: 'Informe um nome válido.' }, 400);
    if (!/^\S+@\S+\.\S+$/.test(email)) return reply({ error: 'Informe um e-mail válido.' }, 400);

    if (action === 'create') {
      const password = String(body?.password || '');
      if (password.length < 6 || password.length > 256) return reply({ error: 'Use uma senha inicial de pelo menos 6 caracteres.' }, 400);

      let target: any = null;
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        target = data.users.find(u => u.email?.toLowerCase() === email) || null;
        if (target || data.users.length < 1000) break;
      }

      if (target) {
        const { data: existing } = await admin.from('profiles').select('id').eq('id', target.id).maybeSingle();
        if (existing) return reply({ error: 'Esse usuário já está cadastrado. Use a edição de acessos.' }, 409);
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { nome, full_name: nome }
        });
        if (error || !data.user) return reply({ error: error?.message || 'Não foi possível criar o usuário.' }, 400);
        target = data.user;
      }

      const { error: profileError } = await admin.from('profiles').upsert({
        id: target.id,
        nome,
        email,
        role,
        ativo,
        permissions
      });
      if (profileError) throw profileError;
      await admin.from('mapa_access_audit').insert({actor_id:user.id,actor_email:user.email,action:'CRIAR_USUARIO',module:'profiles',details:{id:target.id,nome,email,role,ativo,permissions}});
      return reply({ ok: true, id: target.id });
    }

    const id = String(body?.id || '').trim();
    if (!id) return reply({ error: 'Usuário não informado.' }, 400);
    if (id === user.id && role !== 'admin') return reply({ error: 'Você deve manter seu próprio perfil de administrador.' }, 400);
    if (id === user.id && ativo === false) return reply({ error: 'Você não pode bloquear seu próprio acesso.' }, 400);

    const attrs: Record<string,unknown> = {};
    if (email) attrs.email = email;
    if (body?.password) {
      const password = String(body.password);
      if (password.length < 6 || password.length > 256) return reply({ error: 'A nova senha deve ter pelo menos 6 caracteres.' }, 400);
      attrs.password = password;
    }
    attrs.user_metadata = { nome, full_name: nome };

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(id, attrs);
    if (authUpdateError) return reply({ error: authUpdateError.message }, 400);

    const { error: profileUpdateError } = await admin.from('profiles').upsert({
      id,
      nome,
      email,
      role,
      ativo,
      permissions
    });
    if (profileUpdateError) throw profileUpdateError;

    await admin.from('mapa_access_audit').insert({actor_id:user.id,actor_email:user.email,action:'ALTERAR_USUARIO',module:'profiles',details:{id,nome,email,role,ativo,permissions}});
    return reply({ ok: true, id });
  } catch (e) {
    console.error('admin-users failed:', e);
    return reply({ error: e instanceof Error ? e.message : 'Não foi possível salvar os acessos.' }, 500);
  }
});
