// Supabase Client for Frontend (Realtime)
const SUPABASE_URL = 'https://ppfelwqvolaxismdpjjc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZmVsd3F2b2xheGlzbWRwampjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDY4NTUsImV4cCI6MjA5MzI4Mjg1NX0.zT6SyMaEoMQaOSOmkFX_OfwZ4wkOfb__rRIjVtUoFGg';

(function() {
    // Replacement for Socket.IO using Supabase Realtime
    const orderChannel = 'piso_orders_channel';
    const chatChannel = 'piso_chats_channel';

    // Global state for current order being processed
    let currentOrder = {
        packageId: '',
        price: 0,
        currentStep: 1, 
        proofFile: null,
        refNumber: ''
    };

    let currentChatOrderId = null;
    let currentChatOrderName = null;

    // --- NEW: Skeleton Loading Simulation ---
    function simulateLoading() {
        const containers = document.querySelectorAll('.pkg-card');
        containers.forEach(card => {
            const originalContent = card.innerHTML;
            card.classList.add('skeleton');
            card.innerHTML = `
                <div class="skeleton-text" style="width: 60%; margin: 20px auto;"></div>
                <div class="skeleton-text" style="height: 60px; width: 80%; margin: 20px auto;"></div>
                <div class="skeleton-text" style="width: 40%; margin: 20px auto;"></div>
                <div class="skeleton-text" style="height: 100px; margin: 20px auto;"></div>
            `;
            
            setTimeout(() => {
                card.classList.remove('skeleton');
                card.innerHTML = originalContent;
                // Re-bind events after content swap
                bindPackageEvents(); 
            }, 1500);
        });
    }

    function bindPackageEvents() {
        const pkgCards = document.querySelectorAll('.pkg-card');
        pkgCards.forEach(card => {
            card.onclick = function() {
                const pkgId = this.dataset.packageId;
                const packageSelect = document.getElementById('packageSelect');
                packageSelect.value = pkgId;
                updatePriceAndSelection();
            };
            
            const selectBtn = card.querySelector('.select-btn');
            if (selectBtn) {
                selectBtn.onclick = function(e) {
                    e.stopPropagation(); 
                    openOrderModal(card.dataset.packageId, card.dataset.price);
                };
            }
        });
    }

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

    // Package selection logic
    function updatePriceAndSelection() {
        const packageSelect = document.getElementById('packageSelect');
        const priceTag = document.getElementById('priceTag');
        const selectedOption = packageSelect.selectedOptions[0];
        if (priceTag) priceTag.textContent = '₱' + (selectedOption ? selectedOption.dataset.price : '0');

        document.querySelectorAll('.pkg-card').forEach(c => {
            c.classList.toggle('selected', c.dataset.packageId === (selectedOption ? selectedOption.value : ''));
        });
    }

    // --- Order Modal Logic ---
    const orderModal = document.getElementById('orderModal');
    const closeOrderModalBtn = document.querySelector('.close-order-modal');
    const orderForm = document.getElementById('orderForm');

    function openOrderModal(packageId, price) {
        currentOrder.packageId = packageId;
        currentOrder.price = price;
        currentOrder.currentStep = 1;

        document.getElementById('orderPkgSummary').textContent = packageId;
        document.getElementById('orderPriceSummary').textContent = '₱' + price;

        if (orderForm) orderForm.reset(); 
        showOrderStep(1);
        if (orderModal) orderModal.style.display = 'block';
    }

    function closeOrderModal() {
        if (orderModal) orderModal.style.display = 'none';
        currentOrder = { packageId: '', price: 0, currentStep: 1, proofFile: null, refNumber: '' }; 
    }

    if (closeOrderModalBtn) closeOrderModalBtn.addEventListener('click', closeOrderModal);

    function showOrderStep(step) {
        document.querySelectorAll('.order-modal-step').forEach(s => s.classList.remove('active')); 
        document.getElementById('orderStep' + step).classList.add('active');

        document.querySelectorAll('.order-modal-step-indicator span').forEach(s => s.classList.remove('active'));
        document.getElementById('step' + step + 'Indicator').classList.add('active');

        currentOrder.currentStep = step;
    }

    window.nextOrderStep = function() {
        if (currentOrder.currentStep < 4) { 
            showOrderStep(currentOrder.currentStep + 1);
        }
    }

    window.prevOrderStep = function() {
        if (currentOrder.currentStep > 1) {
            showOrderStep(currentOrder.currentStep - 1);
        }
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        simulateLoading();
        updatePriceAndSelection();
    });

    window.openOrderModal = openOrderModal;
    window.closeOrderModal = closeOrderModal;
})();
