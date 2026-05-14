import { supabase } from '../_lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) throw authError;

    const { data: profileData, error: profileError } = await supabase
      .from('piso_clients')
      .select('*')
      .eq('email', email)
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
