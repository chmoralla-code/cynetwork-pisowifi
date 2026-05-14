const { supabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('piso_harvests')
      .select('*')
      .order('harvest_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { machine_name, amount, note } = req.body;
    const { data, error } = await supabase
      .from('piso_harvests')
      .insert([{ machine_name, amount: Number(amount), note }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const { error } = await supabase
      .from('piso_harvests')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: 'Harvest record deleted' });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};
