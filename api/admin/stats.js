import { supabase } from '../_lib/supabase';

export default async function handler(req, res) {
  // Simple check for Admin API Key or similar for demo protection
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    // Analytics: Total Orders, Revenue, Pending
    const { data: stats, error } = await supabase
      .from('piso_orders')
      .select('status, price');

    if (error) throw error;

    const totalOrders = stats.length;
    const revenue = stats.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
    const pending = stats.filter(s => s.status === 'pending').length;

    // Daily Stats Placeholder
    const dailyStats = [
      { day: 'Mon', value: 12 },
      { day: 'Tue', value: 19 },
      { day: 'Wed', value: 3 },
      { day: 'Thu', value: 5 },
      { day: 'Fri', value: 2 },
      { day: 'Sat', value: 3 },
    ];

    return res.json({
      totalOrders,
      revenue,
      pending,
      dailyStats
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
