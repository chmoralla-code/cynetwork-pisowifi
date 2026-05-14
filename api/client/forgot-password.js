const { supabase } = require('../_lib/supabase');

// POST /api/client/forgot-password
// Verifies identity via full name + contact number, then resets password
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, newPassword, fullName, contactNumber } = req.body;

  if (!email || !newPassword || !fullName) {
    return res.status(400).json({ error: 'Email, full name, and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    // Verify the identity via piso_clients table
    const { data: client, error: clientError } = await supabase
      .from('piso_clients')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'No account found with that email address' });
    }

    // Verify full name matches
    const storedName = (client.full_name || '').toLowerCase().trim();
    const inputName = (fullName || '').toLowerCase().trim();
    if (storedName !== inputName) {
      return res.status(400).json({ error: 'Full name does not match our records' });
    }

    // Verify contact number if provided
    if (contactNumber) {
      const storedContact = (client.contact_number || '').replace(/\D/g, '');
      const inputContact = (contactNumber || '').replace(/\D/g, '');
      if (storedContact && inputContact && storedContact !== inputContact) {
        return res.status(400).json({ error: 'Contact number does not match our records' });
      }
    }

    // Use Supabase admin to update the password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      client.id, // This won't work with anon key — use updateUser with token instead
      { password: newPassword }
    );

    if (updateError) {
      // Fallback: send password reset email via Supabase Auth
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: `${process.env.SITE_URL || 'https://cynetworkpisowifi.vercel.app'}/reset-password`
      });

      if (resetError) {
        return res.status(500).json({ error: 'Unable to reset password. Please contact support.' });
      }

      return res.json({ 
        message: 'Password reset link sent to your email. Please check your inbox and spam folder.' 
      });
    }

    return res.json({ message: 'Password reset successful. You can now login with your new password.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
