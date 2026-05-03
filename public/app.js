// Supabase Client for Frontend (Realtime)
const SUPABASE_URL = 'https://ppfelwqvolaxismdpjjc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZmVsd3F2b2xheGlzbWRwampjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDY4NTUsImV4cCI6MjA5MzI4Mjg1NX0.zT6SyMaEoMQaOSOmkFX_OfwZ4wkOfb__rRIjVtUoFGg';
// Note: In production, these should be handled securely or via environment variables if using a bundler.

(function() {
    // Replacement for Socket.IO using Supabase Realtime
    const orderChannel = 'piso_orders_channel';
    const chatChannel = 'piso_chats_channel';

    // Global state for current order being processed
    let currentOrder = {
        packageId: '',
        price: 0,
        currentStep: 1, // 1: Summary/QR, 2: Proof, 3: Shipping
        proofFile: null,
        refNumber: ''
    };

    // Global state for chat
    let currentChatOrderId = null;
    let currentChatOrderName = null;

    // Smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    document.querySelectorAll('.cta-button').forEach(button => {
        button.addEventListener('click', function(e) {
            const targetId = this.getAttribute('data-scroll-to');
            if (targetId) {
                e.preventDefault();
                document.getElementById(targetId).scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Package selection logic
    const pkgCards = document.querySelectorAll('.pkg-card');
    const packageSelect = document.getElementById('packageSelect');
    const priceTag = document.getElementById('priceTag');

    function updatePriceAndSelection() {
        const selectedOption = packageSelect.selectedOptions[0];
        priceTag.textContent = '₱' + (selectedOption ? selectedOption.dataset.price : '0');

        pkgCards.forEach(c => {
            c.classList.toggle('selected', c.dataset.packageId === (selectedOption ? selectedOption.value : ''));
        });
    }

    pkgCards.forEach(card => {
        card.addEventListener('click', function() {
            const pkgId = this.dataset.packageId;
            packageSelect.value = pkgId;
            updatePriceAndSelection();
        });
        const selectBtn = card.querySelector('.select-btn');
        if (selectBtn) {
            selectBtn.addEventListener('click', function(e) {
                e.stopPropagation(); 
                const pkgId = card.dataset.packageId;
                const price = card.dataset.price;
                openOrderModal(pkgId, price);
            });
        }
    });

    updatePriceAndSelection();

    // --- Order Modal Logic ---
    const orderModal = document.getElementById('orderModal');
    const closeOrderModalBtn = document.querySelector('.close-order-modal');
    const orderForm = document.getElementById('orderForm');
    const orderPkgSummary = document.getElementById('orderPkgSummary');
    const orderPriceSummary = document.getElementById('orderPriceSummary');
    const proofInput = document.getElementById('proofInput');
    const refNumberInput = document.getElementById('refNumber');
    const fullNameInput = document.getElementById('fullName');
    const contactNumberInput = document.getElementById('contactNumber');
    const fullAddressInput = document.getElementById('fullAddress');
    const contactEmailInput = document.getElementById('contactEmail');
    const wifiNameInput = document.getElementById('wifiName');
    const rate1Input = document.getElementById('rate1');
    const rate5Input = document.getElementById('rate5');
    const rate10Input = document.getElementById('rate10');
    const rate20Input = document.getElementById('rate20');

    function openOrderModal(packageId, price) {
        currentOrder.packageId = packageId;
        currentOrder.price = price;
        currentOrder.currentStep = 1;
        currentOrder.proofFile = null;
        currentOrder.refNumber = '';

        orderPkgSummary.textContent = packageId;
        orderPriceSummary.textContent = '₱' + price;

        orderForm.reset(); 
        proofInput.value = ''; 
        document.querySelector('.file-label').textContent = '📤 Click to upload or drag and drop';
        document.querySelector('.file-label').style.background = 'rgba(80, 50, 50, 0.6)';
        refNumberInput.value = ''; 
        fullNameInput.value = '';
        contactNumberInput.value = '';
        fullAddressInput.value = '';
        contactEmailInput.value = '';
        wifiNameInput.value = '';
        rate1Input.value = '';
        rate5Input.value = '';
        rate10Input.value = '';
        rate20Input.value = '';

        showOrderStep(1);
        orderModal.style.display = 'block';
    }

    function closeOrderModal() {
        orderModal.style.display = 'none';
        currentOrder = { packageId: '', price: 0, currentStep: 1, proofFile: null, refNumber: '' }; 
    }

    closeOrderModalBtn.addEventListener('click', closeOrderModal);
    window.addEventListener('click', function(event) {
        if (event.target == orderModal) {
            closeOrderModal();
        }
    });

    function showOrderStep(step) {
        document.querySelectorAll('.order-modal-step').forEach(s => s.classList.remove('active')); 
        document.getElementById('orderStep' + step).classList.add('active');

        document.querySelectorAll('.order-modal-step-indicator span').forEach(s => s.classList.remove('active'));
        document.getElementById('step' + step + 'Indicator').classList.add('active');

        currentOrder.currentStep = step;
    }

    function nextOrderStep() {
        if (currentOrder.currentStep < 4) { 
            if (currentOrder.currentStep === 2) { 
                if (!proofInput.files[0] || !refNumberInput.value.trim()) {
                    alert('Please upload proof of payment and enter a reference number.');
                    return;
                }
                currentOrder.proofFile = proofInput.files[0];
                currentOrder.refNumber = refNumberInput.value.trim(); 
            } else if (currentOrder.currentStep === 3) {
                if (!fullNameInput.value.trim() || !contactNumberInput.value.trim() || !fullAddressInput.value.trim() || !contactEmailInput.value.trim()) {
                    alert('Please fill in all required shipping information.');
                    return;
                }
                if (!contactEmailInput.value.includes('@')) {
                    alert('Please enter a valid email address.');
                    return;
                }
            }
            showOrderStep(currentOrder.currentStep + 1);
        }
    }

    function prevOrderStep() {
        if (currentOrder.currentStep > 1) {
            showOrderStep(currentOrder.currentStep - 1);
        }
    }

    orderForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const wifiName = wifiNameInput.value.trim();
        const rate1 = rate1Input.value.trim();
        const rate5 = rate5Input.value.trim();
        const rate10 = rate10Input.value.trim();
        const rate20 = rate20Input.value.trim();

        if (!wifiName || !rate1 || !rate5 || !rate10 || !rate20) {
            alert('Please fill in all WiFi configuration details.');
            return;
        }

        const fullName = fullNameInput.value.trim();
        const contactNumber = contactNumberInput.value.trim();
        const fullAddress = fullAddressInput.value.trim();
        const contactEmail = contactEmailInput.value.trim();

        let proofUrl = '';
        if (currentOrder.proofFile) {
            try {
                // For migration, we'll assume a simplified direct upload or placeholder
                // In production, this would use Vercel Blob client-side or a signed URL
                proofUrl = '/placeholder-proof.jpg';
            } catch (err) {
                console.error('Upload error:', err);
            }
        }

        const orderData = {
            full_name: fullName,
            package_name: currentOrder.packageId,
            price: currentOrder.price,
            contact_number: contactNumber,
            full_address: fullAddress,
            contact_email: contactEmail,
            wifi_name: wifiName,
            rates: {
                '1php': rate1,
                '5php': rate5,
                '10php': rate10,
                '20php': rate20
            },
            ref_number: currentOrder.refNumber,
            proof_url: proofUrl
        };

        fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        })
        .then(r => r.json())
        .then(order => {
            console.log('Order created:', order);
            document.getElementById('orderID').textContent = order.order_id;
            prependFeed('Order placed: ' + order.order_id + ' — ' + order.package_name);
            closeOrderModal();
            document.getElementById('successModal').style.display = 'block';
        })
        .catch(error => {
            console.error('Error creating order:', error);
            alert('Error creating order. Please try again.');
        });
    });

    function closeSuccessModal() {
        document.getElementById('successModal').style.display = 'none';
    }

    const fileInput = document.getElementById('proofInput'); 
    const fileLabel = document.querySelector('.file-label');

    if (fileInput && fileLabel) {
        fileLabel.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileLabel.style.background = 'rgba(200, 50, 50, 0.3)';
        });

        fileLabel.addEventListener('dragleave', () => {
            fileLabel.style.background = 'rgba(80, 50, 50, 0.6)';
        });

        fileLabel.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files; 
                fileLabel.textContent = '✅ ' + e.dataTransfer.files[0].name;
                fileLabel.style.background = 'rgba(80, 50, 50, 0.6)';
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                fileLabel.textContent = '✅ ' + e.target.files[0].name;
            }
        });
    }

    // --- Real-time Feed ---
    const feed = document.getElementById('feed');
    function prependFeed(text) {
        const el = document.createElement('div'); el.textContent = text; el.className = 'notice';
        feed.insertBefore(el, feed.firstChild);
        feed.style.display = 'block'; 
    }

    // Order Tracking Functions
    const trackOrderNavBtn = document.getElementById('trackOrderNavBtn');
    if (trackOrderNavBtn) {
        trackOrderNavBtn.addEventListener('click', (e) => { e.preventDefault(); openTrackingModal(); });
    }

    function openTrackingModal() {
        document.getElementById('trackingModal').style.display = 'block';
        document.getElementById('trackingResult').style.display = 'none';
        displayRecentOrders();
    }

    function closeTrackingModal() {
        document.getElementById('trackingModal').style.display = 'none';
        document.getElementById('trackingOrderId').value = '';
        document.getElementById('trackingStatus').innerHTML = ''; 
        document.getElementById('trackingResult').style.display = 'none';
    }

    function searchOrder() {
        const orderId = document.getElementById('trackingOrderId').value.trim();
        
        if (!orderId) {
            alert('Please enter an Order ID');
            return;
        }
        saveRecentOrder(orderId); 

        fetch(`/api/orders/${orderId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Order not found');
                }
                return response.json();
            })
            .then(order => {
                displayOrderTracking(order);
            })
            .catch(error => {
                alert('❌ Order not found. Please check your Order ID and try again.');
                console.error('Error:', error);
            });
    }

    function displayOrderTracking(order) {
        const resultDiv = document.getElementById('trackingResult');
        const statusDiv = document.getElementById('trackingStatus');

        let statusHTML = '';
        if (order.status === 'pending') {
            statusHTML = '⏳ Status: <strong style="color: #ffb366;">PENDING</strong><br><small>Your payment is being verified (within 24 hours)</small>';
        } else if (order.status === 'approved') {
            statusHTML = '✅ Status: <strong style="color: #66ff66;">APPROVED</strong><br><small>Your payment has been verified. Shipping soon!</small>';
        } else if (order.status === 'shipped') {
            statusHTML = '📦 Status: <strong style="color: #66ff66;">SHIPPED</strong><br><small>Your order is on the way! Tracking: ' + (order.tracking_number || 'N/A') + '</small>';
        } else if (order.status === 'cancelled') {
            statusHTML = '❌ Status: <strong style="color: #ff6666;">CANCELLED</strong><br><small>This order has been cancelled.</small>';
        }

        statusDiv.innerHTML = statusHTML;
        document.getElementById('trackPkg').textContent = order.package_name || 'N/A';
        document.getElementById('trackAmt').textContent = '₱' + (order.price || '0');
        document.getElementById('trackName').textContent = order.full_name;
        document.getElementById('trackAddr').textContent = order.full_address;
        document.getElementById('trackContact').textContent = order.contact_number;
        document.getElementById('trackEmail').textContent = order.contact_email || 'N/A'; 
        document.getElementById('trackWifiName').textContent = order.wifi_name || 'N/A'; 
        
        let ratesText = 'N/A';
        if (order.rates) {
            ratesText = Object.entries(order.rates)
                                .filter(([, value]) => value) 
                                .map(([key, value]) => `${key.replace('php', '₱')}: ${value}`)
                                .join(', ');
        }
        document.getElementById('trackRates').textContent = ratesText; 
        document.getElementById('trackDate').textContent = new Date(order.created_at).toLocaleDateString(); 
        document.getElementById('trackStatusText').textContent = order.status.toUpperCase();
        
        const cancelBtn = document.getElementById('cancelOrderBtn');
        if (order.status === 'pending' || order.status === 'approved') { 
            cancelBtn.style.display = 'block';
        } else {
            cancelBtn.style.display = 'none';
        }

        resultDiv.style.display = 'block';
        
        currentChatOrderId = order.order_id;
        currentChatOrderName = order.full_name;
    }

    function saveRecentOrder(orderId) {
        let recentOrders = JSON.parse(localStorage.getItem('recentOrders')) || [];
        if (!recentOrders.includes(orderId)) {
            recentOrders.unshift(orderId); 
            if (recentOrders.length > 5) { 
                recentOrders.pop();
            }
            localStorage.setItem('recentOrders', JSON.stringify(recentOrders));
        }
        displayRecentOrders();
    }

    function displayRecentOrders() {
        const recentOrdersDiv = document.getElementById('recentOrders');
        const recentOrdersListDiv = document.getElementById('recentOrdersList');
        let recentOrders = JSON.parse(localStorage.getItem('recentOrders')) || [];

        if (recentOrders.length > 0) {
            recentOrdersDiv.style.display = 'block';
            recentOrdersListDiv.innerHTML = '';
            recentOrders.forEach(id => {
                const btn = document.createElement('button');
                btn.textContent = id;
                btn.className = 'btn-next'; 
                btn.style.width = 'auto';
                btn.style.padding = '5px 10px';
                btn.style.marginTop = '0';
                btn.style.fontSize = '12px';
                btn.style.borderRadius = '5px';
                btn.onclick = () => {
                    document.getElementById('trackingOrderId').value = id;
                    searchOrder();
                };
                recentOrdersListDiv.appendChild(btn);
            });
        } else {
            recentOrdersDiv.style.display = 'none';
        }
    }

    // --- Chat Functions (Supabase Placeholder) ---
    const chatModal = document.getElementById('chatModal'); 
    const chatMessages = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const chatToggleBtn = document.getElementById('chatToggleBtn');

    function openChatModal(orderId = currentChatOrderId, fullName = currentChatOrderName) {
        if (!orderId) {
            alert('Please search for an order first');
            return;
        }
        currentChatOrderId = orderId;
        currentChatOrderName = fullName;

        chatModal.classList.add('active');
        chatToggleBtn.classList.add('hidden');
        
        fetch('/api/chats/' + currentChatOrderId).then(r => r.json()).then(arr => {
            chatMessages.innerHTML = ''; 
            arr.forEach(m => appendMessage(m.from, m.text, m.from === currentChatOrderName)); 
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }).catch(console.error);
    }

    function closeChatModal() { 
        chatModal.classList.remove('active');
        if (currentChatOrderId) {
            chatToggleBtn.classList.remove('hidden');
        }
    }

    function sendChatMessage() { 
        const msg = messageInput.value.trim();
        if (!msg || !currentChatOrderId) return;

        fetch('/api/chats/' + currentChatOrderId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: currentChatOrderName, text: msg })
        });
        
        appendMessage('Me', msg, true); 
        messageInput.value = '';
        messageInput.focus();
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function appendMessage(from, text, me) {
        const div = document.createElement('div');
        div.className = 'message' + (me ? ' me' : '');
        div.innerHTML = '<strong>' + from + '</strong><div>' + (text || '') + '</div>';
        chatMessages.appendChild(div);
    }

    window.openTrackingModal = openTrackingModal;
    window.closeTrackingModal = closeTrackingModal;
    window.searchOrder = searchOrder;
    window.openChatModal = openChatModal;
    window.closeChatModal = closeChatModal;
    window.sendChatMessage = sendChatMessage;
    window.nextOrderStep = nextOrderStep;
    window.prevOrderStep = prevOrderStep;
    window.closeSuccessModal = closeSuccessModal;

    document.addEventListener('DOMContentLoaded', function() {
        if (messageInput) {
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    sendChatMessage();
                }
            });
        }
        displayRecentOrders(); 
    });
})();
