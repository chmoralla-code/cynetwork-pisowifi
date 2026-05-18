// Default WiFi packages for CYNETWORK PISOWIFI
const DEFAULT_PACKAGES = {
    starter: {
        name: 'Starter Package',
        price: 5800,
        originalPrice: 6999,
        duration: '1 Year License',
        description: 'Perfect for small areas. Good for 20\u201330 clients.',
        features: [
            '50 Meters Range',
            '1 Year License',
            'Free Shipping Nationwide',
            'PHP 300 Downpayment Required',
            'Good for 20\u201330 Clients'
        ]
    },
    professional: {
        name: 'Professional Package',
        price: 8500,
        originalPrice: 10999,
        duration: '3 Years License',
        description: 'Most popular choice. Excellent for medium coverage.',
        features: [
            '100 Meters Range',
            '3 Years License',
            'Free Shipping Nationwide',
            'PHP 300 Downpayment Required',
            'Good for 40\u201360 Clients'
        ],
        popular: true
    },
    enterprise: {
        name: 'Enterprise Package',
        price: 11000,
        originalPrice: 14999,
        duration: 'Lifetime License',
        description: 'Best for large areas with many clients.',
        features: [
            '250 Meters Range',
            'Lifetime License',
            'Free Shipping Nationwide',
            'PHP 300 Downpayment Required',
            'Good for 80\u2013100 Clients',
            'Advanced Anti-Lag Included'
        ]
    }
};

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { supabase } = require('./_lib/supabase');
        const { data, error } = await supabase.from('piso_packages').select('*').order('id', { ascending: true });
        
        if (!error && data && data.length >= 3) {
            return res.status(200).json(data);
        }

        // Fallback to the default packages and seed them
        const packagesArray = Object.entries(DEFAULT_PACKAGES).map(([key, pkg]) => ({
            id: key,
            name: pkg.name,
            price: pkg.price,
            originalPrice: pkg.originalPrice,
            duration: pkg.duration,
            description: pkg.description,
            features: pkg.features,
            popular: pkg.popular || false
        }));

        try {
            await supabase.from('piso_packages').upsert(packagesArray, { onConflict: 'id' });
        } catch (seedErr) {
            console.error('Failed to auto-seed packages:', seedErr);
        }

        return res.status(200).json(packagesArray);
    } catch (error) {
        console.error('Packages error:', error);
        return res.status(500).json({ error: 'Failed to load packages' });
    }
};
