const { supabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { data: orders, error } = await supabase
      .from('piso_orders')
      .select('price, status, created_at');

    if (error) throw error;

    const revenue = orders
      .filter(o => o.status === 'approved' || o.status === 'delivery' || o.status === 'completed')
      .reduce((sum, o) => sum + (Number(o.price) || 0), 0);

    const totalOrders = orders.length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const approved = orders.filter(o => o.status === 'approved').length;
    const delivery = orders.filter(o => o.status === 'delivery').length;
    const rejected = orders.filter(o => o.status === 'rejected').length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;

    // Sales report metrics
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);

    const todaySales = orders
      .filter(o => o.created_at.startsWith(today) && (o.status === 'approved' || o.status === 'delivery' || o.status === 'completed'))
      .reduce((sum, o) => sum + (Number(o.price) || 0), 0);

    const monthSales = orders
      .filter(o => o.created_at.startsWith(thisMonth) && (o.status === 'approved' || o.status === 'delivery' || o.status === 'completed'))
      .reduce((sum, o) => sum + (Number(o.price) || 0), 0);

    const unitsSold = orders.filter(o => o.status === 'approved' || o.status === 'delivery' || o.status === 'completed').length;
    const avgOrderValue = unitsSold > 0 ? revenue / unitsSold : 0;

    return res.json({
      revenue: `\u20b1${revenue.toLocaleString()}`,
      totalOrders,
      pending,
      approved,
      delivery,
      rejected,
      completed,
      cancelled,
      todaySales: `\u20b1${todaySales.toLocaleString()}`,
      monthSales: `\u20b1${monthSales.toLocaleString()}`,
      unitsSold,
      avgOrderValue: `\u20b1${Math.round(avgOrderValue).toLocaleString()}`,
      weeklySales: [],
      labels: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
