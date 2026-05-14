// POST /api/client/send-otp
// Since this project uses Supabase Auth, OTP is handled by Supabase itself.
// This endpoint returns a success response so the frontend doesn't break,
// while the actual email verification is handled by Supabase Auth during signup.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // OTP is handled by Supabase Auth (email confirmation)
  // For now, return disabled status so the frontend skips OTP
  return res.json({
    message: 'Email verification is handled automatically by our auth system. You can proceed without OTP.',
    emailVerification: { enabled: false },
    cooldownSeconds: 60
  });
};
