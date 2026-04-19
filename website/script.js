// =====================================================
// GLOBAL VARIABLES
// =====================================================

let currentStep = 1;
let selectedPackage = null;
let uploadedProofImage = null;
let latestOrderId = null;
let latestOrderStatus = 'pending';
let latestTrackingNumber = null;
let selectedQuantity = 1;
let selectedUnitPrice = 0;
let selectedTotalPrice = 0;

let clientAuthToken = null;
let clientAccount = null;

let supportClientId = null;
let supportChatSessionId = null;
let supportChatStatus = 'ai';
let supportChatPollTimer = null;
let supportLastMessageId = 0;
const renderedSupportMessageIds = new Set();

const API_URL = '/api';
const FREE_SHIPPING_FEE = 0;
const REFERRAL_REDEEM_VAT_PHP = 15;
const STATIC_GCASH_QR_IMAGE = 'assets/images/gcash-static-qr.jpg?v=20260419-2';

const packages = {
    1: { name: 'Starter', price: 5800, duration: '1 Year License | 50 Meters' },
    2: { name: 'Professional', price: 8500, duration: '3 Years License | 100 Meters' },
    3: { name: 'AMAZON LEO', price: 11000, duration: 'LIFETIME LICENSE | 250 Meters' }
};

const CUSTOMER_DETAILS_STORAGE_KEY = 'cynetworkCustomerDetails';
const CLIENT_AUTH_STORAGE_KEY = 'cynetworkClientAuth';

function formatMoney(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
        return '0';
    }
    return numeric.toLocaleString('en-PH');
}

function normalizeQuantity(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return 1;
    }
    return Math.min(100, Math.max(1, parsed));
}

function loadSavedCustomerDetails() {
    try {
        const raw = localStorage.getItem(CUSTOMER_DETAILS_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        return JSON.parse(raw);
    } catch (error) {
        console.warn('Unable to read saved customer details:', error.message);
        return null;
    }
}

function saveCustomerDetails(details) {
    const normalized = {
        fullName: String(details?.fullName || '').trim(),
        contactNumber: String(details?.contactNumber || '').trim(),
        address: String(details?.address || '').trim()
    };

    if (!normalized.fullName && !normalized.contactNumber && !normalized.address) {
        return;
    }

    try {
        localStorage.setItem(CUSTOMER_DETAILS_STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
        console.warn('Unable to save customer details:', error.message);
    }
}

function applySavedCustomerDetailsToForm() {
    const saved = loadSavedCustomerDetails();
    if (!saved) {
        return;
    }

    const fullNameInput = document.getElementById('fullName');
    const contactNumberInput = document.getElementById('contactNumber');
    const addressInput = document.getElementById('address');

    if (fullNameInput) {
        fullNameInput.value = saved.fullName || '';
    }
    if (contactNumberInput) {
        contactNumberInput.value = saved.contactNumber || '';
    }
    if (addressInput) {
        addressInput.value = saved.address || '';
    }
}

function clearSavedCustomerDetails() {
    localStorage.removeItem(CUSTOMER_DETAILS_STORAGE_KEY);

    const fullNameInput = document.getElementById('fullName');
    const contactNumberInput = document.getElementById('contactNumber');
    const addressInput = document.getElementById('address');

    if (fullNameInput) {
        fullNameInput.value = '';
    }
    if (contactNumberInput) {
        contactNumberInput.value = '';
    }
    if (addressInput) {
        addressInput.value = '';
    }

    alert('Saved customer details were cleared from this device.');
}

function setClientAuthMessage(message, type = '') {
    const messageEl = document.getElementById('accountAuthMessage');
    if (!messageEl) {
        return;
    }

    if (!message) {
        messageEl.style.display = 'none';
        messageEl.textContent = '';
        messageEl.className = 'account-auth-message';
        return;
    }

    messageEl.style.display = 'block';
    messageEl.textContent = message;
    messageEl.className = `account-auth-message ${type}`.trim();
}

function setRedeemNotice(message, type = '') {
    const noticeEl = document.getElementById('redeemReferralNotice');
    if (!noticeEl) {
        return;
    }

    if (!message) {
        noticeEl.style.display = 'none';
        noticeEl.textContent = '';
        noticeEl.className = 'redeem-referral-notice';
        return;
    }

    noticeEl.style.display = 'block';
    noticeEl.textContent = message;
    noticeEl.className = `redeem-referral-notice ${type}`.trim();
}

function normalizeGcashNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) {
        return '';
    }

    if (digits.length === 11 && digits.startsWith('09')) {
        return `+63${digits.slice(1)}`;
    }

    if (digits.length === 12 && digits.startsWith('639')) {
        return `+${digits}`;
    }

    return '';
}

function getRedeemComputation() {
    const gross = Number(clientAccount?.referralBalance || 0);
    const vat = REFERRAL_REDEEM_VAT_PHP;
    const net = Math.max(0, gross - vat);
    const canRedeem = Boolean(clientAccount && clientAuthToken && net > 0);

    return { gross, vat, net, canRedeem };
}

function updateRedeemSummaryUi() {
    const grossEl = document.getElementById('redeemGrossAmount');
    const vatEl = document.getElementById('redeemVatAmount');
    const netEl = document.getElementById('redeemNetAmount');
    const redeemBtn = document.getElementById('redeemReferralBtn');

    if (!grossEl || !vatEl || !netEl || !redeemBtn) {
        return;
    }

    const { gross, vat, net, canRedeem } = getRedeemComputation();
    grossEl.textContent = formatMoney(gross);
    vatEl.textContent = formatMoney(vat);
    netEl.textContent = formatMoney(net);

    redeemBtn.disabled = !canRedeem;
    redeemBtn.style.opacity = canRedeem ? '1' : '0.65';
    redeemBtn.style.cursor = canRedeem ? 'pointer' : 'not-allowed';
}

function updateCheckoutAccountNotice() {
    const notice = document.getElementById('checkoutAccountNotice');
    if (!notice) {
        return;
    }

    if (clientAccount) {
        notice.style.display = 'block';
        notice.textContent = `Logged in as ${clientAccount.fullName || clientAccount.email}. Referral balance: PHP ${formatMoney(clientAccount.referralBalance || 0)}.`;
        return;
    }

    notice.style.display = 'block';
    notice.textContent = 'Tip: Create or login to a client account to get your own referral code and earn PHP 100 per successful invite purchase.';
}

function saveClientSession(token, account) {
    clientAuthToken = token || null;
    clientAccount = account || null;

    if (!clientAuthToken || !clientAccount) {
        localStorage.removeItem(CLIENT_AUTH_STORAGE_KEY);
        return;
    }

    localStorage.setItem(
        CLIENT_AUTH_STORAGE_KEY,
        JSON.stringify({
            token: clientAuthToken,
            account: clientAccount
        })
    );
}

function loadClientSession() {
    try {
        const raw = localStorage.getItem(CLIENT_AUTH_STORAGE_KEY);
        if (!raw) {
            clientAuthToken = null;
            clientAccount = null;
            return;
        }

        const parsed = JSON.parse(raw);
        clientAuthToken = parsed?.token || null;
        clientAccount = parsed?.account || null;
    } catch (error) {
        console.warn('Unable to load client session:', error.message);
        clientAuthToken = null;
        clientAccount = null;
    }
}

function clearClientSession() {
    clientAuthToken = null;
    clientAccount = null;
    localStorage.removeItem(CLIENT_AUTH_STORAGE_KEY);
}

function buildReferralLink(code) {
    if (!code) {
        return '';
    }

    const cleanCode = String(code).trim().toUpperCase();
    const url = new URL(`${window.location.origin}${window.location.pathname}`);
    url.searchParams.set('ref', cleanCode);
    return url.toString();
}

function getReferralCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get('ref') || params.get('referral') || '').trim().toUpperCase();
}

function applyReferralCodeFromUrl() {
    const referralCode = getReferralCodeFromUrl();
    if (!referralCode) {
        return;
    }

    const registerReferralInput = document.getElementById('registerReferralCode');
    if (registerReferralInput && !registerReferralInput.value.trim()) {
        registerReferralInput.value = referralCode;
    }

    if (!clientAccount) {
        setClientAuthMessage(`Referral code detected: ${referralCode}. Register now to link this account.`, 'success');
    }
}

function updateClientAccountUi() {
    const navAccountButton = document.querySelector('.account-nav-btn');
    const dashboardLoggedOut = document.getElementById('accountDashboardLoggedOut');
    const dashboardLoggedIn = document.getElementById('accountDashboardLoggedIn');

    if (clientAccount && clientAuthToken) {
        const displayName = String(clientAccount.fullName || clientAccount.email || 'Client').trim();
        const firstName = displayName.split(' ')[0] || 'Client';

        if (navAccountButton) {
            navAccountButton.textContent = `Account: ${firstName}`;
        }

        if (dashboardLoggedOut) {
            dashboardLoggedOut.style.display = 'none';
        }

        if (dashboardLoggedIn) {
            dashboardLoggedIn.style.display = 'block';
        }

        document.getElementById('clientAccountName').textContent = clientAccount.fullName || '--';
        document.getElementById('clientAccountEmail').textContent = clientAccount.email || '--';
        document.getElementById('clientReferralCode').textContent = clientAccount.referralCode || '--';
        document.getElementById('clientReferralBalance').textContent = `PHP ${formatMoney(clientAccount.referralBalance || 0)}`;
        document.getElementById('clientInviteCount').textContent = String(clientAccount.inviteCount || 0);
        document.getElementById('clientConvertedInviteCount').textContent = String(clientAccount.convertedInviteCount || 0);
        document.getElementById('clientReferralLink').value = buildReferralLink(clientAccount.referralCode || '');

        const fullNameInput = document.getElementById('fullName');
        if (fullNameInput && !fullNameInput.value.trim() && clientAccount.fullName) {
            fullNameInput.value = clientAccount.fullName;
        }

        const contactNumberInput = document.getElementById('contactNumber');
        if (contactNumberInput && !contactNumberInput.value.trim() && clientAccount.contactNumber) {
            contactNumberInput.value = clientAccount.contactNumber;
        }

        setRedeemNotice('');
    } else {
        if (navAccountButton) {
            navAccountButton.textContent = 'Client Account';
        }

        if (dashboardLoggedOut) {
            dashboardLoggedOut.style.display = 'block';
        }

        if (dashboardLoggedIn) {
            dashboardLoggedIn.style.display = 'none';
        }

        const redeemForm = document.getElementById('referralRedeemForm');
        if (redeemForm) {
            redeemForm.reset();
        }

        setRedeemNotice('');
    }

    updateRedeemSummaryUi();
    updateCheckoutAccountNotice();
}

function switchAccountTab(tabName) {
    const validTabs = ['login', 'register', 'dashboard'];
    const safeTab = validTabs.includes(tabName) ? tabName : 'login';

    validTabs.forEach((tab) => {
        const button = document.getElementById(`accountTab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`);
        const panel = document.getElementById(`account${tab.charAt(0).toUpperCase()}${tab.slice(1)}Panel`);

        if (button) {
            button.classList.toggle('active', tab === safeTab);
        }

        if (panel) {
            panel.classList.toggle('active', tab === safeTab);
        }
    });
}

function openAccountModal(preferredTab = '') {
    const modal = document.getElementById('accountModal');
    if (!modal) {
        return;
    }

    modal.classList.add('show');

    if (preferredTab) {
        switchAccountTab(preferredTab);
        return;
    }

    if (clientAccount && clientAuthToken) {
        switchAccountTab('dashboard');
    } else {
        switchAccountTab('login');
    }
}

function closeAccountModal() {
    const modal = document.getElementById('accountModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

async function refreshClientAccountSummary(silent = false) {
    if (!clientAuthToken) {
        clearClientSession();
        updateClientAccountUi();
        return;
    }

    try {
        const response = await fetch(`${API_URL}/client/me`, {
            headers: {
                Authorization: `Bearer ${clientAuthToken}`
            }
        });

        if (!response.ok) {
            clearClientSession();
            updateClientAccountUi();
            if (!silent) {
                setClientAuthMessage('Session expired. Please login again.', 'error');
                switchAccountTab('login');
            }
            return;
        }

        const result = await response.json();
        saveClientSession(clientAuthToken, result.account || null);
        updateClientAccountUi();

        if (!silent) {
            setClientAuthMessage('Account details refreshed.', 'success');
            switchAccountTab('dashboard');
        }
    } catch (error) {
        if (!silent) {
            setClientAuthMessage('Unable to refresh account right now. Please try again.', 'error');
        }
    }
}

async function handleClientLogin(event) {
    event.preventDefault();

    const email = document.getElementById('clientLoginEmail').value.trim().toLowerCase();
    const password = document.getElementById('clientLoginPassword').value;

    if (!email || !password) {
        setClientAuthMessage('Email and password are required.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/client/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();
        if (!response.ok) {
            setClientAuthMessage(result.error || 'Login failed. Please try again.', 'error');
            return;
        }

        saveClientSession(result.token, result.account || null);
        updateClientAccountUi();
        switchAccountTab('dashboard');
        setClientAuthMessage('Login successful. You can now use your referral dashboard.', 'success');

        document.getElementById('clientLoginForm').reset();
    } catch (error) {
        setClientAuthMessage('Unable to login right now. Please try again later.', 'error');
    }
}

async function handleClientRegister(event) {
    event.preventDefault();

    const fullName = document.getElementById('clientRegisterName').value.trim();
    const contactNumber = document.getElementById('clientRegisterContact').value.trim();
    const email = document.getElementById('clientRegisterEmail').value.trim().toLowerCase();
    const password = document.getElementById('clientRegisterPassword').value;
    const referralCode = document.getElementById('registerReferralCode').value.trim().toUpperCase();

    if (!fullName || !email || !password) {
        setClientAuthMessage('Full name, email, and password are required.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/client/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullName,
                contactNumber,
                email,
                password,
                referralCode: referralCode || null
            })
        });

        const result = await response.json();
        if (!response.ok) {
            setClientAuthMessage(result.error || 'Registration failed. Please try again.', 'error');
            return;
        }

        saveClientSession(result.token, result.account || null);
        updateClientAccountUi();
        switchAccountTab('dashboard');
        setClientAuthMessage('Account created successfully. Share your referral link to earn PHP 100 per successful invite.', 'success');

        document.getElementById('clientRegisterForm').reset();
    } catch (error) {
        setClientAuthMessage('Unable to register right now. Please try again later.', 'error');
    }
}

async function handleReferralRedeem(event) {
    event.preventDefault();

    if (!clientAuthToken || !clientAccount) {
        setRedeemNotice('Please login to redeem your referral rewards.', 'error');
        switchAccountTab('login');
        return;
    }

    const { canRedeem } = getRedeemComputation();
    if (!canRedeem) {
        setRedeemNotice('Your current referral balance is not enough to redeem after the PHP 15 VAT deduction.', 'error');
        return;
    }

    const gcashName = document.getElementById('redeemGcashName')?.value?.trim() || '';
    const gcashNumberRaw = document.getElementById('redeemGcashNumber')?.value?.trim() || '';
    const gcashNumber = normalizeGcashNumber(gcashNumberRaw);

    if (!gcashName) {
        setRedeemNotice('GCash name is required.', 'error');
        return;
    }

    if (!gcashNumber) {
        setRedeemNotice('Please enter a valid GCash number (09XXXXXXXXX or +639XXXXXXXXX).', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/client/redeem-referral`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${clientAuthToken}`
            },
            body: JSON.stringify({
                gcashName,
                gcashNumber
            })
        });

        const result = await response.json();
        if (!response.ok) {
            setRedeemNotice(result.error || 'Redeem request failed. Please try again.', 'error');
            return;
        }

        if (result.account) {
            saveClientSession(clientAuthToken, result.account);
        }

        updateClientAccountUi();
        const redeemForm = document.getElementById('referralRedeemForm');
        if (redeemForm) {
            redeemForm.reset();
        }

        const successMessage = result.message || 'Redemption request submitted. Redemption of rewards will be given within 2 business days.';
        setRedeemNotice(successMessage, 'success');
        setClientAuthMessage(successMessage, 'success');
        refreshClientAccountSummary(true);
    } catch (error) {
        setRedeemNotice('Unable to submit redeem request right now. Please try again later.', 'error');
    }
}

function logoutClientAccount() {
    clearClientSession();
    updateClientAccountUi();
    switchAccountTab('login');
    setClientAuthMessage('You are logged out from your client account.', 'success');
}

async function copyReferralLink() {
    const referralInput = document.getElementById('clientReferralLink');
    if (!referralInput || !referralInput.value.trim()) {
        setClientAuthMessage('No referral link found yet.', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(referralInput.value.trim());
        setClientAuthMessage('Referral link copied to clipboard.', 'success');
    } catch (error) {
        referralInput.select();
        document.execCommand('copy');
        setClientAuthMessage('Referral link copied.', 'success');
    }
}

function initClientAccountFeatures() {
    loadClientSession();
    updateClientAccountUi();

    const loginForm = document.getElementById('clientLoginForm');
    const registerForm = document.getElementById('clientRegisterForm');
    const redeemForm = document.getElementById('referralRedeemForm');

    if (loginForm && loginForm.dataset.bound !== 'true') {
        loginForm.addEventListener('submit', handleClientLogin);
        loginForm.dataset.bound = 'true';
    }

    if (registerForm && registerForm.dataset.bound !== 'true') {
        registerForm.addEventListener('submit', handleClientRegister);
        registerForm.dataset.bound = 'true';
    }

    if (redeemForm && redeemForm.dataset.bound !== 'true') {
        redeemForm.addEventListener('submit', handleReferralRedeem);
        redeemForm.dataset.bound = 'true';
    }

    applyReferralCodeFromUrl();

    if (clientAuthToken) {
        refreshClientAccountSummary(true);
    }
}

// =====================================================
// PACKAGE SELECTION
// =====================================================

function selectPackage(packageNum) {
    selectedPackage = packageNum;
    const packageData = packages[packageNum];
    selectedUnitPrice = Number(packageData?.price || 0);
    selectedQuantity = 1;
    selectedTotalPrice = selectedUnitPrice;
    
    // Show modal
    document.getElementById('paymentModal').classList.add('show');
    
    // Set package info in step 1
    document.getElementById('selectedPackageText').textContent = packageData.name;

    const quantityInput = document.getElementById('orderQuantity');
    if (quantityInput) {
        quantityInput.value = '1';
    }

    recalculateSelectedTotal({ refreshQr: false });
    updateCheckoutAccountNotice();
    
    // Generate QR code
    generateQRCode({ ...packageData, price: selectedTotalPrice });
    
    // Reset steps
    currentStep = 1;
    showStep(1);
    resetForm();
    applySavedCustomerDetailsToForm();
}

function recalculateSelectedTotal({ refreshQr = true } = {}) {
    if (!selectedPackage || !packages[selectedPackage]) {
        return;
    }

    const packageData = packages[selectedPackage];
    selectedUnitPrice = Number(packageData.price || 0);

    const quantityInput = document.getElementById('orderQuantity');
    const normalizedQuantity = normalizeQuantity(quantityInput?.value || selectedQuantity);
    selectedQuantity = normalizedQuantity;

    if (quantityInput) {
        quantityInput.value = String(normalizedQuantity);
    }

    selectedTotalPrice = selectedUnitPrice * selectedQuantity + FREE_SHIPPING_FEE;

    const unitPriceEl = document.getElementById('selectedUnitPrice');
    const quantityTextEl = document.getElementById('selectedQuantityText');
    const totalPriceEl = document.getElementById('selectedPrice');
    const totalSummaryEl = document.getElementById('selectedTotalPrice');

    if (unitPriceEl) {
        unitPriceEl.textContent = formatMoney(selectedUnitPrice);
    }

    if (quantityTextEl) {
        quantityTextEl.textContent = String(selectedQuantity);
    }

    if (totalPriceEl) {
        totalPriceEl.textContent = formatMoney(selectedTotalPrice);
    }

    if (totalSummaryEl) {
        totalSummaryEl.textContent = formatMoney(selectedTotalPrice);
    }

    if (refreshQr) {
        generateQRCode({ ...packageData, price: selectedTotalPrice });
    }
}

function handleQuantityChange() {
    recalculateSelectedTotal({ refreshQr: true });
}

// =====================================================
// QR CODE GENERATION
// =====================================================

function generateQRCode() {
    const qrWrap = document.getElementById('qrcode');
    if (!qrWrap) {
        return;
    }

    qrWrap.innerHTML = '';

    const qrImage = document.createElement('img');
    qrImage.src = STATIC_GCASH_QR_IMAGE;
    qrImage.alt = 'Official GCash payment QR code';
    qrImage.className = 'static-gcash-qr-image';
    qrWrap.appendChild(qrImage);
}

// =====================================================
// PAYMENT FLOW
// =====================================================

function showStep(stepNum) {
    for (let i = 1; i <= 5; i++) {
        const step = document.getElementById(`step${i}`);
        if (step) {
            step.classList.remove('active');
        }
    }
    document.getElementById(`step${stepNum}`).classList.add('active');
}

function nextStep() {
    if (currentStep < 5) {
        currentStep++;
        showStep(currentStep);
    }
}

function previousStep() {
    if (currentStep > 1) {
        currentStep--;
        showStep(currentStep);
    }
}

// =====================================================
// FILE UPLOAD HANDLING
// =====================================================

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            uploadedProofImage = e.target.result;
            const preview = document.getElementById('uploadPreview');
            preview.innerHTML = `<img src="${e.target.result}" alt="Proof Preview">`;
        };
        reader.readAsDataURL(file);
    } else {
        alert('Please select a valid image file');
    }
}

function validateProof() {
    if (!uploadedProofImage) {
        alert('Please upload a proof image');
        return;
    }
    nextStep();
}

// =====================================================
// FORM VALIDATION
// =====================================================

function validatePersonalInfo() {
    const fullName = document.getElementById('fullName').value.trim();
    const contactNumber = document.getElementById('contactNumber').value.trim();
    const address = document.getElementById('address').value.trim();
    
    if (!fullName || !contactNumber || !address) {
        alert('Please fill in all required fields');
        return null;
    }
    
    if (!/^\+?63[0-9]{10}$/.test(contactNumber)) {
        alert('Please enter a valid Philippine phone number');
        return;
    }

    saveCustomerDetails({ fullName, contactNumber, address });
    
    nextStep();
}

// =====================================================
// TRANSACTION COMPLETION
// =====================================================

async function completeTransaction() {
    if (!selectedPackage || !packages[selectedPackage]) {
        alert('Please select a package first.');
        return;
    }

    const wifiName = document.getElementById('wifiName').value.trim();
    const wifiPassword = document.getElementById('wifiPassword').value.trim();
    const wifiRate = document.getElementById('wifiRate').value;

    recalculateSelectedTotal({ refreshQr: false });
    const orderQuantity = normalizeQuantity(selectedQuantity);
    const selectedPackageData = packages[selectedPackage];
    
    if (!wifiName || !wifiPassword || !wifiRate) {
        alert('Please fill in all WiFi configuration fields');
        return;
    }

    const fullName = document.getElementById('fullName').value.trim();
    const contactNumber = document.getElementById('contactNumber').value.trim();
    const address = document.getElementById('address').value.trim();

    if (!fullName || !contactNumber || !address) {
        alert('Please fill in all required fields');
        return;
    }

    if (!/^\+?63[0-9]{10}$/.test(contactNumber)) {
        alert('Please enter a valid Philippine phone number');
        return;
    }

    const isOfflineFileMode = window.location.protocol === 'file:';

    let resolvedOrderId = null;
    let resolvedTrackingNumber = null;
    let resolvedOrderStatus = 'pending';
    let resolvedTotalPrice = selectedTotalPrice;
    let resolvedUnitPrice = selectedUnitPrice;
    let resolvedShippingFee = FREE_SHIPPING_FEE;
    let referralRewardApplied = false;
    let referralRewardAmount = 0;
    let submittedToServer = false;
    let backendFailureMessage = '';

    // Prepare transaction data
    const transactionData = {
        packageId: selectedPackage,
        packageName: selectedPackageData.name,
        price: selectedTotalPrice,
        unitPrice: selectedUnitPrice,
        totalPrice: selectedTotalPrice,
        shippingFee: FREE_SHIPPING_FEE,
        quantity: orderQuantity,
        duration: selectedPackageData.duration,
        fullName: fullName,
        contactNumber: contactNumber,
        address: address,
        wifiName: wifiName,
        wifiPassword: wifiPassword,
        wifiRate: wifiRate,
        proofImage: uploadedProofImage
    };

    saveCustomerDetails({
        fullName: transactionData.fullName,
        contactNumber: transactionData.contactNumber,
        address: transactionData.address
    });
    
    // Try to submit to backend
    try {
        const requestHeaders = { 'Content-Type': 'application/json' };
        if (clientAuthToken) {
            requestHeaders.Authorization = `Bearer ${clientAuthToken}`;
        }

        const response = await fetch(`${API_URL}/submit-order`, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(transactionData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Order submitted to backend:', result);
            if (result && result.orderId) {
                resolvedOrderId = String(result.orderId);
                resolvedTrackingNumber = result.trackingNumber ? String(result.trackingNumber) : null;
                resolvedOrderStatus = String(result.status || 'pending').toLowerCase();
                resolvedTotalPrice = Number(result.totalPrice ?? selectedTotalPrice);
                resolvedUnitPrice = Number(result.unitPrice ?? selectedUnitPrice);
                resolvedShippingFee = Number(result.shippingFee ?? FREE_SHIPPING_FEE);
                referralRewardApplied = Boolean(result.referralRewardApplied);
                referralRewardAmount = Number(result.referralRewardAmount || 0);
                submittedToServer = true;
            }
        } else {
            const errorText = await response.text();
            backendFailureMessage = errorText || 'Server rejected the order request.';
            console.warn('Backend submission failed:', backendFailureMessage);
        }
    } catch (error) {
        backendFailureMessage = error.message;
        console.warn('Backend not available:', error.message);
    }

    // Public mode should only finish transaction after real server save.
    if (!submittedToServer && !isOfflineFileMode) {
        alert('Order was not submitted to the server. Please check your internet and try again.');
        if (backendFailureMessage) {
            console.warn('Submission details:', backendFailureMessage);
        }
        return;
    }

    // Local fallback is allowed only in offline file mode.
    if (!submittedToServer && isOfflineFileMode) {
        resolvedOrderId = `LOCAL-${Date.now()}`;
        resolvedTrackingNumber = `LOCAL-TRACK-${Date.now()}`;
    }
    
    // Also save to localStorage as backup
    try {
        let transactions = JSON.parse(localStorage.getItem('cynetworkTransactions') || '[]');
        transactions.push({
            ...transactionData,
            orderId: resolvedOrderId || `LOCAL-${Date.now()}`,
            trackingNumber: resolvedTrackingNumber || '',
            status: resolvedOrderStatus,
            quantity: orderQuantity,
            unitPrice: resolvedUnitPrice,
            totalPrice: resolvedTotalPrice,
            shippingFee: resolvedShippingFee,
            timestamp: new Date().toLocaleString()
        });
        localStorage.setItem('cynetworkTransactions', JSON.stringify(transactions));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }

    latestOrderId = resolvedOrderId || '';
    latestOrderStatus = resolvedOrderStatus;
    latestTrackingNumber = resolvedTrackingNumber || '';

    // Show success screen
    document.getElementById('confirmOrderId').textContent = resolvedOrderId || '--';
    document.getElementById('confirmTrackingNumber').textContent = resolvedTrackingNumber || '--';
    document.getElementById('confirmOrderStatus').textContent = resolvedOrderStatus.toUpperCase();
    document.getElementById('confirmQuantity').textContent = String(orderQuantity);
    document.getElementById('confirmTotalPrice').textContent = formatMoney(resolvedTotalPrice);
    document.getElementById('confirmWifiName').textContent = wifiName;
    document.getElementById('confirmDuration').textContent = selectedPackageData.duration;
    document.getElementById('confirmName').textContent = fullName;

    const rewardWrap = document.getElementById('confirmReferralRewardWrap');
    const rewardText = document.getElementById('confirmReferralRewardText');
    if (rewardWrap && rewardText) {
        if (referralRewardApplied && referralRewardAmount > 0) {
            rewardWrap.style.display = 'block';
            rewardText.textContent = `A referral reward of PHP ${formatMoney(referralRewardAmount)} has been credited to your inviter account.`;
        } else {
            rewardWrap.style.display = 'none';
            rewardText.textContent = '';
        }
    }

    if (clientAuthToken) {
        refreshClientAccountSummary(true);
    }

    syncSupportSessionWithLatestOrder();

    const trackBtn = document.getElementById('trackPendingOrderBtn');
    const pendingNotice = document.getElementById('pendingOrderNotice');
    const isPending = resolvedOrderStatus === 'pending' && Boolean(resolvedOrderId);
    if (trackBtn) {
        trackBtn.style.display = isPending ? 'inline-block' : 'none';
    }
    if (pendingNotice) {
        pendingNotice.style.display = isPending ? 'block' : 'none';
    }
    
    currentStep = 5;
    showStep(5);
}

// =====================================================
// MODAL FUNCTIONS
// =====================================================

function closeModal() {
    document.getElementById('paymentModal').classList.remove('show');
    resetForm();
}

function resetForm() {
    document.getElementById('fullName').value = '';
    document.getElementById('contactNumber').value = '';
    document.getElementById('address').value = '';
    document.getElementById('wifiName').value = '';
    document.getElementById('wifiPassword').value = '';
    document.getElementById('wifiRate').value = '';
    document.getElementById('proofImage').value = '';
    document.getElementById('uploadPreview').innerHTML = '';

    const quantityInput = document.getElementById('orderQuantity');
    if (quantityInput) {
        quantityInput.value = '1';
    }

    selectedQuantity = 1;
    if (selectedPackage && packages[selectedPackage]) {
        selectedUnitPrice = Number(packages[selectedPackage].price || 0);
    }
    selectedTotalPrice = selectedUnitPrice;
    recalculateSelectedTotal({ refreshQr: false });

    uploadedProofImage = null;
}

function scrollToPackages() {
    document.getElementById('packages').scrollIntoView({ behavior: 'smooth' });
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const paymentModal = document.getElementById('paymentModal');
    const trackingModal = document.getElementById('trackOrderModal');
    const accountModal = document.getElementById('accountModal');

    if (event.target === paymentModal) {
        closeModal();
    }

    if (event.target === trackingModal) {
        closeTrackOrderModal();
    }

    if (event.target === accountModal) {
        closeAccountModal();
    }
});

function openTrackOrderModal(prefillOrderId = '') {
    const modal = document.getElementById('trackOrderModal');
    const input = document.getElementById('trackOrderIdInput');
    const result = document.getElementById('trackOrderResult');

    if (!modal || !input || !result) {
        return;
    }

    input.value = prefillOrderId || '';
    result.style.display = 'none';
    modal.classList.add('show');
    input.focus();
}

function closeTrackOrderModal() {
    const modal = document.getElementById('trackOrderModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function trackPendingOrder() {
    const lookupToTrack = latestTrackingNumber
        || latestOrderId
        || document.getElementById('confirmTrackingNumber')?.textContent?.trim()
        || document.getElementById('confirmOrderId')?.textContent?.trim()
        || '';
    openTrackOrderModal(lookupToTrack);
    if (lookupToTrack) {
        trackOrder();
    }
}

function getLocalTrackedOrder(orderLookup) {
    try {
        const transactions = JSON.parse(localStorage.getItem('cynetworkTransactions') || '[]');
        return transactions.find((item) => {
            const orderIdMatch = String(item.orderId || '') === String(orderLookup);
            const trackingMatch = String(item.trackingNumber || '') === String(orderLookup);
            return orderIdMatch || trackingMatch;
        }) || null;
    } catch (error) {
        console.error('Error reading local transactions:', error);
        return null;
    }
}

function setTrackStatusBadge(status) {
    const statusEl = document.getElementById('trackResultStatus');
    if (!statusEl) {
        return;
    }

    const normalized = String(status || 'pending').toLowerCase();
    statusEl.textContent = normalized.toUpperCase();
    statusEl.className = `track-status-badge ${normalized}`;
}

function formatTrackDate(dateValue) {
    if (!dateValue) {
        return '--';
    }
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? String(dateValue) : date.toLocaleString();
}

function renderTrackOrderResult(orderData) {
    const resultWrap = document.getElementById('trackOrderResult');
    if (!resultWrap) {
        return;
    }

    document.getElementById('trackResultOrderId').textContent = orderData.orderId || '--';
    document.getElementById('trackResultTracking').textContent = orderData.trackingNumber || '--';
    document.getElementById('trackResultPackage').textContent = orderData.packageName || '--';
    document.getElementById('trackResultQuantity').textContent = String(orderData.quantity || 1);
    document.getElementById('trackResultTotal').textContent = formatMoney(orderData.totalPrice || orderData.price || 0);
    document.getElementById('trackResultShipping').textContent = Number(orderData.shippingFee || 0) === 0
        ? 'FREE (PHP 0)'
        : `PHP ${formatMoney(orderData.shippingFee)}`;
    document.getElementById('trackResultDate').textContent = formatTrackDate(orderData.createdAt || orderData.timestamp);
    document.getElementById('trackResultUpdated').textContent = formatTrackDate(orderData.updatedAt || orderData.timestamp);
    setTrackStatusBadge(orderData.status || 'pending');

    const reasonWrap = document.getElementById('trackResultReasonWrap');
    const reasonText = document.getElementById('trackResultReason');
    const normalizedStatus = String(orderData.status || 'pending').toLowerCase();

    let notes = '';
    if (orderData.rejectionReason) {
        notes = orderData.rejectionReason;
    } else if (normalizedStatus === 'pending') {
        notes = 'Your order is pending review. Please check back later for updates.';
    } else if (normalizedStatus === 'approved') {
        notes = 'Your order is approved. Please prepare for setup and activation instructions.';
    } else if (normalizedStatus === 'delivery') {
        notes = 'Wait for the tracking number of the order that will be sent to you on Facebook. It will be shipped within 7 days ASAP.';
    } else if (normalizedStatus === 'completed') {
        notes = 'Your order is completed. Thank you for choosing CYNETWORK PISOWIFI.';
    }

    if (notes) {
        reasonWrap.style.display = 'block';
        reasonText.textContent = notes;
    } else {
        reasonWrap.style.display = 'none';
        reasonText.textContent = '';
    }

    resultWrap.style.display = 'block';
}

async function trackOrder() {
    const orderIdInput = document.getElementById('trackOrderIdInput');
    if (!orderIdInput) {
        return;
    }

    const orderId = orderIdInput.value.trim();
    if (!orderId) {
        alert('Please enter your order ID');
        return;
    }

    const localOrder = getLocalTrackedOrder(orderId);
    if (String(orderId).startsWith('LOCAL-') && localOrder) {
        renderTrackOrderResult({
            orderId: localOrder.orderId,
            trackingNumber: localOrder.trackingNumber || localOrder.orderId,
            packageName: localOrder.packageName,
            quantity: localOrder.quantity || 1,
            totalPrice: localOrder.totalPrice || localOrder.price || 0,
            shippingFee: localOrder.shippingFee || 0,
            status: localOrder.status || 'pending',
            createdAt: localOrder.timestamp,
            updatedAt: localOrder.timestamp
        });
        return;
    }

    try {
        const response = await fetch(`${API_URL}/track-order/${encodeURIComponent(orderId)}`);
        if (response.ok) {
            const result = await response.json();
            renderTrackOrderResult(result);
            return;
        }

        if (localOrder) {
            renderTrackOrderResult({
                orderId: localOrder.orderId,
                trackingNumber: localOrder.trackingNumber || localOrder.orderId,
                packageName: localOrder.packageName,
                quantity: localOrder.quantity || 1,
                totalPrice: localOrder.totalPrice || localOrder.price || 0,
                shippingFee: localOrder.shippingFee || 0,
                status: localOrder.status || 'pending',
                createdAt: localOrder.timestamp,
                updatedAt: localOrder.timestamp
            });
            return;
        }

        alert('Order not found. Please check your order ID and try again.');
    } catch (error) {
        if (localOrder) {
            renderTrackOrderResult({
                orderId: localOrder.orderId,
                trackingNumber: localOrder.trackingNumber || localOrder.orderId,
                packageName: localOrder.packageName,
                quantity: localOrder.quantity || 1,
                totalPrice: localOrder.totalPrice || localOrder.price || 0,
                shippingFee: localOrder.shippingFee || 0,
                status: localOrder.status || 'pending',
                createdAt: localOrder.timestamp,
                updatedAt: localOrder.timestamp
            });
            return;
        }
        alert('Unable to track order right now. Please try again later.');
    }
}

// =====================================================
// PICTURE VIEWER MODAL
// =====================================================

const packageImages = {
    1: ['assets/images/package1.png'],
    2: ['assets/images/package2.png'],
    3: ['assets/images/amazon-leo.webp']
};

const packageImageFallbacks = {
    1: 'assets/images/package1.png',
    2: 'assets/images/package2.png',
    3: 'assets/images/amazon-leo.webp'
};

function initPackageImagesFromServer() {
    [1, 2, 3].forEach((packageNum) => {
        const remoteImageSrc = `${API_URL}/images/package/${packageNum}?t=${Date.now()}`;
        packageImages[packageNum] = [remoteImageSrc];

        const packageCardImage = document.querySelector(`.package-card[data-package="${packageNum}"] .package-image`);
        if (packageCardImage) {
            packageCardImage.onerror = () => {
                packageCardImage.onerror = null;
                packageCardImage.src = packageImageFallbacks[packageNum];
            };
            packageCardImage.src = remoteImageSrc;
        }
    });
}

let currentImageIndex = 0;

function viewFullPicture(packageNum) {
    const images = packageImages[packageNum];
    if (images && images.length > 0) {
        currentImageIndex = 0;
        const modal = document.getElementById('pictureModal');
        const imgElement = document.getElementById('pictureModalImg');
        imgElement.onerror = () => {
            imgElement.onerror = null;
            imgElement.src = packageImageFallbacks[packageNum] || images[0];
        };
        imgElement.src = images[0];
        modal.classList.add('active');
    }
}

function closePictureModal() {
    const modal = document.getElementById('pictureModal');
    modal.classList.remove('active');
    currentImageIndex = 0;
}

// =====================================================
// AI CUSTOMER SUPPORT CHAT
// =====================================================

function getOrCreateSupportClientId() {
    let clientId = localStorage.getItem('cynetworkSupportClientId');
    if (!clientId) {
        clientId = `client-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
        localStorage.setItem('cynetworkSupportClientId', clientId);
    }
    return clientId;
}

function setSupportUnreadBadge(count) {
    const badge = document.getElementById('supportUnreadBadge');
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

function updateSupportChatStatus(status) {
    const normalized = String(status || 'ai').toLowerCase();
    supportChatStatus = normalized;

    const statusText = document.getElementById('supportChatStatusText');
    if (!statusText) {
        return;
    }

    if (normalized === 'live') {
        statusText.textContent = 'AI Chat Status: Live Customer Support Active';
        return;
    }

    if (normalized === 'closed') {
        statusText.textContent = 'AI Chat Status: Closed by Admin';
        return;
    }

    statusText.textContent = 'AI Chat Status: AI Assistant';
}

async function ensureSupportSession() {
    if (!supportClientId) {
        supportClientId = getOrCreateSupportClientId();
    }

    const payload = {
        clientId: supportClientId,
        orderId: latestOrderId && /^\d+$/.test(String(latestOrderId)) ? Number(latestOrderId) : null,
        trackingNumber: latestTrackingNumber || null,
        customerName: document.getElementById('fullName')?.value?.trim() || null,
        customerContact: document.getElementById('contactNumber')?.value?.trim() || null
    };

    const response = await fetch(`${API_URL}/chat/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Unable to initialize support chat session');
    }

    const result = await response.json();
    supportChatSessionId = result?.session?.id || supportChatSessionId;
    updateSupportChatStatus(result?.session?.status || 'ai');
    return result?.session || null;
}

function syncSupportSessionWithLatestOrder() {
    if (!supportClientId) {
        return;
    }

    ensureSupportSession().catch((error) => {
        console.warn('Unable to sync support session metadata:', error.message);
    });
}

async function sendSupportMessageToServer(senderType, text) {
    if (!supportChatSessionId) {
        await ensureSupportSession();
    }

    const response = await fetch(`${API_URL}/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: supportChatSessionId,
            clientId: supportClientId,
            senderType,
            message: text
        })
    });

    if (!response.ok) {
        throw new Error('Failed to send support message');
    }

    const result = await response.json();
    return result?.message || null;
}

async function requestLiveSupport() {
    if (!supportChatSessionId) {
        await ensureSupportSession();
    }

    const response = await fetch(`${API_URL}/chat/live-support-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: supportChatSessionId,
            clientId: supportClientId
        })
    });

    if (!response.ok) {
        throw new Error('Failed to request live support');
    }

    const result = await response.json();
    updateSupportChatStatus(result?.status || 'live');
}

function mapSupportSenderToUiType(senderType) {
    if (senderType === 'client') {
        return 'user';
    }
    if (senderType === 'admin') {
        return 'agent';
    }
    if (senderType === 'system') {
        return 'status';
    }
    return 'bot';
}

async function fetchSupportMessages({ markRead = null } = {}) {
    if (!supportChatSessionId || !supportClientId) {
        return;
    }

    const chatPanel = document.getElementById('supportChatPanel');
    const isOpen = chatPanel?.classList.contains('open');
    const shouldMarkRead = typeof markRead === 'boolean' ? markRead : isOpen;
    const startingAfterId = supportLastMessageId;

    try {
        const response = await fetch(
            `${API_URL}/chat/messages/${supportChatSessionId}?clientId=${encodeURIComponent(supportClientId)}&afterId=${supportLastMessageId}&markRead=${shouldMarkRead ? '1' : '0'}`
        );

        if (!response.ok) {
            return;
        }

        const result = await response.json();
        updateSupportChatStatus(result?.session?.status || supportChatStatus);

        const incomingMessages = result?.messages || [];
        incomingMessages.forEach((message) => {
            supportLastMessageId = Math.max(supportLastMessageId, Number(message.id || 0));

            if (!isOpen && message.senderType === 'admin' && startingAfterId > 0) {
                const badge = document.getElementById('supportUnreadBadge');
                const existing = parseInt(badge?.textContent || '0', 10) || 0;
                setSupportUnreadBadge(existing + 1);
            }

            addSupportMessage(mapSupportSenderToUiType(message.senderType), message.message, message.id);
        });
    } catch (error) {
        console.warn('Support message polling failed:', error.message);
    }
}

function startSupportPolling() {
    if (supportChatPollTimer) {
        return;
    }

    supportChatPollTimer = setInterval(() => {
        fetchSupportMessages();
    }, 4000);
}

function isLiveSupportRequest(text) {
    return hasKeyword(text, ['live support', 'live agent', 'human agent', 'talk to admin', 'talk to support', 'customer support']);
}

function isTrackingIntent(text) {
    return hasKeyword(text, [
        'track',
        'tracking',
        'order status',
        'status',
        'pending order',
        'pending status',
        'follow up',
        'follow-up',
        'followup',
        'nasaan order',
        'status ng order',
        'check order'
    ]);
}

function extractTrackingLookupFromText(message) {
    const raw = String(message || '').trim();
    if (!raw) {
        return '';
    }

    const trackingMatch = raw.toUpperCase().match(/CYN-\d{8}-\d{6}/);
    if (trackingMatch) {
        return trackingMatch[0];
    }

    const orderMatch = raw.match(/(?:order(?:\s*id)?|\bid\b|#)\s*[:#-]?\s*(\d{1,9})/i);
    if (orderMatch && orderMatch[1]) {
        return orderMatch[1];
    }

    if (/^\d{1,9}$/.test(raw)) {
        return raw;
    }

    return '';
}

function getLatestKnownOrderLookup() {
    const candidates = [
        latestTrackingNumber,
        latestOrderId,
        document.getElementById('confirmTrackingNumber')?.textContent?.trim(),
        document.getElementById('confirmOrderId')?.textContent?.trim()
    ];

    return candidates.find((item) => item && item !== '--') || '';
}

function getStatusNoteForOrder(orderData) {
    const normalizedStatus = String(orderData?.status || 'pending').toLowerCase();

    if (orderData?.rejectionReason) {
        return `Notes: ${orderData.rejectionReason}`;
    }

    if (normalizedStatus === 'pending') {
        return 'Your order is still pending review. Please keep this tracking number and check again later.';
    }

    if (normalizedStatus === 'approved') {
        return 'Your order is approved. Our team will proceed with activation and setup instructions.';
    }

    if (normalizedStatus === 'delivery') {
        return 'Wait for the tracking number of the order that will be sent to you on Facebook. It will be shipped within 7 days ASAP.';
    }

    if (normalizedStatus === 'completed') {
        return 'Your order is completed. Thank you for choosing CYNETWORK PISOWIFI.';
    }

    if (normalizedStatus === 'cancelled') {
        return 'Your order is currently marked as cancelled. Contact support if you need assistance.';
    }

    return 'Please keep your tracking number for your next follow-up.';
}

async function getTrackedOrderFromLookup(lookup) {
    const normalizedLookup = String(lookup || '').trim();
    if (!normalizedLookup) {
        return { error: 'missing_lookup' };
    }

    const localOrder = getLocalTrackedOrder(normalizedLookup);
    if (String(normalizedLookup).startsWith('LOCAL-') && localOrder) {
        return {
            orderId: localOrder.orderId,
            trackingNumber: localOrder.trackingNumber || localOrder.orderId,
            packageName: localOrder.packageName,
            quantity: localOrder.quantity || 1,
            totalPrice: localOrder.totalPrice || localOrder.price || 0,
            shippingFee: localOrder.shippingFee || 0,
            status: localOrder.status || 'pending',
            createdAt: localOrder.timestamp,
            updatedAt: localOrder.timestamp,
            isLocal: true
        };
    }

    try {
        const response = await fetch(`${API_URL}/track-order/${encodeURIComponent(normalizedLookup)}`);

        if (response.ok) {
            const result = await response.json();
            latestOrderId = result?.orderId ? String(result.orderId) : latestOrderId;
            latestTrackingNumber = result?.trackingNumber ? String(result.trackingNumber) : latestTrackingNumber;
            latestOrderStatus = String(result?.status || latestOrderStatus || 'pending').toLowerCase();
            return result;
        }

        if (localOrder) {
            return {
                orderId: localOrder.orderId,
                trackingNumber: localOrder.trackingNumber || localOrder.orderId,
                packageName: localOrder.packageName,
                quantity: localOrder.quantity || 1,
                totalPrice: localOrder.totalPrice || localOrder.price || 0,
                shippingFee: localOrder.shippingFee || 0,
                status: localOrder.status || 'pending',
                createdAt: localOrder.timestamp,
                updatedAt: localOrder.timestamp,
                isLocal: true
            };
        }

        if (response.status === 404) {
            return { error: 'not_found' };
        }

        return { error: 'server_error' };
    } catch (error) {
        if (localOrder) {
            return {
                orderId: localOrder.orderId,
                trackingNumber: localOrder.trackingNumber || localOrder.orderId,
                packageName: localOrder.packageName,
                quantity: localOrder.quantity || 1,
                totalPrice: localOrder.totalPrice || localOrder.price || 0,
                shippingFee: localOrder.shippingFee || 0,
                status: localOrder.status || 'pending',
                createdAt: localOrder.timestamp,
                updatedAt: localOrder.timestamp,
                isLocal: true
            };
        }

        return { error: 'network_error' };
    }
}

async function generateTrackingSupportReply(lowerText, rawMessage) {
    if (!isTrackingIntent(lowerText)) {
        return null;
    }

    let lookup = extractTrackingLookupFromText(rawMessage);
    if (!lookup && hasKeyword(lowerText, ['my', 'current', 'latest', 'pending', 'order'])) {
        lookup = getLatestKnownOrderLookup();
    }

    if (!lookup) {
        return 'I can track your pending order right now.\nPlease send your Tracking Number (example: CYN-20260419-000123) or Order ID (example: 123).';
    }

    const trackedOrder = await getTrackedOrderFromLookup(lookup);
    if (trackedOrder?.error === 'not_found') {
        return `I could not find an order for "${lookup}". Please verify your Tracking Number or Order ID and try again.`;
    }

    if (trackedOrder?.error) {
        return 'I cannot check your order status right now due to a connection issue. Please try again in a few moments.';
    }

    const trackingNumberText = trackedOrder.trackingNumber || '--';
    const orderIdText = trackedOrder.orderId || '--';
    const statusText = String(trackedOrder.status || 'pending').toUpperCase();
    const quantityText = String(trackedOrder.quantity || 1);
    const totalText = formatMoney(trackedOrder.totalPrice || trackedOrder.price || 0);
    const submittedText = formatTrackDate(trackedOrder.createdAt || trackedOrder.timestamp);
    const updatedText = formatTrackDate(trackedOrder.updatedAt || trackedOrder.timestamp);

    return `Order Tracking Update:\nTracking Number: ${trackingNumberText}\nOrder ID: ${orderIdText}\nStatus: ${statusText}\nPackage: ${trackedOrder.packageName || '--'}\nQuantity: ${quantityText}\nTotal Paid: PHP ${totalText}\nDate Submitted: ${submittedText}\nLast Updated: ${updatedText}\n\n${getStatusNoteForOrder(trackedOrder)}`;
}

function initSupportChat() {
    const chatToggle = document.getElementById('supportChatToggle');
    const chatPanel = document.getElementById('supportChatPanel');
    const chatClose = document.getElementById('supportChatClose');
    const chatMessages = document.getElementById('supportMessages');
    const chatInput = document.getElementById('supportInput');
    const chatSend = document.getElementById('supportSendBtn');
    const quickButtons = document.querySelectorAll('.support-quick-btn');

    if (!chatToggle || !chatPanel || !chatMessages || !chatInput || !chatSend) {
        return;
    }

    supportClientId = getOrCreateSupportClientId();
    setSupportUnreadBadge(0);

    ensureSupportSession()
        .then(() => {
            if (chatMessages.children.length === 0) {
                addSupportMessage(
                    'bot',
                    'Hello! I am your PisoWiFi AI support bot.\nI can help with package pricing, preorder steps, shipping details, installation tips, and speed concerns.\n\nType "I need live customer support" anytime to connect with admin.',
                    'welcome-bot'
                );
            }
            fetchSupportMessages({ markRead: false });
            startSupportPolling();
        })
        .catch((error) => {
            console.warn('Support session initialization failed:', error.message);
        });

    const openChat = () => {
        chatPanel.classList.add('open');
        chatToggle.classList.add('active');
        setSupportUnreadBadge(0);
        fetchSupportMessages({ markRead: true });
        chatInput.focus();
    };

    const closeChat = () => {
        chatPanel.classList.remove('open');
        chatToggle.classList.remove('active');
    };

    const sendUserMessage = async () => {
        const message = chatInput.value.trim();
        if (!message) {
            return;
        }

        chatInput.value = '';

        try {
            const userMessage = await sendSupportMessageToServer('client', message);
            if (userMessage) {
                supportLastMessageId = Math.max(supportLastMessageId, Number(userMessage.id || 0));
                addSupportMessage('user', message, userMessage.id);
            } else {
                addSupportMessage('user', message);
            }
        } catch (error) {
            addSupportMessage('user', message);
            addSupportMessage('status', 'Message saved locally. Support server is temporarily unreachable.');
            return;
        }

        if (isLiveSupportRequest(message) && supportChatStatus !== 'live') {
            try {
                await requestLiveSupport();
                addSupportMessage('status', 'Live support requested. Admin has been notified and can now reply here.');
            } catch (error) {
                addSupportMessage('status', 'Unable to request live support right now. Please try again in a moment.');
            }
            return;
        }

        const normalizedMessage = message.toLowerCase();
        const messageIsTrackingIntent = isTrackingIntent(normalizedMessage);

        if (supportChatStatus === 'live' && !messageIsTrackingIntent) {
            addSupportMessage('status', 'Your message has been forwarded to live support. Please wait for admin reply.');
            return;
        }

        showSupportTyping();
        setTimeout(async () => {
            const aiReply = await generateSupportReply(message);
            removeSupportTyping();

            try {
                const aiMessage = await sendSupportMessageToServer('ai', aiReply);
                if (aiMessage) {
                    supportLastMessageId = Math.max(supportLastMessageId, Number(aiMessage.id || 0));
                    addSupportMessage('bot', aiReply, aiMessage.id);
                } else {
                    addSupportMessage('bot', aiReply);
                }
            } catch (error) {
                addSupportMessage('bot', aiReply);
            }
        }, 450);
    };

    chatToggle.addEventListener('click', () => {
        if (chatPanel.classList.contains('open')) {
            closeChat();
        } else {
            openChat();
        }
    });

    chatClose.addEventListener('click', closeChat);
    chatSend.addEventListener('click', () => {
        sendUserMessage();
    });

    chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendUserMessage();
        }
    });

    quickButtons.forEach((button) => {
        button.addEventListener('click', () => {
            chatInput.value = button.dataset.query || '';
            sendUserMessage();
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && chatPanel.classList.contains('open')) {
            closeChat();
        }
    });
}

function addSupportMessage(type, text, messageId = null) {
    const chatMessages = document.getElementById('supportMessages');
    if (!chatMessages) {
        return;
    }

    const normalizedId = messageId ? String(messageId) : '';
    if (normalizedId && renderedSupportMessageIds.has(normalizedId)) {
        return;
    }

    if (normalizedId) {
        renderedSupportMessageIds.add(normalizedId);
    }

    const messageEl = document.createElement('div');
    messageEl.className = `support-message ${type}`;
    messageEl.textContent = text;
    if (normalizedId) {
        messageEl.dataset.messageId = normalizedId;
    }

    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showSupportTyping() {
    const chatMessages = document.getElementById('supportMessages');
    if (!chatMessages || document.getElementById('supportTyping')) {
        return;
    }

    const typingEl = document.createElement('div');
    typingEl.id = 'supportTyping';
    typingEl.className = 'support-typing';
    typingEl.textContent = 'AI Support is typing...';
    chatMessages.appendChild(typingEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeSupportTyping() {
    const typingEl = document.getElementById('supportTyping');
    if (typingEl) {
        typingEl.remove();
    }
}

function hasKeyword(text, keywords) {
    return keywords.some((keyword) => text.includes(keyword));
}

async function generateSupportReply(userMessage) {
    const text = userMessage.toLowerCase();

    const trackingReply = await generateTrackingSupportReply(text, userMessage);
    if (trackingReply) {
        return trackingReply;
    }

    if (hasKeyword(text, ['hello', 'hi', 'hey', 'good day'])) {
        return 'Hi! Welcome to CYNETWORK PisoWiFi support.\nAsk me anything about package pricing, preorder, setup, or troubleshooting.';
    }

    if (hasKeyword(text, ['price', 'prices', 'cost', 'package', 'plan', 'magkano'])) {
        return `Here are our current package prices (per piece):\n\n1) Starter - PHP ${formatMoney(packages[1].price)} (${packages[1].duration})\n2) Professional - PHP ${formatMoney(packages[2].price)} (${packages[2].duration})\n3) AMAZON LEO - PHP ${formatMoney(packages[3].price)} (${packages[3].duration})\n\nShipping fee is FREE (PHP 0), and preorder total is computed automatically based on quantity.\nTell me your target number of users and I can suggest the best package.`;
    }

    if (hasKeyword(text, ['gcash', 'pay', 'payment', 'bayad', 'qr'])) {
        return 'Payment steps:\n1) Click PREORDER on your selected package\n2) Scan the QR code using GCash\n3) Upload proof of payment screenshot\n4) Fill in your personal info and WiFi settings\n5) Complete activation\n\nIf payment is successful but not reflected, ask for live support.';
    }

    if (hasKeyword(text, ['proof', 'screenshot', 'receipt', 'resibo'])) {
        return 'Please upload a clear screenshot of successful GCash payment showing amount, reference, and date/time.\n\nAccepted format: image file (PNG or JPG) with readable details.';
    }

    if (hasKeyword(text, ['activation', 'activate', 'install', 'installation', 'setup', 'gaano katagal'])) {
        return 'Typical flow:\n- Preorder form submission: a few minutes\n- Order review and shipping update: depends on queue and location\n\nFor urgent follow-up, type: I need live customer support.';
    }

    if (hasKeyword(text, ['wifi', 'ssid', 'password', 'voucher', 'portal'])) {
        return 'On checkout, set your WiFi Name (SSID), Password, and preferred rate limit.\n\nTip: Use a strong password and avoid special characters unsupported by your router.';
    }

    if (hasKeyword(text, ['slow', 'lag', 'mabagal', 'buffer', 'speed', 'internet'])) {
        return 'Troubleshooting tips for slow PisoWiFi:\n1) Reboot modem/router and PisoWiFi unit\n2) Check number of active users vs package capacity\n3) Place router in open area for better signal\n4) Set proper user speed limits\n\nIf issue continues, type: I need live customer support.';
    }

    if (hasKeyword(text, ['refund', 'cancel', 'cancellation'])) {
        return 'For cancellation or refund concerns, request live support so admin can review your preorder status in real-time.';
    }

    if (hasKeyword(text, ['contact', 'agent', 'human', 'support', 'facebook'])) {
        return 'You can still contact us directly:\nPhone: 0950-533-9963\nEmail: cyrhielmaot@gmail.com\nFacebook: https://www.facebook.com/profile.php?id=61584774638218\n\nOr type: I need live customer support.';
    }

    return 'I can help with package pricing, payment steps, proof upload, WiFi setup, activation, and speed troubleshooting.\n\nTo chat with admin directly, type: I need live customer support.';
}

// Close picture modal when clicking outside
document.addEventListener('DOMContentLoaded', function() {
    initPackageImagesFromServer();
    applySavedCustomerDetailsToForm();
    initClientAccountFeatures();

    const modal = document.getElementById('pictureModal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closePictureModal();
            }
        });
    }

    initSupportChat();
});
