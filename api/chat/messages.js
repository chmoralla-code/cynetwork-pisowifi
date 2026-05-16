const { supabase } = require('../_lib/supabase');

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        return handleGet(req, res);
    } else if (req.method === 'POST') {
        return handlePost(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

async function handleGet(req, res) {
    try {
        // sessionId comes from query param via vercel rewrite:
        // /api/chat/messages/(.*) -> /api/chat/messages?sessionId=$1
        const sessionId = req.query.sessionId || req.query.slug;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        const afterId = req.query.afterId ? Number(req.query.afterId) : 0;

        let query = supabase
            .from('piso_chats')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (afterId > 0) {
            query = query.gt('id', afterId);
        }

        const { data: messages, error } = await query;

        if (error) throw error;

        return res.status(200).json({
            messages: (messages || []).map(m => ({
                id: m.id,
                sessionId: m.session_id,
                sender: m.sender,
                message: m.message,
                createdAt: m.created_at
            })),
            sessionStatus: 'ai'
        });
    } catch (error) {
        console.error('Fetch messages error:', error);
        return res.status(500).json({ error: 'Failed to fetch messages' });
    }
}

async function handlePost(req, res) {
    try {
        const { sessionId, clientId, senderType, message } = req.body;

        if (!sessionId || !message) {
            return res.status(400).json({ error: 'sessionId and message are required' });
        }

        const { data: newMessage, error } = await supabase
            .from('piso_chats')
            .insert({
                session_id: sessionId,
                sender: senderType || 'client',
                message: message
            })
            .select()
            .single();

        if (error) throw error;

        return res.status(200).json({
            message: {
                id: newMessage.id,
                sessionId: newMessage.session_id,
                sender: newMessage.sender,
                message: newMessage.message,
                createdAt: newMessage.created_at
            }
        });
    } catch (error) {
        console.error('Send message error:', error);
        return res.status(500).json({ error: 'Failed to send message' });
    }
}
