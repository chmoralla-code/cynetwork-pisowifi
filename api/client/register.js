const { supabase } = require('../_lib/supabase');

function generateReferralCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, fullName, contactNumber, referralCode: usedReferralCode } = req.body;

  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Email, password, and full name are required' });
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;

    const client_id = 'CLI-' + Math.random().toString(36).substr(2,6).toUpperCase();
    const referral_code = generateReferralCode();
    
    const { data: profileData, error: profileError } = await supabase
      .from('piso_clients')
      .insert([{
        client_id,
        full_name: fullName,
        email,
        contact_number: contactNumber || '',
        balance: 0,
        referral_code,
        referral_balance: 0,
        invite_count: 0,
        converted_invite_count: 0,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (profileError) throw profileError;

    // If a referral code was used, credit the referrer
    if (usedReferralCode) {
      const { data: referrer } = await supabase
        .from('piso_clients')
        .select('client_id, invite_count')
        .eq('referral_code', usedReferralCode.toUpperCase())
        .single();

      if (referrer) {
        await supabase
          .from('piso_clients')
          .update({ invite_count: (Number(referrer.invite_count) || 0) + 1 })
          .eq('client_id', referrer.client_id);
      }
    }

    return res.json({
      token: authData.session?.access_token || null,
      account: normalizeAccount(profileData)
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
