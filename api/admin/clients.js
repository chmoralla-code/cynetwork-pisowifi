const { supabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('piso_clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    const { data, error } = await supabase
      .from('piso_clients')
      .update(req.body)
      .eq('client_id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};
