
        const socket = io(); // Initialize Socket.IO

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
                    e.stopPropagation(); // Prevent card click from firing again
                    const pkgId = card.dataset.packageId;
                    const price = card.dataset.price;
                    openOrderModal(pkgId, price);
                });
            }
        });

        // Initialize price and selection on load
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

        function openOrderModal(packageId, price) {
            currentOrder.packageId = packageId;
            currentOrder.price = price;
            currentOrder.currentStep = 1;
            currentOrder.proofFile = null;
            currentOrder.refNumber = '';

            orderPkgSummary.textContent = packageId;
            orderPriceSummary.textContent = '₱' + price;

            // Reset form fields
            orderForm.reset();
            document.getElementById('proofInput').value = '';
            document.querySelector('.file-label').textContent = '📤 Click to upload or drag and drop';
            document.querySelector('.file-label').style.background = 'rgba(80, 50, 50, 0.6)';

            showOrderStep(1);
            orderModal.style.display = 'block';
        }

        function closeOrderModal() {
            orderModal.style.display = 'none';
            currentOrder = { packageId: '', price: 0, currentStep: 1, proofFile: null, refNumber: '' }; // Reset state
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
            if (currentOrder.currentStep < 3) {
                if (currentOrder.currentStep === 2) { // Validate proof step
                    if (!proofInput.files[0] || !refNumberInput.value.trim()) {
                        alert('Please upload proof of payment and enter a reference number.');
                        return;
                    }
                    currentOrder.proofFile = proofInput.files[0];
                    currentOrder.refNumber = refNumberInput.value.trim();
                }
                showOrderStep(currentOrder.currentStep + 1);
            }
        }

        function prevOrderStep() {
            if (currentOrder.currentStep > 1) {
                showOrderStep(currentOrder.currentStep - 1);
            }
        }

        orderForm.addEventListener('submit', function(e) {
            e.preventDefault();

            // Final validation for shipping info
            if (!fullNameInput.value.trim() || !contactNumberInput.value.trim() || !fullAddressInput.value.trim() || !contactEmailInput.value.trim()) {
                alert('Please fill in all required shipping information.');
                return;
            }
            if (!contactEmailInput.value.includes('@')) {
                alert('Please enter a valid email address.');
                return;
            }

            // Collect all data
            const fullName = document.getElementById('fullName').value;
            const contactNumber = document.getElementById('contactNumber').value;
            const fullAddress = document.getElementById('fullAddress').value;
            const contactEmail = document.getElementById('contactEmail').value;

            let payload;
            let headers = {};

            if (currentOrder.proofFile) {
                // If proof file exists, send as multipart/form-data
                payload = new FormData();
                payload.append('fullName', fullName);
                payload.append('packageId', currentOrder.packageId);
                payload.append('price', currentOrder.price);
                payload.append('contactNumber', contactNumber);
                payload.append('fullAddress', fullAddress); // Added
                payload.append('contactEmail', contactEmail); // Added
                payload.append('proof', currentOrder.proofFile);
                // Note: Content-Type header is automatically set by browser for FormData
            } else {
                // No proof file, send as JSON
                payload = {
                    fullName: fullName,
                    packageId: currentOrder.packageId,
                    price: currentOrder.price,
                    contactNumber: contactNumber,
                    fullAddress: fullAddress, // Added
                    contactEmail: contactEmail // Added
                };
                headers['Content-Type'] = 'application/json';
                payload = JSON.stringify(payload);
            }

            fetch('/api/orders', {
                method: 'POST',
                headers: headers,
                body: payload
            })
            .then(r => r.json())
            .then(order => {
                console.log('Order created:', order);
                document.getElementById('orderID').textContent = order.orderId;
                prependFeed('Order placed: ' + order.orderId + ' — ' + order.package);
                closeOrderModal();
                document.getElementById('successModal').style.display = 'block';
                // Optionally, open chat for the new order
                // openChatModal(order.orderId, order.fullName);
            })
            .catch(error => {
                console.error('Error creating order:', error);
                alert('Error creating order. Please try again.');
            });
        });

        function closeSuccessModal() {
            document.getElementById('successModal').style.display = 'none';
        }

        // File input drag and drop
        const fileInput = document.getElementById('proofFile');
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
                    fileInput.files = e.dataTransfer.files; // Assign dropped files
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
            feed.style.display = 'block'; // Ensure feed is visible
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
            document.getElementById('trackingStatus').innerHTML = ''; // Clear status
            document.getElementById('trackingResult').style.display = 'none';
        }

        function searchOrder() {
            const orderId = document.getElementById('trackingOrderId').value.trim();
            
            if (!orderId) {
                alert('Please enter an Order ID');
                return;
            }
            saveRecentOrder(orderId); // Save to recent searches immediately

            // Fetch order from backend
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

            // Determine status color and message
            let statusHTML = '';
            if (order.status === 'pending') {
                statusHTML = '⏳ Status: <strong style="color: #ffb366;">PENDING</strong><br><small>Your payment is being verified (within 24 hours)</small>';
            } else if (order.status === 'approved') {
                statusHTML = '✅ Status: <strong style="color: #66ff66;">APPROVED</strong><br><small>Your payment has been verified. Shipping soon!</small>';
            } else if (order.status === 'shipped') {
                statusHTML = '📦 Status: <strong style="color: #66ff66;">SHIPPED</strong><br><small>Your order is on the way! Tracking: ' + (order.trackingNumber || 'N/A') + '</small>';
            } else if (order.status === 'cancelled') {
                statusHTML = '❌ Status: <strong style="color: #ff6666;">CANCELLED</strong><br><small>This order has been cancelled.</small>';
            }

            statusDiv.innerHTML = statusHTML;
            document.getElementById('trackPkg').textContent = order.package || 'N/A';
            document.getElementById('trackAmt').textContent = '₱' + (order.price || '0');
            document.getElementById('trackName').textContent = order.fullName;
            document.getElementById('trackAddr').textContent = order.fullAddress;
            document.getElementById('trackContact').textContent = order.contactNumber;
            document.getElementById('trackDate').textContent = new Date(order.orderDate).toLocaleDateString();
            document.getElementById('trackStatusText').textContent = order.status.toUpperCase();
            
            // Show/hide cancel button
            const cancelBtn = document.getElementById('cancelOrderBtn');
            if (order.status === 'pending' || order.status === 'approved') { // Allow cancellation if not yet shipped
                cancelBtn.style.display = 'block';
            } else {
                cancelBtn.style.display = 'none';
            }

            resultDiv.style.display = 'block';
            
            // Store current order for chat
            currentChatOrderId = order.orderId;
            currentChatOrderName = order.fullName;
        }

        function saveRecentOrder(orderId) {
            let recentOrders = JSON.parse(localStorage.getItem('recentOrders')) || [];
            if (!recentOrders.includes(orderId)) {
                recentOrders.unshift(orderId); // Add to the beginning
                if (recentOrders.length > 5) { // Keep only last 5
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
                    btn.className = 'btn-next'; // Reuse button style
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

        // --- Chat Functions ---
        const chatModal = document.getElementById('chatModal'); // Renamed from chatPanel
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
            socket.emit('join', currentChatOrderId); // Use 'join' event as per server.js
            fetch('/api/chats/' + currentChatOrderId).then(r => r.json()).then(arr => {
                chatMessages.innerHTML = ''; // Clear previous messages
                arr.forEach(m => appendMessage(m.from, m.text, m.from === currentChatOrderName)); // 'me' if from current customer
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }).catch(console.error);
        }

        function closeChatModal() { // Renamed from closeChatPanel
            chatModal.classList.remove('active');
            if (currentChatOrderId) {
                chatToggleBtn.classList.remove('hidden');
            }
        }

        function sendChatMessage() { // Renamed from sendChatMessage
            const msg = messageInput.value.trim();
            if (!msg || !currentChatOrderId) return;

            socket.emit('send-message', {
                orderId: currentChatOrderId,
                from: currentChatOrderName || 'Customer', // Use 'from' as per server.js
                text: msg // Use 'text' as per server.js
            });
            appendMessage('Me', msg, true); // Add to UI immediately
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

        // Socket.IO event handlers
        socket.on('new-order', function(order) {
            prependFeed('New order placed: ' + order.orderId + ' — ' + order.package);
        });

        socket.on('new-message', function(payload) {
            if (payload && payload.orderId === currentChatOrderId) {
                // Check if message is from admin or other customer
                const isMe = payload.message.from === currentChatOrderName;
                appendMessage(payload.message.from, payload.message.text, isMe);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        });

        socket.on('order-updated', function(order) {
            prependFeed('Order ' + order.orderId + ' status updated to ' + order.status);
            if (order.orderId === currentChatOrderId) {
                // If the currently tracked order is updated, refresh its display
                displayOrderTracking(order);
            }
        });

        // Allow Enter key to send message
        document.addEventListener('DOMContentLoaded', function() {
            if (messageInput) {
                messageInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendChatMessage();
                    }
                });
            }
            displayRecentOrders(); // Load recent orders on page load
        });
    
