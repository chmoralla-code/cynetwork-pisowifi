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

async function loadClients() {
    try {
        const res = await fetch('/api/admin/clients');
        const clients = await res.json();
        const tbody = document.querySelector('#clients-table tbody');
        tbody.innerHTML = '';

        clients.forEach(c => {
            const row = `<tr>
                <td>${c.client_id}</td>
                <td>${c.full_name}</td>
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
    alert('Editing client: ' + id);
}

function viewOrder(id) {
    alert('Viewing details for Order #' + id);
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
