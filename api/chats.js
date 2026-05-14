const { supabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  const { orderId } = req.query;

  if (req.method === 'GET') {
    if (!orderId) return res.status(400).json({ error: 'Order ID required' });

    const { data, error } = await supabase
      .from('piso_chats')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { from, text } = req.body;
    if (!orderId || !from || !text) {
      return res.status(400).json({ error: 'orderId, from, and text are required' });
    }

    const { data, error } = await supabase
      .from('piso_chats')
      .insert([{ 
        order_id: orderId,
        sender: from,
        message: text,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};
