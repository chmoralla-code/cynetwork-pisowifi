const { supabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    if (id) {
      const { data, error } = await supabase
        .from('piso_orders')
        .select('*')
        .or(`order_id.eq.${id},tracking_number.eq.${id}`)
        .single();
      
      if (error) return res.status(404).json({ error: 'Order not found' });
      return res.json(data);
    }

    const { data, error } = await supabase
      .from('piso_orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { 
      packageId, packageName, price, unitPrice, totalPrice, 
      shippingFee, quantity, duration, fullName, contactNumber, 
      address, wifiName, wifiPassword, wifiRate, proofImage,
      refNumber, contactEmail
    } = req.body;

    const order_id = 'CNW-' + Math.random().toString(36).substr(2,6).toUpperCase();
    const tracking_number = 'TRK-' + Date.now().toString().slice(-6) + Math.random().toString(36).substr(2,4).toUpperCase();
    
    // Auth check to determine if the buying client was referred and this is their first order
    let referralRewardApplied = false;
    let referralRewardAmount = 0;
    
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (!authError && user) {
          const { data: clientProfile } = await supabase.from('piso_clients').select('*').eq('email', user.email).single();
          
          if (clientProfile && clientProfile.referred_by) {
            // Check if this is the client's first order
            const { count, error: countError } = await supabase
              .from('piso_orders')
              .select('*', { count: 'exact', head: true })
              .eq('contact_email', user.email);
            
            if (!countError && count === 0) {
              const { data: referrer } = await supabase
                .from('piso_clients')
                .select('*')
                .eq('client_id', clientProfile.referred_by)
                .single();
              
              if (referrer) {
                // Credit PHP 100 to referrer
                const newReferralBalance = (Number(referrer.referral_balance) || 0) + 100;
                const newConvertedCount = (Number(referrer.converted_invite_count) || 0) + 1;
                
                await supabase
                  .from('piso_clients')
                  .update({
                    referral_balance: newReferralBalance,
                    converted_invite_count: newConvertedCount
                  })
                  .eq('client_id', referrer.client_id);
                
                referralRewardApplied = true;
                referralRewardAmount = 100;
                console.log(`Referral reward credited to ${referrer.client_id} (referred client ${clientProfile.client_id})`);
              }
            }
          }
        }
      }
    } catch (refErr) {
      console.error('Error during referral crediting check:', refErr.message);
    }

    const { data, error } = await supabase
      .from('piso_orders')
      .insert([{ 
        order_id,
        tracking_number,
        full_name: fullName,
        package: packageId,
        package_name: packageName,
        price: Number(price) || 0,
        unit_price: Number(unitPrice) || 0,
        total_price: Number(totalPrice) || 0,
        shipping_fee: Number(shippingFee) || 0,
        quantity: Number(quantity) || 1,
        duration: duration,
        contact_number: contactNumber,
        full_address: address,
        contact_email: contactEmail,
        wifi_name: wifiName,
        wifi_password: wifiPassword,
        wifi_rate: wifiRate,
        proof_image: proofImage,
        ref_number: refNumber,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    
    // Return orderId and trackingNumber as expected by script.js
    return res.json({
        ...data,
        orderId: data.order_id,
        trackingNumber: data.tracking_number,
        referralRewardApplied,
        referralRewardAmount
    });
  }

  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'Order ID required' });
    
    const { data, error } = await supabase
      .from('piso_orders')
      .update({
          ...req.body,
          updated_at: new Date().toISOString()
      })
      .eq('order_id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'Order ID required' });

    const { error } = await supabase
      .from('piso_orders')
      .delete()
      .eq('order_id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: 'Order deleted' });
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
};
