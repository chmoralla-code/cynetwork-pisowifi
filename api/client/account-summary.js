import { supabase } from '../_lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Invalid token');

    const { data: profileData, error: profileError } = await supabase
      .from('piso_clients')
      .select('*')
      .eq('email', user.email)
      .single();

    if (profileError) throw profileError;

    return res.json({
      account: profileData
    });
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
}
