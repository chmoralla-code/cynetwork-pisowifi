const { supabase } = require('../_lib/supabase');

function normalizeAccount(row) {
  if (!row) return null;
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
    createdAt: row.created_at
  };
}

// GET /api/client/me — returns the authenticated client's account info
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { data: profileData, error: profileError } = await supabase
      .from('piso_clients')
      .select('*')
      .eq('email', user.email)
      .single();

    if (profileError) {
      return res.status(404).json({ error: 'Client profile not found' });
    }

    return res.json({
      account: normalizeAccount(profileData)
    });
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
};
