const { supabase } = require('./_lib/supabase');
const { list, del } = require('@vercel/blob');

// Handler: GET /api/admin/stats
async function handleStats(req, res) {
  try {
    const { data: orders, error } = await supabase.from('piso_orders').select('price, status, created_at');
    if (error) throw error;
    const approved_statuses = ['approved', 'delivery', 'completed'];
    const revenue = orders.filter(o => approved_statuses.includes(o.status)).reduce((sum, o) => sum + (Number(o.price) || 0), 0);
    const totalOrders = orders.length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const approved = orders.filter(o => o.status === 'approved').length;
    const delivery = orders.filter(o => o.status === 'delivery').length;
    const rejected = orders.filter(o => o.status === 'rejected').length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);
    const todaySales = orders.filter(o => o.created_at.startsWith(today) && approved_statuses.includes(o.status)).reduce((sum, o) => sum + (Number(o.price) || 0), 0);
    const monthSales = orders.filter(o => o.created_at.startsWith(thisMonth) && approved_statuses.includes(o.status)).reduce((sum, o) => sum + (Number(o.price) || 0), 0);
    const unitsSold = orders.filter(o => approved_statuses.includes(o.status)).length;
    const avgOrderValue = unitsSold > 0 ? revenue / unitsSold : 0;
    return res.json({
      revenue: `\u20b1${revenue.toLocaleString()}`, totalOrders, pending, approved, delivery, rejected, completed, cancelled,
      todaySales: `\u20b1${todaySales.toLocaleString()}`, monthSales: `\u20b1${monthSales.toLocaleString()}`,
      unitsSold, avgOrderValue: `\u20b1${Math.round(avgOrderValue).toLocaleString()}`,
      weeklySales: [], labels: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Handler: /api/admin/juanfi
async function handleJuanfi(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('piso_harvests').select('*').order('harvest_date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  if (req.method === 'POST') {
    const { machine_name, amount, note } = req.body;
    const { data, error } = await supabase.from('piso_harvests').insert([{ machine_name, amount: Number(amount), note }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  if (req.method === 'DELETE') {
    const { id } = req.query;
    const { error } = await supabase.from('piso_harvests').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: 'Harvest record deleted' });
  }
  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).end();
}

// Handler: /api/admin/clients
async function handleClients(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('piso_clients').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  if (req.method === 'PUT') {
    const { id } = req.query;
    const { data, error } = await supabase.from('piso_clients').update(req.body).eq('client_id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).end();
}

// Handler: /api/admin/chats
async function handleChats(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('piso_chat_sessions').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  return res.status(405).end();
}

// Handler: /api/admin/images
async function handleImages(req, res) {
  if (req.method === 'GET') {
    try {
      const { blobs } = await list();
      return res.json(blobs);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  if (req.method === 'DELETE') {
    try {
      const { url } = req.query;
      await del(url);
      return res.json({ message: 'Deleted' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  return res.status(405).end();
}

// Handler: /api/admin/packages
async function handlePackages(req, res) {
  if (req.method === 'POST') {
    const { id, name, price, originalPrice, duration, description, features, popular } = req.body;
    const { data, error } = await supabase.from('piso_packages').upsert([{ 
      id, name, price, originalPrice, duration, description, features, popular 
    }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  return res.status(405).end();
}

// Handler: /api/admin/settings
async function handleSettings(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('piso_settings').select('*');
    if (error) return res.json({}); // graceful fallback if table missing
    const settingsObj = {};
    if (data) data.forEach(row => settingsObj[row.key] = row.value);
    return res.json(settingsObj);
  }
  if (req.method === 'POST') {
    const updates = Object.entries(req.body).map(([key, value]) => ({ key, value }));
    const { data, error } = await supabase.from('piso_settings').upsert(updates, { onConflict: 'key' }).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  return res.status(405).end();
}

// Main router for /api/admin/[action]
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlParts = (req.url || '').split('?')[0].split('/').filter(Boolean);
  const action = urlParts[urlParts.length - 1] || req.query.action || '';

  switch (action) {
    case 'stats':
      if (req.method !== 'GET') return res.status(405).end();
      return handleStats(req, res);
    case 'juanfi':
      return handleJuanfi(req, res);
    case 'clients':
      return handleClients(req, res);
    case 'chats':
      return handleChats(req, res);
    case 'images':
      return handleImages(req, res);
    case 'packages':
      return handlePackages(req, res);
    case 'settings':
      return handleSettings(req, res);
    default:
      return res.status(404).json({ error: `Unknown admin action: ${action}` });
  }
};
