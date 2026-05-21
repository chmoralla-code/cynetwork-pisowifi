const { supabase } = require('./_lib/supabase');

// Helper to get banned client IDs from piso_settings as a fallback
async function getBannedClientIds() {
  try {
    const { data, error } = await supabase.from('piso_settings').select('*').eq('key', 'banned_clients').single();
    if (error || !data) return [];
    return data.value ? data.value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

// Helper to update ban status in piso_settings as a fallback
async function setClientBanStatus(clientId, isBanned) {
  try {
    const banned = await getBannedClientIds();
    const index = banned.indexOf(clientId);
    if (isBanned) {
      if (index === -1) banned.push(clientId);
    } else {
      if (index !== -1) banned.splice(index, 1);
    }
    const val = banned.join(',');
    await supabase.from('piso_settings').upsert([{ key: 'banned_clients', value: val }], { onConflict: 'key' });
    return true;
  } catch (e) {
    return false;
  }
}


// Handler: GET /api/admin/stats
async function handleStats(req, res) {
  try {
    const { data: orders, error } = await supabase.from('piso_orders').select('price, status, created_at, package, package_name, quantity');
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

    // Calculate dynamic Sales by Package
    const approvedOrders = orders.filter(o => approved_statuses.includes(o.status));
    const packageMap = {};
    approvedOrders.forEach(o => {
      const pkgName = o.package_name || o.package || 'Unknown';
      if (!packageMap[pkgName]) {
        packageMap[pkgName] = { package: pkgName, orders: 0, units: 0, sales: 0 };
      }
      packageMap[pkgName].orders += 1;
      packageMap[pkgName].units += Number(o.quantity) || 1;
      packageMap[pkgName].sales += Number(o.price) || 0;
    });
    const salesByPackage = Object.values(packageMap).sort((a, b) => b.sales - a.sales);

    // Calculate dynamic 7 Days Sales Trend
    const last7DaysSales = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const dayOrders = orders.filter(o => o.created_at.startsWith(dateStr));
      const dayApproved = dayOrders.filter(o => approved_statuses.includes(o.status));
      
      const orderCount = dayOrders.length;
      const units = dayApproved.reduce((sum, o) => sum + (Number(o.quantity) || 1), 0);
      const sales = dayApproved.reduce((sum, o) => sum + (Number(o.price) || 0), 0);
      const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      last7DaysSales.push({
        date: formattedDate,
        orders: orderCount,
        units,
        sales
      });
    }

    return res.json({
      revenue: `₱${revenue.toLocaleString()}`, totalOrders, pending, approved, delivery, rejected, completed, cancelled,
      todaySales: `₱${todaySales.toLocaleString()}`, monthSales: `₱${monthSales.toLocaleString()}`,
      unitsSold, avgOrderValue: `₱${Math.round(avgOrderValue).toLocaleString()}`,
      salesByPackage,
      last7DaysSales,
      weeklySales: [], labels: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Handler: POST /api/admin/test-telegram
async function handleTestTelegram(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }

  try {
    const { type, token: overrideToken, chatId: overrideChatId } = req.body;
    let token = overrideToken;
    let chatId = overrideChatId;

    // Fallback to DB settings if overrides are not provided
    if (!token || !chatId) {
      const { data: settings, error: settingsError } = await supabase
        .from('piso_settings')
        .select('key, value')
        .in('key', ['telegram_token', 'telegram_chat']);
      
      if (!settingsError && settings) {
        if (!token) token = settings.find(s => s.key === 'telegram_token')?.value;
        if (!chatId) chatId = settings.find(s => s.key === 'telegram_chat')?.value;
      }
    }

    if (!token || !chatId) {
      return res.status(400).json({ error: 'Telegram Bot Token and Chat ID are required for testing. Please configure them in Settings.' });
    }

    let messageText = '';
    if (type === 'sale') {
      const mockOrderId = 'CNW-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      const mockRef = 'RF-' + Math.floor(1000000000 + Math.random() * 9000000000);
      messageText = `💰 *CYNETWORK PisoWiFi Sales Alert* 💰\n\n` +
        `📦 *Package:* Cyber Pro Premium (Test)\n` +
        `💵 *Price:* ₱250.00\n` +
        `🔢 *Quantity:* 1 unit(s)\n` +
        `🏷️ *Order ID:* ${mockOrderId}\n` +
        `👤 *Client:* Cyrhiel (Tester)\n` +
        `📞 *Contact:* +639123456789\n` +
        `🏠 *Address:* 127.0.0.1 (Localhost Testing)\n` +
        `🔗 *GCash Reference:* \`${mockRef}\`\n\n` +
        `🔥 *Status:* PENDING (Waiting for Admin approval)\n\n` +
        `*SMS simulated via Admin Telegram notification.*`;
    } else {
      messageText = `⚡ *CYNETWORK Bot Connection Test* ⚡\n\n` +
        `🎉 Congratulations! Your CYNETWORK PisoWiFi Admin Panel Telegram bot is properly configured and successfully connected.\n\n` +
        `🤖 *Bot Status:* Online\n` +
        `📅 *Time:* ${new Date().toLocaleString()}`;
    }

    const telegramRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'Markdown'
      })
    });

    const telegramResult = await telegramRes.json();
    if (!telegramRes.ok || !telegramResult.ok) {
      return res.status(400).json({
        error: telegramResult.description || 'Failed to send message via Telegram API'
      });
    }

    return res.json({ success: true, message: 'Test message sent successfully!' });
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
    const { machine_name, amount, note, harvest_date } = req.body;
    const insertData = { machine_name, amount: Number(amount), note };
    if (harvest_date) insertData.harvest_date = harvest_date;
    const { data, error } = await supabase.from('piso_harvests').insert([insertData]).select().single();
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
    
    // Enriched with virtual fallback if is_banned column is missing
    const bannedList = await getBannedClientIds();
    const enriched = (data || []).map(c => ({
      ...c,
      is_banned: c.is_banned !== undefined && c.is_banned !== null ? !!c.is_banned : bannedList.includes(c.client_id)
    }));
    
    return res.json(enriched);
  }
  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Client ID is required' });
    
    const updates = {};
    if (req.body.balance !== undefined) updates.balance = Number(req.body.balance);
    if (req.body.referral_balance !== undefined) updates.referral_balance = Number(req.body.referral_balance);
    if (req.body.is_banned !== undefined) updates.is_banned = !!req.body.is_banned;
    
    let data = null;
    let error = null;
    let banError = null;
    
    if (Object.keys(updates).length > 0) {
      // Attempt unified update
      const resUpdate = await supabase.from('piso_clients').update(updates).eq('client_id', id).select().single();
      data = resUpdate.data;
      error = resUpdate.error;
      
      // Transparent fallback if is_banned column is missing or update throws an error
      if (error && req.body.is_banned !== undefined) {
        const fallbackUpdates = { ...updates };
        delete fallbackUpdates.is_banned;
        
        let retryRes = null;
        if (Object.keys(fallbackUpdates).length > 0) {
          retryRes = await supabase.from('piso_clients').update(fallbackUpdates).eq('client_id', id).select().single();
          data = retryRes.data;
          error = retryRes.error;
        } else {
          retryRes = await supabase.from('piso_clients').select('*').eq('client_id', id).single();
          data = retryRes.data;
          error = retryRes.error;
        }
        
        const success = await setClientBanStatus(id, req.body.is_banned);
        if (success) {
          error = null; // Suppress error since fallback worked
        } else {
          banError = 'Failed to set ban status in settings fallback';
        }
      }
    } else {
      const resSelect = await supabase.from('piso_clients').select('*').eq('client_id', id).single();
      data = resSelect.data;
      error = resSelect.error;
    }
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Client not found' });
    
    const bannedList = await getBannedClientIds();
    const isBannedMerged = data.is_banned !== undefined && data.is_banned !== null ? !!data.is_banned : bannedList.includes(data.client_id);
    
    return res.json({ ...data, is_banned: isBannedMerged, _banError: banError });
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
      const { data, error } = await supabase.storage.from('piso_images').list();
      if (error) throw error;
      const blobs = data.map(f => {
        const { data: publicUrlData } = supabase.storage.from('piso_images').getPublicUrl(f.name);
        return { url: publicUrlData.publicUrl, pathname: f.name };
      });
      return res.json(blobs);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  if (req.method === 'DELETE') {
    try {
      const { url } = req.query;
      if (!url) return res.status(400).json({ error: 'URL required' });
      const filename = url.split('/').pop();
      const { error } = await supabase.storage.from('piso_images').remove([filename]);
      if (error) throw error;
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
    const { id, name, price, originalPrice, duration, description, features, popular, media_url } = req.body;
    const { data, error } = await supabase.from('piso_packages').upsert([{ 
      id, name, price, originalPrice, duration, description, features, popular, media_url 
    }], { onConflict: 'id' }).select().single();
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
    case 'test-telegram':
      return handleTestTelegram(req, res);
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
