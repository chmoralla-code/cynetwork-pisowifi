const { supabase } = require('../_lib/supabase');

// POST /api/client/redeem-referral
// Processes a referral reward redemption request
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.split(' ')[1];
  const { gcashName, gcashNumber } = req.body;

  if (!gcashName || !gcashNumber) {
    return res.status(400).json({ error: 'GCash name and number are required' });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { data: client, error: clientError } = await supabase
      .from('piso_clients')
      .select('*')
      .eq('email', user.email)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client account not found' });
    }

    const gross = Number(client.referral_balance) || 0;
    const deduction = Math.round(gross * 0.10);
    const net = Math.max(0, gross - deduction);

    if (net <= 0) {
      return res.status(400).json({ error: 'Insufficient referral balance to redeem' });
    }

    // Reset balance to 0 after redemption request
    const { data: updatedClient, error: updateError } = await supabase
      .from('piso_clients')
      .update({ referral_balance: 0 })
      .eq('client_id', client.client_id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to process redemption' });
    }

    // Normalize response
    const account = {
      id: updatedClient.id,
      clientId: updatedClient.client_id,
      fullName: updatedClient.full_name,
      email: updatedClient.email,
      contactNumber: updatedClient.contact_number,
      balance: Number(updatedClient.balance) || 0,
      referralCode: updatedClient.referral_code || '',
      referralBalance: Number(updatedClient.referral_balance) || 0,
      inviteCount: Number(updatedClient.invite_count) || 0,
      convertedInviteCount: Number(updatedClient.converted_invite_count) || 0,
    };

    return res.json({
      message: `Redemption request for PHP ${net.toLocaleString()} submitted. It will be sent to ${gcashName} (${gcashNumber}) within 2 business days.`,
      account
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
