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
