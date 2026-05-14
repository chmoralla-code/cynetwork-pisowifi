// Supabase Configuration
let supabaseClient = null;

let currentChatOrder = null;
let salesChart = null;

window.onload = async () => {
    try {
        const configRes = await fetch('/api/config');
        const config = await configRes.json();
        
        if (config.supabaseUrl && config.supabaseAnonKey) {
            supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            subscribeRealtime();
        } else {
            console.error('Supabase configuration is missing from /api/config');
        }
    } catch (err) {
        console.error('Failed to load Supabase config:', err);
    }
    
    loadDashboard();
};


async function loadDashboard() {
    try {
        const response = await fetch('/api/admin/stats');
        const stats = await response.json();

        document.getElementById('revenue').innerText = stats.revenue;
        document.getElementById('totalOrders').innerText = stats.totalOrders;
        document.getElementById('pending').innerText = stats.pending;

        initChart(stats.labels, stats.weeklySales);
        loadOrders();
    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
}

function initChart(labels, data) {
    const ctx = document.getElementById('salesChart').getContext('2d');
    if (salesChart) salesChart.destroy();
    
    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales (₱)',
                data: data,
                borderColor: '#C83232',
                backgroundColor: 'rgba(200, 50, 50, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { display: false },
                x: { grid: { display: false }, ticks: { color: '#888' } }
            }
        }
    });
}

async function loadOrders() {
    try {
        const response = await fetch('/api/orders');
        const orders = await response.json();

        renderOverviewTable(orders.slice(0, 5));
        renderFullOrdersTable(orders);
    } catch (err) {
        console.error('Failed to load orders:', err);
    }
}

function renderOverviewTable(orders) {
    const table = document.getElementById('overview-orders-table');
    table.innerHTML = '';
    orders.forEach(o => {
        const row = `<tr>
            <td>${o.order_id}</td>
            <td>${o.full_name}</td>
            <td>${o.package}</td>
            <td><span class="status-badge status-${o.status}">${o.status}</span></td>
            <td>₱${(Number(o.price) || 0).toLocaleString()}</td>
        </tr>`;
        table.innerHTML += row;
    });
}

function renderFullOrdersTable(orders) {
    const table = document.getElementById('full-orders-table');
    table.innerHTML = '';
    orders.forEach(o => {
        const proofHtml = o.proof ? `<a href="${o.proof}" target="_blank"><img src="${o.proof}" style="height:30px; border-radius:4px;"></a>` : '-';
        const row = `<tr>
            <td><strong>${o.order_id}</strong></td>
            <td>${o.full_name}</td>
            <td>${o.package}</td>
            <td><span class="status-badge status-${o.status}">${o.status}</span></td>
            <td>${proofHtml}</td>
            <td>
                ${o.status === 'pending' ? `<button class="btn-action" onclick="updateStatus('${o.order_id}', 'approved')">✅ Approve</button>` : ''}
                ${o.status === 'approved' ? `<button class="btn-action" onclick="updateStatus('${o.order_id}', 'shipped')">📦 Ship</button>` : ''}
                <button class="btn-action" onclick="openChat('${o.order_id}')">💬 Chat</button>
                <button class="btn-action" onclick="deleteOrder('${o.order_id}')">🗑️ Delete</button>
            </td>
        </tr>`;
        table.innerHTML += row;
    });
}

async function updateStatus(id, status) {
    if (!confirm(`Mark order ${id} as ${status}?`)) return;
    try {
        await fetch(`/api/orders?id=${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        loadDashboard(); // Refresh UI
    } catch (err) {
        alert('Failed to update status');
    }
}

async function deleteOrder(id) {
    if (!confirm(`Delete order ${id}? This cannot be undone.`)) return;
    try {
        await fetch(`/api/orders?id=${id}`, { method: 'DELETE' });
        loadDashboard();
    } catch (err) {
        alert('Failed to delete order');
    }
}

// Chat Logic
async function openChat(orderId) {
    currentChatOrder = orderId;
    document.getElementById('chatOrderId').innerText = orderId;
    document.getElementById('chatModal').classList.add('show');
    document.getElementById('chatMessages').innerHTML = 'Loading messages...';

    try {
        const response = await fetch(`/api/chats?orderId=${orderId}`);
        const messages = await response.json();
        renderMessages(messages);
    } catch (err) {
        console.error('Failed to load chat:', err);
    }
}

function closeChat() {
    currentChatOrder = null;
    document.getElementById('chatModal').classList.remove('show');
}

function renderMessages(messages) {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    messages.forEach(m => {
        const div = document.createElement('div');
        div.className = `message ${m.sender === 'Admin' ? 'admin' : 'user'}`;
        div.innerHTML = `<strong>${m.sender}:</strong> <div>${m.message}</div>`;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !currentChatOrder) return;

    try {
        await fetch(`/api/chats?orderId=${currentChatOrder}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Admin', text })
        });
        input.value = '';
        // Realtime will handle the update
    } catch (err) {
        alert('Failed to send message');
    }
}

// Realtime Subscriptions
function subscribeRealtime() {
    supabaseClient
        .channel('piso_orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'piso_orders' }, () => {
            loadDashboard();
        })
        .subscribe();

    supabaseClient
        .channel('piso_chats')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'piso_chats' }, payload => {
            if (currentChatOrder && payload.new.order_id === currentChatOrder) {
                const container = document.getElementById('chatMessages');
                const div = document.createElement('div');
                div.className = `message ${payload.new.sender === 'Admin' ? 'admin' : 'user'}`;
                div.innerHTML = `<strong>${payload.new.sender}:</strong> <div>${payload.new.message}</div>`;
                container.appendChild(div);
                container.scrollTop = container.scrollHeight;
            }
        })
        .subscribe();
}

// Tab Switching
function showTab(tab) {
    document.querySelectorAll('main').forEach(m => m.style.display = 'none');
    document.getElementById(`tab-${tab}`).style.display = 'block';
    
    document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
    document.getElementById(`nav-${tab}`).classList.add('active');
}

