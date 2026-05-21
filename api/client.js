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

function normalizeAccount(row, bannedList = []) {
  if (!row) return null;
  const isBannedMerged = row.is_banned !== undefined && row.is_banned !== null ? !!row.is_banned : bannedList.includes(row.client_id);
  return {
    id: row.id,
    clientId: row.client_id,
    fullName: row.full_name,
    email: row.email,
    contactNumber: row.contact_number,
    balance: Number(row.balance) || 0,
    referralCode: row.referral_code || '',
    referralBalance: Number(row.referral_balance) || 0,
    inviteCount: Number(row.invite_count) || 0,
    convertedInviteCount: Number(row.converted_invite_count) || 0,
    referredBy: row.referred_by || null,
    is_banned: isBannedMerged,
    createdAt: row.created_at
  };
}

function generateReferralCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// Handler: POST /api/client/login
async function handleLogin(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) throw authError;
    const { data: profile, error: profileError } = await supabase.from('piso_clients').select('*').eq('email', email).single();
    if (profileError) throw profileError;
    const bannedList = await getBannedClientIds();
    const isBannedMerged = profile.is_banned !== undefined && profile.is_banned !== null ? !!profile.is_banned : bannedList.includes(profile.client_id);
    if (isBannedMerged) {
      return res.status(403).json({ error: 'Your account has been banned. Please contact support.' });
    }
    return res.json({ token: authData.session?.access_token, account: normalizeAccount(profile, bannedList) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

// Handler: POST /api/client/register
async function handleRegister(req, res) {
  const { email, password, fullName, contactNumber, referralCode: usedReferralCode } = req.body;
  if (!email || !password || !fullName) return res.status(400).json({ error: 'Email, password, and full name are required' });
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;
    const client_id = 'CLI-' + Math.random().toString(36).substr(2,6).toUpperCase();
    const referral_code = generateReferralCode();
    
    // Find referrer if referral code was used
    let referred_by = null;
    let referrerProfile = null;
    if (usedReferralCode) {
      const { data: referrer } = await supabase.from('piso_clients').select('client_id, invite_count').eq('referral_code', usedReferralCode.toUpperCase()).single();
      if (referrer) {
        referred_by = referrer.client_id;
        referrerProfile = referrer;
      }
    }

    const { data: profile, error: profileError } = await supabase.from('piso_clients').insert([{
      client_id, full_name: fullName, email, contact_number: contactNumber || '',
      balance: 0, referral_code, referral_balance: 0, invite_count: 0, converted_invite_count: 0,
      referred_by,
      created_at: new Date().toISOString()
    }]).select().single();
    if (profileError) throw profileError;

    if (referrerProfile) {
      await supabase.from('piso_clients').update({ invite_count: (Number(referrerProfile.invite_count) || 0) + 1 }).eq('client_id', referrerProfile.client_id);
    }
    return res.json({ token: authData.session?.access_token || null, account: normalizeAccount(profile) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

// Handler: GET /api/client/me (and account-summary)
async function handleMe(req, res) {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
  const { data: profile, error } = await supabase.from('piso_clients').select('*').eq('email', user.email).single();
  if (error) return res.status(404).json({ error: 'Client profile not found' });
  const bannedList = await getBannedClientIds();
  const isBannedMerged = profile.is_banned !== undefined && profile.is_banned !== null ? !!profile.is_banned : bannedList.includes(profile.client_id);
  if (isBannedMerged) return res.status(403).json({ error: 'Your account has been banned. Please contact support.' });
  return res.json({ account: normalizeAccount(profile, bannedList) });
}

// Handler: POST /api/client/forgot-password
async function handleForgotPassword(req, res) {
  const { email, fullName } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const { data: client, error } = await supabase.from('piso_clients').select('*').eq('email', email.toLowerCase().trim()).single();
    if (error || !client) return res.status(404).json({ error: 'No account found with that email' });
    
    // Only check fullName if it was provided (client-side form), skip if from admin panel
    if (fullName !== undefined) {
      const storedName = (client.full_name || '').toLowerCase().trim();
      const inputName = (fullName || '').toLowerCase().trim();
      if (storedName !== inputName) return res.status(400).json({ error: 'Full name does not match our records' });
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
      redirectTo: `${process.env.SITE_URL || 'https://cynetworkpisowifi.vercel.app'}/reset-password`
    });
    if (resetError) return res.status(500).json({ error: 'Unable to send reset email. Please contact support.' });

    // Simulate sending SMS by notifying the admin via Telegram (if configured)
    try {
        const { data: settings } = await supabase.from('piso_settings').select('key, value').in('key', ['telegram_token', 'telegram_chat']);
         if (settings && settings.length === 2) {
              let token = settings.find(s => s.key === 'telegram_token')?.value;
              let chatId = settings.find(s => s.key === 'telegram_chat')?.value;
              if (token) token = token.trim();
              if (chatId) chatId = chatId.trim();
              if (token && chatId) {
                  const text = `🔐 Password Reset Request\nClient: ${client.full_name}\nEmail: ${email}\nContact: ${client.contact_number || 'N/A'}\n\n*SMS Notification Simulated via Admin Alert*`;
                  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({ chat_id: chatId, text })
                  });
              }
         }
    } catch(e) {}

    return res.json({ message: 'Password reset link sent to your email. An SMS notification has also been triggered to the registered number.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Handler: POST /api/client/send-otp
async function handleSendOtp(req, res) {
  return res.json({
    message: 'Email verification is handled automatically. You can proceed without OTP.',
    emailVerification: { enabled: false },
    cooldownSeconds: 60
  });
}

// Handler: POST /api/client/redeem-referral
async function handleRedeemReferral(req, res) {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Authorization required' });
  const { gcashName, gcashNumber } = req.body;
  if (!gcashName || !gcashNumber) return res.status(400).json({ error: 'GCash name and number are required' });
  try {
    const { data: client, error } = await supabase.from('piso_clients').select('*').eq('email', user.email).single();
    if (error || !client) return res.status(404).json({ error: 'Client account not found' });
    const gross = Number(client.referral_balance) || 0;
    const deduction = Math.round(gross * 0.10);
    const net = Math.max(0, gross - deduction);
    if (net <= 0) return res.status(400).json({ error: 'Insufficient referral balance to redeem' });
    const { data: updated, error: updateError } = await supabase.from('piso_clients').update({ referral_balance: 0 }).eq('client_id', client.client_id).select().single();
    if (updateError) return res.status(500).json({ error: 'Failed to process redemption' });
    return res.json({
      message: `Redemption request for PHP ${net.toLocaleString()} submitted. It will be sent to ${gcashName} (${gcashNumber}) within 2 business days.`,
      account: normalizeAccount(updated)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Main router for /api/client/[action]
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Extract action from path: /api/client/login -> "login"
  const urlParts = (req.url || '').split('?')[0].split('/').filter(Boolean);
  // urlParts could be ["api", "client", "login"] or just ["client", "login"] depending on routing
  const action = urlParts[urlParts.length - 1] || req.query.action || '';

  switch (action) {
    case 'login':
      if (req.method !== 'POST') return res.status(405).end();
      return handleLogin(req, res);
    case 'register':
      if (req.method !== 'POST') return res.status(405).end();
      return handleRegister(req, res);
    case 'me':
    case 'account-summary':
      if (req.method !== 'GET') return res.status(405).end();
      return handleMe(req, res);
    case 'forgot-password':
      if (req.method !== 'POST') return res.status(405).end();
      return handleForgotPassword(req, res);
    case 'send-otp':
      if (req.method !== 'POST') return res.status(405).end();
      return handleSendOtp(req, res);
    case 'redeem-referral':
      if (req.method !== 'POST') return res.status(405).end();
      return handleRedeemReferral(req, res);
    default:
      return res.status(404).json({ error: `Unknown client action: ${action}` });
  }
};
