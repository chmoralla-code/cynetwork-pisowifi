const { supabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { clientId, orderId, trackingNumber, customerName, customerContact } = req.body;

        if (!clientId) {
            return res.status(400).json({ error: 'clientId is required' });
        }

        // Check for existing active session for this client
        const { data: existingSession } = await supabase
            .from('piso_chat_sessions')
            .select('id, status, created_at')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existingSession) {
            return res.status(200).json({
                session: {
                    id: existingSession.id,
                    status: existingSession.status || 'ai'
                }
            });
        }

        // Create new session
        const { data: newSession, error } = await supabase
            .from('piso_chat_sessions')
            .insert({
                client_id: clientId,
                order_id: orderId || null,
                tracking_number: trackingNumber || null,
                customer_name: customerName || null,
                customer_contact: customerContact || null,
                status: 'ai'
            })
            .select('id, status')
            .single();

        if (error) {
            console.error('Supabase insert error:', error);
            throw error;
        }

        return res.status(200).json({
            session: {
                id: newSession.id,
                status: newSession.status || 'ai'
            }
        });
    } catch (error) {
        console.error('Session error:', error);
        return res.status(500).json({ error: 'Failed to create or retrieve session' });
    }
};
