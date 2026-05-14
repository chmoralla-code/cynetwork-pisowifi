// GET /api/health
// Health check endpoint used by script.js to check OTP requirements
module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    emailVerification: {
      // Set to false to disable OTP requirement in the frontend
      // OTP/email verification is handled natively by Supabase Auth
      enabled: false
    }
  });
};
