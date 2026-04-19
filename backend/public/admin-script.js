// =====================================================
// ADMIN DASHBOARD JAVASCRIPT
// =====================================================

const API_URL = '/api';
let authToken = localStorage.getItem('adminToken');
let currentOrderId = null;
let allOrders = [];
let chatSessions = [];
let currentChatSessionId = null;
let currentChatStatus = 'ai';
let currentChatLastMessageId = 0;
let chatPollTimer = null;
let notificationSettings = null;

function formatAdminMoney(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
        return '0';
    }
    return numeric.toLocaleString('en-PH');
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        showDashboard();
        loadStats();
        loadOrders();
        loadSalesReport();
        loadNotificationSettings();
        setupImageUploadListeners();
        initializeChatSupport();
    } else {
        showLoginPage();
    }

    setupEventListeners();
});

// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Sidebar navigation
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const menuItem = e.currentTarget;
            const view = menuItem.dataset.view;
            switchView(view);
        });
    });

    // Search and filter
    document.getElementById('searchInput')?.addEventListener('input', filterOrders);
    document.getElementById('filterStatus')?.addEventListener('change', filterOrders);

    // Dashboard actions
    document.getElementById('refreshDashboardBtn')?.addEventListener('click', refreshDashboardData);
    document.getElementById('refreshSalesReportBtn')?.addEventListener('click', loadSalesReport);

    // Chat actions
    document.getElementById('refreshChatsBtn')?.addEventListener('click', () => {
        loadChatSessions(true);
    });

    document.getElementById('chatSendBtn')?.addEventListener('click', sendAdminChatReply);

    document.getElementById('chatReplyInput')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendAdminChatReply();
        }
    });

    document.getElementById('chatStatusSelect')?.addEventListener('change', (event) => {
        updateChatSessionStatus(event.target.value);
    });

    // Notification settings
    document.getElementById('notificationSettingsForm')?.addEventListener('submit', saveNotificationSettings);
    document.getElementById('testPendingNotifBtn')?.addEventListener('click', () => sendNotificationTest('pending_order'));
    document.getElementById('testAiNotifBtn')?.addEventListener('click', () => sendNotificationTest('ai_chat'));
    document.getElementById('telegramEnabled')?.addEventListener('change', syncNotificationInputState);
    document.getElementById('intergramEnabled')?.addEventListener('change', syncNotificationInputState);

    // Close modals by clicking outside
    window.addEventListener('click', (event) => {
        if (event.target.id === 'orderModal') {
            closeOrderModal();
        }
        if (event.target.id === 'rejectModal') {
            closeRejectModal();
        }
    });
}

// =====================================================
// LOGIN
// =====================================================

async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.classList.add('show');
            return;
        }

        authToken = data.token;
        localStorage.setItem('adminToken', authToken);
        localStorage.setItem('adminUsername', data.username);

        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        errorDiv.classList.remove('show');

        showDashboard();
        loadStats();
        loadOrders();
        loadSalesReport();
        loadNotificationSettings();
        setupImageUploadListeners();
        initializeChatSupport();
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.classList.add('show');
    }
}

function logout() {
    authToken = null;
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');

    if (chatPollTimer) {
        clearInterval(chatPollTimer);
        chatPollTimer = null;
    }

    chatSessions = [];
    currentChatSessionId = null;
    currentChatLastMessageId = 0;
    notificationSettings = null;

    showLoginPage();
}

// =====================================================
// UI FUNCTIONS
// =====================================================

function showLoginPage() {
    document.getElementById('loginPage').classList.add('active');
    document.getElementById('dashboardPage').classList.remove('active');
}

function showDashboard() {
    document.getElementById('loginPage').classList.remove('active');
    document.getElementById('dashboardPage').classList.add('active');
    document.getElementById('adminUsername').textContent = localStorage.getItem('adminUsername') || 'Admin';
    document.getElementById('settingsUsername').textContent = localStorage.getItem('adminUsername') || 'Admin';
}

function switchView(viewName) {
    // Remove active from all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    // Remove active from all menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });

    // Add active to selected view and menu item
    const viewId = `${viewName}View`;
    document.getElementById(viewId)?.classList.add('active');

    document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');

    // Load view-specific data
    if (viewName === 'pending') {
        loadPendingOrders();
    } else if (viewName === 'orders') {
        loadOrders();
    } else if (viewName === 'chat') {
        loadChatSessions(true);
    } else if (viewName === 'images') {
        loadCurrentImages();
    } else if (viewName === 'settings') {
        loadNotificationSettings();
    } else if (viewName === 'dashboard') {
        loadSalesReport();
    }
}

async function refreshDashboardData() {
    await loadStats();
    await loadOrders();
    await loadSalesReport();
    await loadNotificationSettings();
    await loadChatUnreadCount();
    loadCurrentImages();
}

// =====================================================
// LOAD DATA
// =====================================================

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/stats`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const stats = await response.json();
        
        document.getElementById('totalOrders').textContent = stats.total_orders || 0;
        document.getElementById('pendingOrders').textContent = stats.pending_orders || 0;
        document.getElementById('approvedOrders').textContent = stats.approved_orders || 0;
        document.getElementById('deliveryOrders').textContent = stats.delivery_orders || 0;
        document.getElementById('rejectedOrders').textContent = stats.rejected_orders || 0;
        document.getElementById('completedOrders').textContent = stats.completed_orders || 0;
        document.getElementById('cancelledOrders').textContent = stats.cancelled_orders || 0;

        const monitorPending = document.getElementById('monitorPendingOrders');
        if (monitorPending) {
            monitorPending.textContent = String(stats.pending_orders || 0);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadOrders() {
    try {
        const response = await fetch(`${API_URL}/orders`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                logout();
            }
            return;
        }
        
        allOrders = await response.json();
        displayOrders(allOrders);
        displayRecentOrders(allOrders.slice(0, 5));
        loadChatUnreadCount();
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

async function loadPendingOrders() {
    if (!allOrders.length) {
        await loadOrders();
    }
    const pendingOrders = allOrders.filter(order => order.status === 'pending');
    displayPendingOrders(pendingOrders);
}

async function loadSalesReport() {
    try {
        const response = await fetch(`${API_URL}/reports/sales`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
            }
            return;
        }

        const result = await response.json();
        renderSalesReport(result);
    } catch (error) {
        console.error('Error loading sales report:', error);
    }
}

function renderSalesReport(reportData) {
    const summary = reportData?.summary || {};

    const grossEl = document.getElementById('salesGrossValue');
    const todayEl = document.getElementById('salesTodayValue');
    const monthEl = document.getElementById('salesMonthValue');
    const unitsEl = document.getElementById('salesUnitsValue');
    const averageEl = document.getElementById('salesAverageValue');

    if (grossEl) grossEl.textContent = `₱${formatAdminMoney(summary.grossSales || 0)}`;
    if (todayEl) todayEl.textContent = `₱${formatAdminMoney(summary.todaySales || 0)}`;
    if (monthEl) monthEl.textContent = `₱${formatAdminMoney(summary.monthSales || 0)}`;
    if (unitsEl) unitsEl.textContent = formatAdminMoney(summary.totalUnits || 0);
    if (averageEl) averageEl.textContent = `₱${formatAdminMoney(summary.averageOrderValue || 0)}`;

    const packageBody = document.getElementById('salesPackageBody');
    if (packageBody) {
        packageBody.innerHTML = '';
        const rows = reportData?.packageBreakdown || [];

        if (!rows.length) {
            packageBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1rem;">No sales data yet</td></tr>';
        } else {
            rows.forEach((item) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.packageName || '--'}</td>
                    <td>${formatAdminMoney(item.orderCount || 0)}</td>
                    <td>${formatAdminMoney(item.unitsSold || 0)}</td>
                    <td>₱${formatAdminMoney(item.salesAmount || 0)}</td>
                `;
                packageBody.appendChild(row);
            });
        }
    }

    const trendBody = document.getElementById('salesTrendBody');
    if (trendBody) {
        trendBody.innerHTML = '';
        const rows = reportData?.dailyTrend || [];

        if (!rows.length) {
            trendBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1rem;">No trend data yet</td></tr>';
        } else {
            rows.forEach((item) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.reportDate || '--'}</td>
                    <td>${formatAdminMoney(item.orderCount || 0)}</td>
                    <td>${formatAdminMoney(item.unitsSold || 0)}</td>
                    <td>₱${formatAdminMoney(item.salesAmount || 0)}</td>
                `;
                trendBody.appendChild(row);
            });
        }
    }
}

function setNotificationSettingsStatus(message, type = '') {
    const statusEl = document.getElementById('notificationSettingsStatus');
    if (!statusEl) {
        return;
    }

    if (!message) {
        statusEl.style.display = 'none';
        statusEl.textContent = '';
        statusEl.className = 'settings-status';
        return;
    }

    statusEl.style.display = 'block';
    statusEl.textContent = message;
    statusEl.className = `settings-status ${type}`.trim();
}

function updateNotificationMonitorStateLabel() {
    const monitorEl = document.getElementById('monitorNotificationState');
    if (!monitorEl) {
        return;
    }

    if (!notificationSettings) {
        monitorEl.textContent = 'Not configured';
        return;
    }

    const channels = [];
    if (notificationSettings.telegramEnabled) {
        channels.push('Telegram');
    }
    if (notificationSettings.intergramEnabled) {
        channels.push('Intergram');
    }

    monitorEl.textContent = channels.length
        ? `${channels.join(' + ')} active`
        : 'Disabled';
}

function syncNotificationInputState() {
    const telegramEnabled = document.getElementById('telegramEnabled')?.checked;
    const intergramEnabled = document.getElementById('intergramEnabled')?.checked;

    const telegramTokenInput = document.getElementById('telegramBotToken');
    const telegramChatInput = document.getElementById('telegramChatId');
    const intergramWebhookInput = document.getElementById('intergramWebhookUrl');

    if (telegramTokenInput) telegramTokenInput.disabled = !telegramEnabled;
    if (telegramChatInput) telegramChatInput.disabled = !telegramEnabled;
    if (intergramWebhookInput) intergramWebhookInput.disabled = !intergramEnabled;
}

function applyNotificationSettingsToForm(settings) {
    if (!settings) {
        return;
    }

    const telegramEnabled = document.getElementById('telegramEnabled');
    const telegramBotToken = document.getElementById('telegramBotToken');
    const telegramChatId = document.getElementById('telegramChatId');
    const intergramEnabled = document.getElementById('intergramEnabled');
    const intergramWebhookUrl = document.getElementById('intergramWebhookUrl');
    const notifyPendingOrders = document.getElementById('notifyPendingOrders');
    const notifyAiChats = document.getElementById('notifyAiChats');

    if (telegramEnabled) telegramEnabled.checked = Boolean(settings.telegramEnabled);
    if (telegramBotToken) telegramBotToken.value = settings.telegramBotToken || '';
    if (telegramChatId) telegramChatId.value = settings.telegramChatId || '';
    if (intergramEnabled) intergramEnabled.checked = Boolean(settings.intergramEnabled);
    if (intergramWebhookUrl) intergramWebhookUrl.value = settings.intergramWebhookUrl || '';
    if (notifyPendingOrders) notifyPendingOrders.checked = settings.notifyPendingOrders !== false;
    if (notifyAiChats) notifyAiChats.checked = settings.notifyAiChats !== false;

    syncNotificationInputState();
}

async function loadNotificationSettings() {
    try {
        const response = await fetch(`${API_URL}/notifications/settings`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
            }
            return;
        }

        const result = await response.json();
        notificationSettings = result?.settings || null;
        applyNotificationSettingsToForm(notificationSettings);
        updateNotificationMonitorStateLabel();
    } catch (error) {
        console.error('Error loading notification settings:', error);
    }
}

async function saveNotificationSettings(event) {
    event.preventDefault();

    const payload = {
        telegramEnabled: document.getElementById('telegramEnabled')?.checked || false,
        telegramBotToken: document.getElementById('telegramBotToken')?.value?.trim() || '',
        telegramChatId: document.getElementById('telegramChatId')?.value?.trim() || '',
        intergramEnabled: document.getElementById('intergramEnabled')?.checked || false,
        intergramWebhookUrl: document.getElementById('intergramWebhookUrl')?.value?.trim() || '',
        notifyPendingOrders: document.getElementById('notifyPendingOrders')?.checked !== false,
        notifyAiChats: document.getElementById('notifyAiChats')?.checked !== false
    };

    setNotificationSettingsStatus('Saving notification settings...');

    try {
        const response = await fetch(`${API_URL}/notifications/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok) {
            setNotificationSettingsStatus(result.error || 'Failed to save notification settings', 'error');
            return;
        }

        notificationSettings = result?.settings || payload;
        applyNotificationSettingsToForm(notificationSettings);
        updateNotificationMonitorStateLabel();
        setNotificationSettingsStatus('Notification settings saved successfully.', 'success');
    } catch (error) {
        console.error('Error saving notification settings:', error);
        setNotificationSettingsStatus('Network error while saving settings.', 'error');
    }
}

async function sendNotificationTest(type) {
    setNotificationSettingsStatus('Sending test notification...');

    try {
        const response = await fetch(`${API_URL}/notifications/test`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ type })
        });

        const result = await response.json();
        if (!response.ok) {
            setNotificationSettingsStatus(result.error || 'Failed to send test notification', 'error');
            return;
        }

        setNotificationSettingsStatus('Test notification sent. Check your configured channels.', 'success');
    } catch (error) {
        console.error('Error sending test notification:', error);
        setNotificationSettingsStatus('Network error while sending test notification.', 'error');
    }
}

// =====================================================
// DISPLAY FUNCTIONS
// =====================================================

function displayOrders(orders) {
    const tbody = document.getElementById('ordersTableBody');
    tbody.innerHTML = '';
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No orders found</td></tr>';
        return;
    }
    
    orders.forEach(order => {
        const quantity = Number(order.quantity || 1);
        const unitPrice = Number(order.unit_price || order.price || 0);
        const totalPrice = Number(order.total_price || order.price || 0);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>#${order.id}<br><small>${order.tracking_number || '--'}</small></td>
            <td>${order.full_name}</td>
            <td>${order.package_name}</td>
            <td>
                ₱${formatAdminMoney(totalPrice)}
                <br>
                <small>${quantity} pc(s) × ₱${formatAdminMoney(unitPrice)}</small>
            </td>
            <td>${order.contact_number}</td>
            <td><span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span></td>
            <td>${new Date(order.created_at).toLocaleDateString()}</td>
            <td><button class="action-btn" onclick="viewOrder(${order.id})">View</button></td>
        `;
        tbody.appendChild(row);
    });
}

function displayRecentOrders(orders) {
    const tbody = document.getElementById('recentOrdersBody');
    tbody.innerHTML = '';
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No recent orders</td></tr>';
        return;
    }
    
    orders.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>#${order.id}<br><small>${order.tracking_number || '--'}</small></td>
            <td>${order.full_name}</td>
            <td>${order.package_name}</td>
            <td><span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span></td>
            <td>${new Date(order.created_at).toLocaleDateString()}</td>
            <td><button class="action-btn" onclick="viewOrder(${order.id})">View</button></td>
        `;
        tbody.appendChild(row);
    });
}

function displayPendingOrders(orders) {
    const container = document.getElementById('pendingOrdersList');
    container.innerHTML = '';
    
    if (orders.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem;">No pending orders</p>';
        return;
    }
    
    orders.forEach(order => {
        const quantity = Number(order.quantity || 1);
        const totalPrice = Number(order.total_price || order.price || 0);

        const card = document.createElement('div');
        card.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 1rem;
            border-left: 4px solid #F39C12;
            cursor: pointer;
            transition: all 0.3s ease;
        `;
        card.onmouseover = () => card.style.boxShadow = '0 5px 20px rgba(0,0,0,0.1)';
        card.onmouseout = () => card.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
        card.onclick = () => viewOrder(order.id);
        
        card.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div>
                    <p style="color: #999; font-size: 0.9rem; margin-bottom: 0.25rem;">Customer</p>
                    <p style="font-weight: 600; font-size: 1.1rem;">${order.full_name}</p>
                </div>
                <div>
                    <p style="color: #999; font-size: 0.9rem; margin-bottom: 0.25rem;">Package</p>
                    <p style="font-weight: 600; font-size: 1.1rem;">${order.package_name} - ${quantity} pc(s) - ₱${formatAdminMoney(totalPrice)}</p>
                </div>
                <div>
                    <p style="color: #999; font-size: 0.9rem; margin-bottom: 0.25rem;">Phone</p>
                    <p>${order.contact_number}</p>
                </div>
                <div>
                    <p style="color: #999; font-size: 0.9rem; margin-bottom: 0.25rem;">Date</p>
                    <p>${new Date(order.created_at).toLocaleDateString()}</p>
                </div>
            </div>
            <button class="action-btn" onclick="viewOrder(${order.id}); event.stopPropagation();">Review Order</button>
        `;
        
        container.appendChild(card);
    });
}

// =====================================================
// ORDER MODAL
// =====================================================

async function viewOrder(orderId) {
    currentOrderId = orderId;
    
    try {
        const response = await fetch(`${API_URL}/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const order = await response.json();
        
        const modalBody = document.getElementById('orderModalBody');
        const modalActions = document.getElementById('modalActions');
        
        let proofImageHtml = '';
        if (order.proof_image) {
            proofImageHtml = `
                <div class="proof-image-container">
                    <label style="display: block; font-weight: 600; color: #999; font-size: 0.85rem; margin-bottom: 0.5rem;">Proof of Payment</label>
                    <img src="${order.proof_image}" alt="Proof of Payment">
                </div>
            `;
        }

        const isPreorderOnly =
            String(order.wifi_name || '').trim().toUpperCase() === 'PREORDER'
            && String(order.wifi_password || '').trim().toUpperCase() === 'PREORDER';

        const networkDetailsHtml = isPreorderOnly
            ? `
                <div class="detail-group">
                    <label>Order Type</label>
                    <p>Preorder (shipping details only)</p>
                </div>
            `
            : `
                <div class="detail-group">
                    <label>WiFi Name (SSID)</label>
                    <p>${order.wifi_name}</p>
                </div>

                <div class="detail-group">
                    <label>WiFi Password</label>
                    <p>${order.wifi_password}</p>
                </div>

                <div class="detail-group">
                    <label>WiFi Rate</label>
                    <p>${order.wifi_rate}</p>
                </div>
            `;
        
        modalBody.innerHTML = `
            <div class="order-details">
                <div class="detail-group">
                    <label>Order ID</label>
                    <p>#${order.id}</p>
                </div>

                <div class="detail-group">
                    <label>Tracking Number</label>
                    <p>${order.tracking_number || '--'}</p>
                </div>
                
                <div class="detail-group">
                    <label>Status</label>
                    <p><span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span></p>
                </div>
                
                <div class="detail-group">
                    <label>Package</label>
                    <p>${order.package_name}</p>
                </div>
                
                <div class="detail-group">
                    <label>Preorder Total</label>
                    <p>₱${formatAdminMoney(order.total_price || order.price || 0)}</p>
                </div>

                <div class="detail-group">
                    <label>Quantity</label>
                    <p>${Number(order.quantity || 1)} piece(s)</p>
                </div>

                <div class="detail-group">
                    <label>Unit Price</label>
                    <p>₱${formatAdminMoney(order.unit_price || order.price || 0)}</p>
                </div>

                <div class="detail-group">
                    <label>Shipping Fee</label>
                    <p>${Number(order.shipping_fee || 0) === 0 ? 'FREE (₱0)' : `₱${formatAdminMoney(order.shipping_fee)}`}</p>
                </div>

                <div class="detail-group">
                    <label>Total Payment</label>
                    <p>₱${formatAdminMoney(order.total_price || order.price || 0)}</p>
                </div>
                
                <div class="detail-group">
                    <label>Customer Name</label>
                    <p>${order.full_name}</p>
                </div>
                
                <div class="detail-group">
                    <label>Contact Number</label>
                    <p>${order.contact_number}</p>
                </div>
                
                <div class="detail-group">
                    <label>Address</label>
                    <p>${order.address}</p>
                </div>

                ${networkDetailsHtml}
                
                <div class="detail-group">
                    <label>Duration</label>
                    <p>${order.duration}</p>
                </div>

                <div class="detail-group">
                    <label>Client Account ID</label>
                    <p>${order.client_account_id || '--'}</p>
                </div>

                <div class="detail-group">
                    <label>Referral Code Used</label>
                    <p>${order.referral_code_used || '--'}</p>
                </div>
                
                <div class="detail-group">
                    <label>Submitted Date</label>
                    <p>${new Date(order.created_at).toLocaleString()}</p>
                </div>
                
                ${proofImageHtml}
                
                ${order.rejection_reason ? `
                    <div class="detail-group textarea-field" style="grid-column: 1 / -1;">
                        <label>Rejection Reason</label>
                        <textarea readonly>${order.rejection_reason}</textarea>
                    </div>
                ` : ''}

                ${order.status === 'delivery' ? `
                    <div class="detail-group textarea-field" style="grid-column: 1 / -1;">
                        <label>Delivery Note</label>
                        <textarea readonly>Wait for the tracking number of the order that will be sent to you on Facebook. It will be shipped within 7 days ASAP.</textarea>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Action buttons based on status
        let actionHtml = '<button class="btn btn-secondary" onclick="closeOrderModal()">Close</button>';
        
        if (order.status === 'pending') {
            actionHtml = `
                <button class="btn btn-secondary" onclick="closeOrderModal()">Close</button>
                <button class="btn btn-danger" onclick="openRejectModal()">Reject</button>
                <button class="btn btn-success" onclick="approveOrder()">Approve</button>
            `;
        } else if (order.status === 'approved') {
            actionHtml = `
                <button class="btn btn-secondary" onclick="closeOrderModal()">Close</button>
                <button class="btn btn-primary" onclick="updateStatus('delivery')">Set For Delivery</button>
                <button class="btn btn-primary" onclick="updateStatus('completed')">Mark as Completed</button>
            `;
        } else if (order.status === 'delivery') {
            actionHtml = `
                <button class="btn btn-secondary" onclick="closeOrderModal()">Close</button>
                <button class="btn btn-primary" onclick="updateStatus('completed')">Mark as Completed</button>
            `;
        }
        
        modalActions.innerHTML = actionHtml;
        
        document.getElementById('orderModal').classList.add('show');
    } catch (error) {
        console.error('Error loading order:', error);
        alert('Failed to load order details');
    }
}

function closeOrderModal() {
    document.getElementById('orderModal').classList.remove('show');
}

// =====================================================
// ORDER ACTIONS
// =====================================================

async function approveOrder() {
    try {
        const response = await fetch(`${API_URL}/orders/${currentOrderId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(data.message || 'Order approved and set for delivery');
            closeOrderModal();
            loadStats();
            loadOrders();
        } else {
            alert('Failed to approve order: ' + data.error);
        }
    } catch (error) {
        console.error('Error approving order:', error);
        alert('Network error');
    }
}

function openRejectModal() {
    document.getElementById('rejectModal').classList.add('show');
}

function closeRejectModal() {
    document.getElementById('rejectModal').classList.remove('show');
    document.getElementById('rejectReason').value = '';
}

async function submitReject() {
    const reason = document.getElementById('rejectReason').value.trim();
    
    if (!reason) {
        alert('Please enter a reason for rejection');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/orders/${currentOrderId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ reason })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Order rejected successfully');
            closeRejectModal();
            closeOrderModal();
            loadStats();
            loadOrders();
        } else {
            alert('Failed to reject order: ' + data.error);
        }
    } catch (error) {
        console.error('Error rejecting order:', error);
        alert('Network error');
    }
}

async function updateStatus(status) {
    try {
        const response = await fetch(`${API_URL}/orders/${currentOrderId}/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ status })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Order status updated');
            closeOrderModal();
            loadStats();
            loadOrders();
        } else {
            alert('Failed to update order: ' + data.error);
        }
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Network error');
    }
}

// =====================================================
// SEARCH & FILTER
// =====================================================

function filterOrders() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('filterStatus').value;
    
    let filtered = allOrders;
    
    if (searchTerm) {
        filtered = filtered.filter(order => 
            order.full_name.toLowerCase().includes(searchTerm) ||
            order.contact_number.includes(searchTerm)
        );
    }
    
    if (statusFilter) {
        filtered = filtered.filter(order => order.status === statusFilter);
    }
    
    displayOrders(filtered);
}

// =====================================================
// AI CHAT SUPPORT
// =====================================================

async function initializeChatSupport() {
    await loadChatUnreadCount();
    await loadChatSessions(false);
    startChatPolling();
}

function startChatPolling() {
    if (chatPollTimer) {
        clearInterval(chatPollTimer);
    }

    chatPollTimer = setInterval(() => {
        if (!authToken) {
            return;
        }

        loadChatUnreadCount();
        loadChatSessions(false);

        const chatViewActive = document.getElementById('chatView')?.classList.contains('active');
        if (chatViewActive && currentChatSessionId) {
            loadCurrentChatMessages(false);
        }
    }, 5000);
}

function setChatUnreadBadge(count) {
    const badge = document.getElementById('chatUnreadBadge');
    if (!badge) {
        return;
    }

    if (count > 0) {
        badge.style.display = 'inline-flex';
        badge.textContent = String(count > 99 ? '99+' : count);
    } else {
        badge.style.display = 'none';
        badge.textContent = '0';
    }
}

async function loadChatUnreadCount() {
    try {
        const response = await fetch(`${API_URL}/chat/unread-count`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
            }
            return;
        }

        const result = await response.json();
        const unreadCount = Number(result?.unreadCount || 0);
        setChatUnreadBadge(unreadCount);

        const monitorUnread = document.getElementById('monitorUnreadChats');
        if (monitorUnread) {
            monitorUnread.textContent = String(unreadCount);
        }
    } catch (error) {
        console.error('Error loading chat unread count:', error);
    }
}

async function loadChatSessions(selectCurrent = false) {
    try {
        const response = await fetch(`${API_URL}/chat/sessions`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
            }
            return;
        }

        const result = await response.json();
        chatSessions = result?.sessions || [];
        renderChatSessionsList();

        if (!chatSessions.length) {
            currentChatSessionId = null;
            currentChatLastMessageId = 0;
            updateChatSessionHeader(null);
            renderChatMessages([]);
            return;
        }

        if (!currentChatSessionId) {
            openChatSession(chatSessions[0].id);
            return;
        }

        const stillExists = chatSessions.some((session) => session.id === currentChatSessionId);
        if (!stillExists) {
            openChatSession(chatSessions[0].id);
            return;
        }

        if (selectCurrent) {
            openChatSession(currentChatSessionId);
            return;
        }

        updateChatSessionHeader(chatSessions.find((session) => session.id === currentChatSessionId) || null);
    } catch (error) {
        console.error('Error loading chat sessions:', error);
    }
}

function formatChatDate(dateValue) {
    if (!dateValue) {
        return '--';
    }

    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? String(dateValue) : date.toLocaleString();
}

function renderChatSessionsList() {
    const container = document.getElementById('chatSessionsList');
    if (!container) {
        return;
    }

    container.innerHTML = '';

    if (!chatSessions.length) {
        container.innerHTML = '<p class="chat-empty-state">No chat sessions yet.</p>';
        return;
    }

    chatSessions.forEach((session) => {
        const card = document.createElement('div');
        card.className = `chat-session-item${session.id === currentChatSessionId ? ' active' : ''}`;
        card.onclick = () => openChatSession(session.id);

        const sessionLabel = session.customerName || (session.trackingNumber ? `Tracking ${session.trackingNumber}` : `Client ${session.clientId}`);
        const preview = session.lastMessage || 'No messages yet.';
        const unread = Number(session.unreadCount || 0);

        card.innerHTML = `
            <div class="chat-session-top">
                <span class="chat-session-name">${sessionLabel}</span>
                ${unread > 0 ? `<span class="chat-session-unread">${unread}</span>` : ''}
            </div>
            <p class="chat-session-preview">${preview}</p>
            <p class="chat-session-meta">${session.status?.toUpperCase() || 'AI'} • ${formatChatDate(session.lastMessageAt || session.updatedAt)}</p>
        `;

        container.appendChild(card);
    });
}

function updateChatSessionHeader(session) {
    const titleEl = document.getElementById('chatSessionTitle');
    const metaEl = document.getElementById('chatSessionMeta');
    const statusSelect = document.getElementById('chatStatusSelect');
    const replyInput = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (!session) {
        if (titleEl) titleEl.textContent = 'Select a chat session';
        if (metaEl) metaEl.textContent = 'No active conversation selected';
        if (statusSelect) {
            statusSelect.value = 'ai';
            statusSelect.disabled = true;
        }
        if (replyInput) {
            replyInput.value = '';
            replyInput.disabled = true;
        }
        if (sendBtn) {
            sendBtn.disabled = true;
        }
        return;
    }

    currentChatStatus = session.status || 'ai';
    const label = session.customerName || `Client ${session.clientId}`;
    const meta = [
        session.trackingNumber ? `Tracking: ${session.trackingNumber}` : null,
        session.orderId ? `Order ID: #${session.orderId}` : null,
        `Status: ${(session.status || 'ai').toUpperCase()}`
    ].filter(Boolean).join(' | ');

    if (titleEl) titleEl.textContent = label;
    if (metaEl) metaEl.textContent = meta;
    if (statusSelect) {
        statusSelect.disabled = false;
        statusSelect.value = currentChatStatus;
    }
    if (replyInput) {
        replyInput.disabled = false;
        replyInput.placeholder = 'Type your reply to the client...';
    }
    if (sendBtn) {
        sendBtn.disabled = false;
    }
}

function renderChatMessages(messages, reset = true) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) {
        return;
    }

    if (reset) {
        container.innerHTML = '';
    }

    if (reset && !messages.length) {
        container.innerHTML = '<p class="chat-empty-state">No messages in this conversation yet.</p>';
        return;
    }

    messages.forEach((message) => {
        const item = document.createElement('div');
        item.className = `chat-message ${message.senderType}`;
        item.innerHTML = `${message.message}<time>${formatChatDate(message.createdAt)}</time>`;
        container.appendChild(item);
    });

    container.scrollTop = container.scrollHeight;
}

async function openChatSession(sessionId) {
    currentChatSessionId = sessionId;
    currentChatLastMessageId = 0;

    renderChatSessionsList();
    const session = chatSessions.find((item) => item.id === sessionId) || null;
    updateChatSessionHeader(session);

    await loadCurrentChatMessages(true);
    await loadChatUnreadCount();
}

async function loadCurrentChatMessages(reset = false) {
    if (!currentChatSessionId) {
        return;
    }

    try {
        const afterId = reset ? 0 : currentChatLastMessageId;
        const response = await fetch(`${API_URL}/chat/messages/${currentChatSessionId}?afterId=${afterId}&markRead=1`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
            }
            return;
        }

        const result = await response.json();
        const session = result?.session || null;
        const messages = result?.messages || [];

        updateChatSessionHeader(session);

        if (reset) {
            renderChatMessages(messages, true);
        } else {
            renderChatMessages(messages, false);
        }

        messages.forEach((message) => {
            currentChatLastMessageId = Math.max(currentChatLastMessageId, Number(message.id || 0));
        });

        loadChatSessions(false);
    } catch (error) {
        console.error('Error loading chat messages:', error);
    }
}

async function sendAdminChatReply() {
    const input = document.getElementById('chatReplyInput');
    if (!currentChatSessionId || !input) {
        return;
    }

    const message = input.value.trim();
    if (!message) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/chat/sessions/${currentChatSessionId}/reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ message })
        });

        const result = await response.json();
        if (!response.ok) {
            alert(result.error || 'Failed to send reply');
            return;
        }

        input.value = '';
        await loadCurrentChatMessages(false);
        await loadChatUnreadCount();
    } catch (error) {
        console.error('Error sending admin chat reply:', error);
        alert('Failed to send chat reply. Please try again.');
    }
}

async function updateChatSessionStatus(status) {
    if (!currentChatSessionId) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/chat/sessions/${currentChatSessionId}/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ status })
        });

        const result = await response.json();
        if (!response.ok) {
            alert(result.error || 'Failed to update chat status');
            return;
        }

        currentChatStatus = status;
        await loadChatSessions(false);
        await loadCurrentChatMessages(true);
    } catch (error) {
        console.error('Error updating chat session status:', error);
        alert('Failed to update chat status. Please try again.');
    }
}

// =====================================================
// IMAGE MANAGEMENT
// =====================================================

function setupImageUploadListeners() {
    ['1', '2', '3'].forEach(num => {
        const uploadInput = document.getElementById(`package${num}Upload`);
        if (uploadInput && uploadInput.dataset.bound !== 'true') {
            uploadInput.addEventListener('change', (e) => handleImageUpload(e, num));
            uploadInput.dataset.bound = 'true';
        }
    });
    
    // Load current images from localStorage
    loadCurrentImages();
}

function loadCurrentImages() {
    const localImages = JSON.parse(localStorage.getItem('packageImages') || '{}');

    ['1', '2', '3'].forEach(num => {
        const img = document.getElementById(`package${num}Img`);
        if (img) {
            const remoteSrc = `${API_URL}/images/package/${num}?t=${Date.now()}`;
            const localSrc = localImages[num] || '';
            img.onerror = () => {
                if (localSrc) {
                    img.src = localSrc;
                }
            };
            img.src = remoteSrc;
        }
    });
}

async function handleImageUpload(event, packageNum) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Image = e.target.result;
        
        // Save to localStorage
        const images = JSON.parse(localStorage.getItem('packageImages') || '{}');
        images[packageNum] = base64Image;
        localStorage.setItem('packageImages', JSON.stringify(images));
        
        // Update preview
        const img = document.getElementById(`package${packageNum}Img`);
        img.src = base64Image;
        
        // Try to send to backend
        try {
            const response = await fetch(`${API_URL}/images/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    packageId: packageNum,
                    image: base64Image
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result?.path) {
                    img.src = `${result.path}?t=${Date.now()}`;
                }
                alert(`Package ${packageNum} image updated successfully!`);
            } else {
                const result = await response.json();
                alert(`Failed to upload image: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.warn('Backend image upload failed, saved locally:', error);
            alert('Saved locally, but backend upload failed. Please check server connection.');
        }
    };
    reader.readAsDataURL(file);
}
