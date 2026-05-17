const { supabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const filename = req.query.filename || `proof-${Date.now()}.png`;
    
    // Convert raw stream to Buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const body = Buffer.concat(chunks);

    const { data, error } = await supabase.storage
      .from('piso_images')
      .upload(filename, body, {
        contentType: req.headers['content-type'] || 'application/octet-stream',
        upsert: true
      });

    if (error) {
       console.error('Supabase Storage Error:', error);
       return res.status(500).json({ error: 'Failed to upload image. Please ensure the "piso_images" storage bucket exists and is public in Supabase.' });
    }

    const { data: publicUrlData } = supabase.storage.from('piso_images').getPublicUrl(filename);

    return res.status(200).json({ url: publicUrlData.publicUrl, pathname: filename });
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
