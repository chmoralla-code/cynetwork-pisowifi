import { supabase } from '../_lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, fullName, contactNumber } = req.body;

  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;

    const client_id = 'CLI-' + Math.random().toString(36).substr(2,6).toUpperCase();
    
    const { data: profileData, error: profileError } = await supabase
      .from('piso_clients')
      .insert([{
        client_id,
        full_name: fullName,
        email,
        contact_number: contactNumber,
        balance: 0,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (profileError) throw profileError;

    return res.json({
      token: authData.session?.access_token,
      account: profileData
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
