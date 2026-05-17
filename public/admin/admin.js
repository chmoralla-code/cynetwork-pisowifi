// Supabase Configuration
const SUPABASE_URL = 'https://ppfelwqvolaxismdpjjc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZmVsd3F2b2xheGlzbWRwampjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDY4NTUsImV4cCI6MjA5MzI4Mjg1NX0.zT6SyMaEoMQaOSOmkFX_OfwZ4wkOfb__rRIjVtUoFGg';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentTab = 'dashboard';

async function checkAuth() {
    try {
        const raw = localStorage.getItem('cynetwork_admin_session');
        if (!raw) { window.location.href = '/admin/login.html'; return false; }
        const session = JSON.parse(raw);
        if (!session || session.expires <= Date.now()) {
            localStorage.removeItem('cynetwork_admin_session');
            window.location.href = '/admin/login.html';
            return false;
        }
        return true;
    } catch (e) {
        window.location.href = '/admin/login.html';
        return false;
    }
}

async function initAdmin() {
    if (!(await checkAuth())) return;
    
    loadStats();
    loadRecentOrders();
    loadSalesAnalytics();
    loadJuanFiData();
    subscribeRealtime();
}

function showTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('main').forEach(m => m.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'block';

    document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
    document.getElementById(`nav-${tabId}`).classList.add('active');

    if (tabId === 'dashboard') {
        loadStats();
        loadRecentOrders();
        loadSalesAnalytics();
        loadJuanFiData();
    }
    if (tabId === 'orders') loadAllOrders();
    if (tabId === 'pending') loadPendingOrders();
    if (tabId === 'clients') loadClients();
    if (tabId === 'chat') loadChatList();
    if (tabId === 'packages') loadPackages();
    if (tabId === 'images') loadImages();
    if (tabId === 'settings') loadSettings();
}

function refreshData() {
    loadStats();
    loadRecentOrders();
}

function refreshSalesReport() {
    loadSalesAnalytics();
}

function refreshJuanFi() {
    loadJuanFiData();
}

function openRecordHarvest() {
    document.getElementById('harvestModal').style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats');
        const stats = await res.json();
        
        document.getElementById('stat-total').innerText = stats.totalOrders || 0;
        document.getElementById('stat-pending').innerText = stats.pending || 0;
        document.getElementById('stat-approved').innerText = stats.approved || 0;
        document.getElementById('stat-delivery').innerText = stats.delivery || 0;
        document.getElementById('stat-rejected').innerText = stats.rejected || 0;
        document.getElementById('stat-completed').innerText = stats.completed || 0;
        document.getElementById('stat-cancelled').innerText = stats.cancelled || 0;

        document.getElementById('monitor-pending').innerText = stats.pending || 0;
    } catch (err) {
        console.error('Failed to load stats:', err);
    }
}

async function loadRecentOrders() {
    try {
        const res = await fetch('/api/orders');
        const orders = await res.json();
        const tbody = document.getElementById('recent-orders-table');
        tbody.innerHTML = '';

        orders.slice(0, 5).forEach(o => {
            const row = `<tr>
                <td>#${o.order_id}</td>
                <td>${o.full_name}</td>
                <td>${o.package}</td>
                <td><span class="status-badge status-${o.status.toUpperCase()}">${o.status}</span></td>
                <td>${new Date(o.created_at).toLocaleDateString()}</td>
                <td><button class="btn-view" onclick="viewOrder('${o.order_id}')">View</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
    } catch (err) {
        console.error('Failed to load recent orders:', err);
    }
}

async function loadAllOrders() {
    try {
        const res = await fetch('/api/orders');
        const orders = await res.json();
        const tbody = document.querySelector('#full-orders-table tbody');
        tbody.innerHTML = '';

        orders.forEach(o => {
            const row = `<tr>
                <td><strong>#${o.order_id}</strong></td>
                <td>${o.full_name}</td>
                <td>${o.package}</td>
                <td><span class="status-badge status-${o.status.toUpperCase()}">${o.status}</span></td>
                <td>
                    <select onchange="updateOrderStatus('${o.order_id}', this.value)" style="padding: 4px; font-size: 11px; border-radius: 4px; border: 1px solid #DDD;">
                        <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="approved" ${o.status === 'approved' ? 'selected' : ''}>Approved</option>
                        <option value="delivery" ${o.status === 'delivery' ? 'selected' : ''}>Delivery</option>
                        <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="rejected" ${o.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                        <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            </tr>`;
            tbody.innerHTML += row;
        });
    } catch (err) {
        console.error('Failed to load all orders:', err);
    }
}

async function loadPendingOrders() {
    try {
        const res = await fetch('/api/orders');
        const orders = await res.json();
        const tbody = document.querySelector('#pending-orders-table tbody');
        tbody.innerHTML = '';

        orders.filter(o => o.status === 'pending').forEach(o => {
            const row = `<tr>
                <td>#${o.order_id}</td>
                <td>${o.full_name}</td>
                <td>${o.package}</td>
                <td>
                    <button class="btn-view" style="background:#2ECC71;" onclick="updateOrderStatus('${o.order_id}', 'approved')">Approve</button>
                    <button class="btn-view" style="background:#E74C3C;" onclick="updateOrderStatus('${o.order_id}', 'rejected')">Reject</button>
                </td>
            </tr>`;
            tbody.innerHTML += row;
        });
    } catch (err) {
        console.error('Failed to load pending orders:', err);
    }
}

async function updateOrderStatus(id, status) {
    try {
        const res = await fetch(`/api/orders?id=${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            refreshData();
            if (currentTab === 'orders') loadAllOrders();
            if (currentTab === 'pending') loadPendingOrders();
        }
    } catch (err) {
        alert('Failed to update status');
    }
}

async function loadSalesAnalytics() {
    try {
        const res = await fetch('/api/admin/stats');
        const stats = await res.json();
        
        document.getElementById('sales-gross').innerText = stats.revenue || '₱0';
        document.getElementById('sales-today').innerText = stats.todaySales || '₱0';
        document.getElementById('sales-month').innerText = stats.monthSales || '₱0';
        document.getElementById('sales-units').innerText = stats.unitsSold || 0;
        document.getElementById('sales-avg').innerText = stats.avgOrderValue || '₱0';

        // Populate Package Table (Mocking for now if not in API)
        const pkgBody = document.getElementById('sales-package-table');
        pkgBody.innerHTML = `
            <tr><td>Enterprise</td><td>1</td><td>16</td><td>₱176,000</td></tr>
            <tr><td>Starter</td><td>4</td><td>4</td><td>₱23,200</td></tr>
        `;

        // Populate 7 Days Table
        const dayBody = document.getElementById('sales-7days-table');
        dayBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No trend data yet</td></tr>';
    } catch (err) {
        console.error('Sales analytics failed:', err);
    }
}

async function loadJuanFiData() {
    try {
        const res = await fetch('/api/admin/juanfi');
        const harvests = await res.json();
        
        const juanBody = document.getElementById('juanfi-table');
        juanBody.innerHTML = '';

        // Calculate totals for summary cards
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const thisMonth = new Date().toISOString().slice(0, 7);

        let todayInc = 0, yesterdayInc = 0, monthInc = 0;

        harvests.forEach(h => {
            const date = h.harvest_date.split('T')[0];
            const amount = Number(h.amount) || 0;
            if (date === today) todayInc += amount;
            if (date === yesterday) yesterdayInc += amount;
            if (h.harvest_date.startsWith(thisMonth)) monthInc += amount;

            const row = `<tr>
                <td>${h.machine_name}</td>
                <td>1</td>
                <td>₱${amount.toLocaleString()}</td>
                <td>${new Date(h.harvest_date).toLocaleDateString()}</td>
                <td>${h.note || '--'}</td>
                <td><button class="btn-view" style="background:#E74C3C;" onclick="removeHarvestRecord('${h.id}')">Remove Record</button></td>
            </tr>`;
            juanBody.innerHTML += row;
        });

        document.getElementById('juanfi-today').innerText = `₱${todayInc.toLocaleString()}`;
        document.getElementById('juanfi-yesterday').innerText = `₱${yesterdayInc.toLocaleString()}`;
        document.getElementById('juanfi-month').innerText = `₱${monthInc.toLocaleString()}`;
        document.getElementById('juanfi-count').innerText = harvests.length;
    } catch (err) {
        console.error('JuanFi data load failed:', err);
    }
}

async function submitHarvest() {
    const machine_name = document.getElementById('harvest-machine').value;
    const amount = document.getElementById('harvest-amount').value;
    const note = document.getElementById('harvest-note').value;

    if (!machine_name || !amount) return alert('Please fill in machine and amount');

    try {
        const res = await fetch('/api/admin/juanfi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ machine_name, amount, note })
        });
        if (res.ok) {
            closeModal('harvestModal');
            loadJuanFiData();
        }
    } catch (err) {
        alert('Failed to record harvest');
    }
}

async function removeHarvestRecord(id) {
    if (!confirm('Are you sure you want to remove this record?')) return;
    try {
        await fetch(`/api/admin/juanfi?id=${id}`, { method: 'DELETE' });
        loadJuanFiData();
    } catch (err) {
        alert('Failed to delete record');
    }
}

let currentClients = [];

async function loadClients() {
    try {
        const res = await fetch('/api/admin/clients');
        const clients = await res.json();
        currentClients = clients; // Store globally for edit lookup
        const tbody = document.querySelector('#clients-table tbody');
        tbody.innerHTML = '';

        clients.forEach(c => {
            const row = `<tr style="${c.is_banned ? 'opacity: 0.5; background: rgba(255,0,0,0.1);' : ''}">
                <td>${c.client_id}</td>
                <td>${c.full_name} ${c.is_banned ? '<span style="color:var(--danger);font-size:0.8em;font-weight:bold;">[BANNED]</span>' : ''}</td>
                <td>${c.email}</td>
                <td>₱${(Number(c.balance) || 0).toLocaleString()}</td>
                <td><button class="btn-view" onclick="editClient('${c.client_id}')">Edit</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
    } catch (err) {
        console.error('Clients load failed:', err);
    }
}

function editClient(id) {
    const client = currentClients.find(c => c.client_id === id);
    if (!client) return alert('Client data not found');
    
    document.getElementById('edit-client-id').value = client.client_id;
    document.getElementById('edit-client-balance').value = client.balance || 0;
    document.getElementById('edit-client-banned').checked = !!client.is_banned;
    
    document.getElementById('clientModal').style.display = 'flex';
}

async function saveClient() {
    const id = document.getElementById('edit-client-id').value;
    const balance = document.getElementById('edit-client-balance').value;
    const is_banned = document.getElementById('edit-client-banned').checked;
    
    if (!id) return;
    
    const btn = document.querySelector('#clientModal .btn-primary');
    btn.innerText = 'Saving...';
    
    try {
        const res = await fetch('/api/admin/clients?id=' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ balance: Number(balance), is_banned })
        });
        
        if (res.ok) {
            closeModal('clientModal');
            loadClients();
        } else {
            alert('Failed to update client');
        }
    } catch (err) {
        alert('Error updating client');
    } finally {
        btn.innerText = 'Save Client';
    }
}

async function viewOrder(id) {
    try {
        const res = await fetch('/api/orders?id=' + id);
        if (!res.ok) throw new Error('Order fetch failed');
        const order = await res.json();
        
        document.getElementById('current-order-id').value = order.order_id || order.orderId;
        document.getElementById('order-status-select').value = order.status || 'pending';
        
        const content = document.getElementById('order-details-content');
        content.innerHTML = `
            <p><strong>Order ID:</strong> ${order.order_id || order.orderId}</p>
            <p><strong>Customer Name:</strong> ${order.full_name || order.fullName}</p>
            <p><strong>Contact:</strong> ${order.contact_number || order.contactNumber}</p>
            <p><strong>Email:</strong> ${order.contact_email || 'N/A'}</p>
            <p><strong>Address:</strong> ${order.full_address || 'N/A'}</p>
            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 10px 0;">
            <p><strong>Package:</strong> ${order.package_name || order.package || 'Unknown'}</p>
            <p><strong>Unit Price:</strong> ₱${(order.unit_price || order.price || 0).toLocaleString()}</p>
            <p><strong>Quantity:</strong> ${order.quantity || 1}</p>
            <p><strong>Shipping Fee:</strong> ₱${(order.shipping_fee || 0).toLocaleString()}</p>
            <p><strong>Total Price:</strong> <span style="color: var(--primary); font-weight: bold;">₱${(order.total_price || order.price || 0).toLocaleString()}</span></p>
            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 10px 0;">
            <p><strong>WiFi Name:</strong> ${order.wifi_name || 'N/A'}</p>
            <p><strong>GCash Ref Number:</strong> ${order.ref_number || 'N/A'}</p>
            ${order.proof_image ? `<p><strong>Proof of Payment:</strong> <br><img src="${order.proof_image}" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin-top: 5px;"></p>` : ''}
        `;
        
        document.getElementById('orderModal').style.display = 'flex';
    } catch (err) {
        alert('Failed to load order details');
    }
}

async function updateOrderStatusFromModal() {
    const id = document.getElementById('current-order-id').value;
    const status = document.getElementById('order-status-select').value;
    
    if (!id) return;
    
    const btn = document.querySelector('#orderModal .btn-primary');
    btn.innerText = 'Saving...';
    
    try {
        const res = await fetch('/api/orders?id=' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        
        if (res.ok) {
            closeModal('orderModal');
            refreshData();
            if (currentTab === 'orders') loadAllOrders();
            if (currentTab === 'pending') loadPendingOrders();
        } else {
            alert('Failed to update status');
        }
    } catch (err) {
        alert('Error updating status');
    } finally {
        btn.innerText = 'Save Status';
    }
}

async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('cynetwork_admin_session');
        window.location.href = '/admin/login.html';
    }
}

function subscribeRealtime() {
    supabaseClient
        .channel('admin_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'piso_orders' }, () => {
            refreshData();
        })
        .subscribe();
}

window.onload = initAdmin;

// --- New Features Logic ---

async function loadChatList() {
    try {
        const res = await fetch('/api/admin/chats');
        if (!res.ok) throw new Error('API failed');
        let sessions = await res.json();
        
        const chatList = document.getElementById('chat-list');
        chatList.innerHTML = '';
        
        if (sessions.length === 0) {
             chatList.innerHTML = '<div style="padding: 15px; color: var(--text-muted);">No active chats found.</div>';
             return;
        }

        sessions.forEach(s => {
            chatList.innerHTML += `
                <div style="padding: 15px; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; justify-content: space-between;" onclick="selectChat('${s.id}')">
                    <div>
                        <strong style="color: white;">${s.customer_name || 'Client ' + (s.client_id ? s.client_id.substring(0,6) : '')}</strong><br>
                        <span style="font-size: 12px; color: var(--text-muted);">Status: ${s.status}</span>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error('Failed to load chats');
    }
}

async function selectChat(id) {
    document.getElementById('active-chat-id').value = id;
    document.getElementById('chat-input').focus();
    
    // Highlight selected chat in the list
    document.querySelectorAll('#chat-list > div').forEach(div => div.style.background = 'transparent');
    const selectedDiv = document.querySelector(`div[onclick="selectChat('${id}')"]`);
    if(selectedDiv) selectedDiv.style.background = 'rgba(255, 255, 255, 0.05)';

    const res = await fetch('/api/chat/messages?sessionId=' + id);
    if (res.ok) {
        const data = await res.json();
        const displayBox = document.getElementById('chat-box-display');
        displayBox.innerHTML = '';
        (data.messages || []).forEach(m => {
            const isSelf = m.sender === 'admin';
            displayBox.innerHTML += `
                <div style="margin-bottom: 10px; text-align: ${isSelf ? 'right' : 'left'};">
                    <span style="background: ${isSelf ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; padding: 8px 12px; border-radius: 8px; display: inline-block; text-align: left;">
                        ${m.message}
                    </span>
                </div>
            `;
        });
        displayBox.scrollTop = displayBox.scrollHeight;
    }
}

async function sendChat() {
    const chatId = document.getElementById('active-chat-id').value;
    const input = document.getElementById('chat-input');
    const msg = input.value;
    if (!chatId || !msg) return alert('Select a chat and enter a message');
    
    const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: chatId, senderType: 'admin', message: msg })
    });
    
    if (res.ok) {
        input.value = '';
        selectChat(chatId);
    } else {
        alert('Failed to send message');
    }
}

async function loadPackages() {
    try {
        const res = await fetch('/api/packages');
        const packages = await res.json();
        
        const tbody = document.querySelector('#packages-table tbody');
        tbody.innerHTML = '';
        packages.forEach(p => {
            const featuresList = Array.isArray(p.features) ? p.features.join(', ') : p.features;
            tbody.innerHTML += `
                <tr>
                    <td><strong>${p.name}</strong></td>
                    <td>₱${p.price}</td>
                    <td>${p.duration}</td>
                    <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${featuresList}</td>
                    <td>
                        <button class="btn-view" onclick='editPackage(${JSON.stringify(p).replace(/'/g, "&apos;")})'>Edit</button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error('Failed to load packages');
    }
}

function openAddPackageModal() {
    document.getElementById('package-modal-title').innerText = 'Add New Package';
    document.getElementById('pkg-id').value = '';
    document.getElementById('pkg-name').value = '';
    document.getElementById('pkg-price').value = '';
    document.getElementById('pkg-duration').value = '';
    document.getElementById('pkg-features').value = '';
    document.getElementById('pkg-media').value = '';
    document.getElementById('packageModal').style.display = 'flex';
}

function editPackage(p) {
    document.getElementById('package-modal-title').innerText = 'Edit Package';
    document.getElementById('pkg-id').value = p.id;
    document.getElementById('pkg-name').value = p.name;
    document.getElementById('pkg-price').value = p.price;
    document.getElementById('pkg-duration').value = p.duration;
    document.getElementById('pkg-features').value = Array.isArray(p.features) ? p.features.join(', ') : p.features;
    document.getElementById('pkg-media').value = p.media_url || '';
    document.getElementById('packageModal').style.display = 'flex';
}

async function savePackage() {
    const id = document.getElementById('pkg-id').value || 'pkg_' + Date.now();
    const name = document.getElementById('pkg-name').value;
    const price = document.getElementById('pkg-price').value;
    const duration = document.getElementById('pkg-duration').value;
    const featuresRaw = document.getElementById('pkg-features').value;
    const media_url = document.getElementById('pkg-media').value;
    
    if (!name || !price || !duration) return alert('Please fill in all required fields');

    const features = featuresRaw.split(',').map(s => s.trim()).filter(s => s);
    const pkg = { id, name, price, originalPrice: Number(price) + 1199, duration, features, description: '', media_url };

    const btn = document.querySelector('#packageModal .btn-primary');
    btn.innerText = 'Saving...';

    const res = await fetch('/api/admin/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pkg)
    });

    btn.innerText = 'Save Package';
    
    if (res.ok) {
        closeModal('packageModal');
        loadPackages();
    } else {
        alert('Failed to save package. Please ensure the piso_packages table exists in Supabase.');
    }
}

async function loadImages() {
    const grid = document.getElementById('image-gallery-grid');
    grid.innerHTML = 'Loading images...';
    try {
        const res = await fetch('/api/admin/images');
        if (!res.ok) throw new Error('API failed');
        const blobs = await res.json();
        grid.innerHTML = '';
        
        if (blobs.length === 0) {
            grid.innerHTML = '<div style="color: var(--text-muted); grid-column: 1/-1;">No images uploaded yet.</div>';
        }
        
        blobs.forEach(b => {
            grid.innerHTML += `
                <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px; border: 1px solid var(--border-color); text-align: center;">
                    <img src="${b.url}" style="width: 100%; height: 120px; object-fit: contain; border-radius: 4px; margin-bottom: 10px;">
                    <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 10px; word-break: break-all;">${b.pathname}</div>
                    <button class="btn-view" style="background: #E74C3C; width: 100%;" onclick="deleteImage('${b.url}')">Delete</button>
                </div>
            `;
        });
    } catch(e) {
        grid.innerHTML = '<div style="color: #E74C3C; grid-column: 1/-1;">Failed to load images from Vercel Blob. Is BLOB_READ_WRITE_TOKEN configured?</div>';
    }
}

async function deleteImage(url) {
    if (!confirm('Delete this image permanently?')) return;
    const res = await fetch('/api/admin/images?url=' + encodeURIComponent(url), { method: 'DELETE' });
    if (res.ok) {
        loadImages();
    } else {
        alert('Failed to delete image');
    }
}

async function handleImageUpload(event) {
    if (event.target.files.length > 0) {
        const file = event.target.files[0];
        const res = await fetch('/api/upload?filename=' + encodeURIComponent(file.name), {
            method: 'POST',
            body: file
        });
        if (res.ok) {
            alert('Image uploaded successfully!');
            loadImages();
        } else {
            alert('Failed to upload. Ensure Vercel BLOB_READ_WRITE_TOKEN is set in your environment.');
        }
    }
}

async function loadSettings() {
    try {
        const res = await fetch('/api/admin/settings');
        if (res.ok) {
            const settings = await res.json();
            if (settings.admin_email) document.getElementById('setting-admin-email').value = settings.admin_email;
            if (settings.telegram_token) document.getElementById('setting-telegram-token').value = settings.telegram_token;
            if (settings.telegram_chat) document.getElementById('setting-telegram-chat').value = settings.telegram_chat;
            if (settings.maintenance_mode) document.getElementById('setting-maintenance').value = settings.maintenance_mode;
        }
    } catch (e) {
        console.error('Settings load failed');
    }
}

async function saveSettings() {
    const btn = document.querySelector('#tab-settings .btn-primary');
    btn.innerText = 'Saving...';
    
    const settings = {
        admin_email: document.getElementById('setting-admin-email').value,
        telegram_token: document.getElementById('setting-telegram-token').value,
        telegram_chat: document.getElementById('setting-telegram-chat').value,
        maintenance_mode: document.getElementById('setting-maintenance').value
    };
    
    try {
        const res = await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        if (res.ok) {
            alert('Settings saved successfully!');
        } else {
            alert('Failed to save settings. Please ensure piso_settings table exists.');
        }
    } catch (e) {
        alert('Error saving settings');
    } finally {
        btn.innerText = 'Save Changes';
    }
}
