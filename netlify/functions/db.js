// ============================================================
// Netlify Function: DB書き込み (service_role キー使用)
// ============================================================
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { action, table, data, id } = body;

  try {
    let result;
    if (action === 'insert') {
      const { data: d, error } = await sb.from(table).insert(data).select();
      if (error) throw error;
      result = d;
    } else if (action === 'update') {
      const { data: d, error } = await sb.from(table).update(data).eq('id', id).select();
      if (error) throw error;
      result = d;
    } else if (action === 'delete') {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw error;
      result = { ok: true };

    // ── User management (auth admin) ──────────────────────
    } else if (action === 'list-users') {
      const { data: d, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw error;
      result = d.users.map(u => ({
        id:               u.id,
        email:            u.email,
        display_name:     u.user_metadata?.display_name || '',
        role:             u.user_metadata?.app_role || 'general',
        created_at:       u.created_at,
        last_sign_in_at:  u.last_sign_in_at,
      }));
    } else if (action === 'invite-user') {
      const { data: d, error } = await sb.auth.admin.inviteUserByEmail(data.email, {
        data: { display_name: data.display_name, app_role: data.app_role || 'general' },
      });
      if (error) throw error;
      result = { ok: true, id: d.user?.id };
    } else if (action === 'update-user') {
      const updatePayload = {
        user_metadata: { display_name: data.display_name, app_role: data.app_role },
      };
      if (data.password) updatePayload.password = data.password;
      const { data: d, error } = await sb.auth.admin.updateUserById(id, updatePayload);
      if (error) throw error;
      result = { ok: true, id: d.user?.id };
    } else if (action === 'delete-user') {
      const { error } = await sb.auth.admin.deleteUser(id);
      if (error) throw error;
      result = { ok: true };

    } else {
      return { statusCode: 400, body: 'Unknown action' };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
