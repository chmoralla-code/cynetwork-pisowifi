const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const filename = req.query.filename || `proof-${Date.now()}.png`;
    
    // Upload directly from the raw request stream
    const blob = await put(filename, req, {
      access: 'public',
    });

    return res.status(200).json(blob);
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Failed to upload image. Make sure BLOB_READ_WRITE_TOKEN is set.' });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
