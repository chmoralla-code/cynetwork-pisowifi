import { supabase } from '../_lib/supabase';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('piso_orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const orderData = req.body;
    const { data, error } = await supabase
      .from('piso_orders')
      .insert([{ 
        ...orderData, 
        order_id: 'CNW-' + Math.random().toString(36).substr(2,6).toUpperCase(),
        status: 'pending',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
