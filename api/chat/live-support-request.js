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
        const { sessionId, clientId, orderId, customerName, customerContact } = req.body;

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        // Update session status to 'live' to indicate live support requested
        const { data: session, error: sessionError } = await supabase
            .from('piso_chat_sessions')
            .update({ status: 'live', updated_at: new Date().toISOString() })
            .eq('id', sessionId)
            .select('id, status')
            .single();

        if (sessionError) throw sessionError;

        // Add a system message indicating live support was requested
        await supabase
            .from('piso_chats')
            .insert({
                session_id: sessionId,
                sender: 'system',
                message: 'Customer has requested live support. An admin will join shortly.'
            });

        return res.status(200).json({
            success: true,
            session: {
                id: session.id,
                status: session.status
            }
        });
    } catch (error) {
        console.error('Live support request error:', error);
        return res.status(500).json({ error: 'Failed to process live support request' });
    }
};
