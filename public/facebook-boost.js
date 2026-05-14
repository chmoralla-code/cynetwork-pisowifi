const API_URL = '/api';
const CLIENT_AUTH_STORAGE_KEY = 'cynetworkClientAuth';
const PRICE_PER_1K = 100;
const MIN_FOLLOWERS = 0;
const MAX_FOLLOWERS = 1000000;
const MAX_PROOF_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const BOOST_SERVICE_OPTIONS = {
    followers: {
        label: 'Followers',
        labelLower: 'followers',
        unitLabel: 'follower',
        unitLabelPlural: 'followers'
    },
    views: {
        label: 'Views',
        labelLower: 'views',
        unitLabel: 'view',
        unitLabelPlural: 'views'
    },
    reactions: {
        label: 'Reactions',
        labelLower: 'reactions',
        unitLabel: 'reaction',
        unitLabelPlural: 'reactions'
    }
};

let uploadedProofImage = null;

function formatMoney(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
        return '0';
    }
    return numeric.toLocaleString('en-PH');
}

function normalizeFollowers(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return MIN_FOLLOWERS;
    }

    const clamped = Math.min(MAX_FOLLOWERS, Math.max(MIN_FOLLOWERS, parsed));
    return clamped;
}

function normalizeServiceType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (BOOST_SERVICE_OPTIONS[normalized]) {
        return normalized;
    }
    return 'followers';
}

function getSelectedService() {
    const serviceTypeInput = document.getElementById('serviceTypeInput');
    const normalized = normalizeServiceType(serviceTypeInput?.value);
    if (serviceTypeInput) {
        serviceTypeInput.value = normalized;
    }
    return BOOST_SERVICE_OPTIONS[normalized];
}

function normalizeContactNumber(value) {
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

    if (digits.length === 13 && digits.startsWith('63')) {
        return `+${digits}`;
    }

    return '';
}

function getClientSession() {
    try {
        const raw = localStorage.getItem(CLIENT_AUTH_STORAGE_KEY);
        if (!raw) {
            return { token: null, account: null };
        }

        const parsed = JSON.parse(raw);
        return {
            token: parsed?.token || null,
            account: parsed?.account || null
        };
    } catch (error) {
        return { token: null, account: null };
    }
}

function updatePricePanel() {
    const followersInput = document.getElementById('followersInput');
    const followersText = document.getElementById('followersText');
    const unitBlockText = document.getElementById('unitBlockText');
    const totalPriceText = document.getElementById('totalPriceText');
    const desiredAmountLabel = document.getElementById('desiredAmountLabel');
    const desiredAmountHelp = document.getElementById('desiredAmountHelp');
    const pageLinkHelp = document.getElementById('pageLinkHelp');
    const serviceTotalLabel = document.getElementById('serviceTotalLabel');

    const followers = normalizeFollowers(followersInput?.value || MIN_FOLLOWERS);
    const selectedService = getSelectedService();
    const quantityBlocks = followers / 1000;
    const total = Math.ceil(quantityBlocks * PRICE_PER_1K);

    if (followersInput) {
        followersInput.value = String(followers);
    }
    if (followersText) {
        followersText.textContent = formatMoney(followers);
    }
    if (unitBlockText) {
        unitBlockText.textContent = `${formatMoney(followers)} ${selectedService.unitLabelPlural} custom`;
    }
    if (totalPriceText) {
        totalPriceText.textContent = formatMoney(total);
    }
    if (desiredAmountLabel) {
        desiredAmountLabel.textContent = `Desired ${selectedService.label} *`;
    }
    if (desiredAmountHelp) {
        desiredAmountHelp.textContent = `Enter any amount from 0 to 1,000,000 ${selectedService.unitLabelPlural}.`;
    }
    if (pageLinkHelp) {
        pageLinkHelp.textContent = `Paste the exact link where ${selectedService.labelLower} will be boosted.`;
    }
    if (serviceTotalLabel) {
        serviceTotalLabel.textContent = `${selectedService.label} Total:`;
    }
}

function showStep(stepNum) {
    const stepIds = ['step1Card', 'step2Card', 'step3Card', 'step4Card'];
    stepIds.forEach((id, index) => {
        const section = document.getElementById(id);
        if (!section) {
            return;
        }

        section.classList.toggle('hidden', index + 1 !== stepNum);
    });
}

function showAuthNotice() {
    const notice = document.getElementById('authNotice');
    if (!notice) {
        return;
    }

    const { account, token } = getClientSession();
    if (account && token) {
        const label = account.fullName || account.email || 'Client Account';
        notice.textContent = `Logged in as ${label}. Ready to submit your boost transaction.`;
    } else {
        notice.textContent = 'Login required before checkout: open the main website account modal first.';
    }
}

function handleProofUpload(event) {
    const file = event.target?.files?.[0];
    const preview = document.getElementById('proofPreview');
    const proofStatus = document.getElementById('proofStatus');

    if (!file || !file.type.startsWith('image/')) {
        uploadedProofImage = null;
        if (preview) {
            preview.innerHTML = '';
        }
        if (proofStatus) {
            proofStatus.textContent = 'No file selected yet.';
            proofStatus.classList.remove('ready');
        }
        alert('Please select a valid image file for proof of payment.');
        return;
    }

    if (file.size > MAX_PROOF_FILE_SIZE_BYTES) {
        uploadedProofImage = null;
        if (preview) {
            preview.innerHTML = '';
        }
        if (proofStatus) {
            proofStatus.textContent = 'File is too large. Please upload an image up to 10MB only.';
            proofStatus.classList.remove('ready');
        }
        alert('Proof image must be 10MB or below.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
        uploadedProofImage = loadEvent.target?.result || null;
        if (preview && uploadedProofImage) {
            preview.innerHTML = `<img src="${uploadedProofImage}" alt="Proof of payment preview">`;
        }
        if (proofStatus) {
            proofStatus.textContent = `Uploaded: ${file.name}`;
            proofStatus.classList.add('ready');
        }
    };
    reader.readAsDataURL(file);
}

function goToStep2() {
    const pageLinkInput = document.getElementById('pageLinkInput');
    const followersInput = document.getElementById('followersInput');
    const serviceTypeInput = document.getElementById('serviceTypeInput');
    const { account, token } = getClientSession();

    if (!account || !token) {
        alert('Please login on the main page first, then return here to continue checkout.');
        return;
    }

    const linkValue = pageLinkInput?.value?.trim() || '';
    const followers = normalizeFollowers(followersInput?.value || MIN_FOLLOWERS);
    const selectedService = normalizeServiceType(serviceTypeInput?.value);

    if (!linkValue) {
        alert('Please enter your Facebook page/profile link.');
        return;
    }

    if (!/^https?:\/\//i.test(linkValue)) {
        alert('Please enter a valid link that starts with http:// or https://');
        return;
    }

    followersInput.value = String(followers);
    if (serviceTypeInput) {
        serviceTypeInput.value = selectedService;
    }
    updatePricePanel();
    showStep(2);
}

function goToStep3() {
    if (!uploadedProofImage) {
        alert('Please upload proof of payment first.');
        return;
    }

    showStep(3);
}

async function submitFacebookBoostTransaction() {
    const { account, token } = getClientSession();
    if (!account || !token) {
        alert('Please login on the main page before submitting transaction.');
        return;
    }

    const followers = normalizeFollowers(document.getElementById('followersInput')?.value || MIN_FOLLOWERS);
    const quantityBlocks = followers / 1000;
    const total = Math.ceil(quantityBlocks * PRICE_PER_1K);
    const serviceType = normalizeServiceType(document.getElementById('serviceTypeInput')?.value);
    const selectedService = BOOST_SERVICE_OPTIONS[serviceType];
    const pageLink = document.getElementById('pageLinkInput')?.value?.trim() || '';
    const fullName = document.getElementById('fullNameInput')?.value?.trim() || '';
    const contactRaw = document.getElementById('contactInput')?.value?.trim() || '';
    const notes = document.getElementById('notesInput')?.value?.trim() || '';

    if (!pageLink || !fullName || !contactRaw) {
        alert('Please fill all required fields.');
        return;
    }

    const normalizedContact = normalizeContactNumber(contactRaw);
    if (!normalizedContact) {
        alert('Please enter a valid Philippine contact number.');
        return;
    }

    if (!uploadedProofImage) {
        alert('Please upload proof of payment first.');
        return;
    }

    const transactionData = {
        packageId: 6,
        packageName: `FACEBOOK BOOST - ${selectedService.label.toUpperCase()} - ${formatMoney(followers)}`,
        price: total,
        unitPrice: total,
        totalPrice: total,
        shippingFee: 0,
        quantity: 1,
        duration: `${formatMoney(followers)} ${selectedService.label} Boost`,
        fullName,
        contactNumber: normalizedContact,
        address: 'N/A - DIGITAL SERVICE',
        wifiName: pageLink,
        wifiPassword: 'N/A',
        wifiRate: notes
            ? `${selectedService.label}: ${formatMoney(followers)} ${selectedService.unitLabelPlural} | ${notes}`
            : `${selectedService.label}: ${formatMoney(followers)} ${selectedService.unitLabelPlural}`,
        proofImage: uploadedProofImage
    };

    let orderId = null;
    let trackingNumber = null;
    let status = 'pending';

    try {
        const response = await fetch(`${API_URL}/submit-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(transactionData)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'Unable to submit transaction.');
        }

        const result = await response.json();
        orderId = result?.orderId ? String(result.orderId) : null;
        trackingNumber = result?.trackingNumber ? String(result.trackingNumber) : null;
        status = String(result?.status || 'pending').toUpperCase();
    } catch (error) {
        alert('Transaction was not submitted. Please try again.');
        console.warn('Facebook Boost transaction error:', error.message);
        return;
    }

    try {
        const transactions = JSON.parse(localStorage.getItem('cynetworkTransactions') || '[]');
        transactions.push({
            ...transactionData,
            orderId,
            trackingNumber,
            status,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('cynetworkTransactions', JSON.stringify(transactions));
    } catch (error) {
        console.warn('Unable to save local transaction copy:', error.message);
    }

    document.getElementById('confirmOrderId').textContent = orderId || '--';
    document.getElementById('confirmTracking').textContent = trackingNumber || '--';
    document.getElementById('confirmStatus').textContent = status;
    document.getElementById('confirmFollowers').textContent = formatMoney(followers);
    document.getElementById('confirmServiceType').textContent = selectedService.label;
    document.getElementById('confirmTotal').textContent = formatMoney(total);

    showStep(4);
}

function bindEvents() {
    const followersInput = document.getElementById('followersInput');
    const serviceTypeInput = document.getElementById('serviceTypeInput');
    const toStep2Btn = document.getElementById('toStep2Btn');
    const toStep3Btn = document.getElementById('toStep3Btn');
    const submitBoostBtn = document.getElementById('submitBoostBtn');
    const backToStep1Btn = document.getElementById('backToStep1Btn');
    const backToStep2Btn = document.getElementById('backToStep2Btn');
    const proofInput = document.getElementById('proofInput');

    if (followersInput) {
        followersInput.addEventListener('input', updatePricePanel);
        followersInput.addEventListener('blur', updatePricePanel);
    }

    if (serviceTypeInput) {
        serviceTypeInput.addEventListener('change', updatePricePanel);
    }

    if (proofInput) {
        proofInput.addEventListener('change', handleProofUpload);
    }

    if (toStep2Btn) {
        toStep2Btn.addEventListener('click', goToStep2);
    }

    if (backToStep1Btn) {
        backToStep1Btn.addEventListener('click', () => showStep(1));
    }

    if (toStep3Btn) {
        toStep3Btn.addEventListener('click', goToStep3);
    }

    if (backToStep2Btn) {
        backToStep2Btn.addEventListener('click', () => showStep(2));
    }

    if (submitBoostBtn) {
        submitBoostBtn.addEventListener('click', submitFacebookBoostTransaction);
    }
}

function setupReferralExplainButtons() {
    const generalBtn = document.getElementById('toggleGeneralReferralBtn');
    const fbBtn = document.getElementById('toggleFbReferralBtn');
    const generalPanel = document.getElementById('generalReferralPanel');
    const fbPanel = document.getElementById('fbReferralPanel');

    function togglePanel(targetPanel, targetBtn) {
        const shouldOpen = targetPanel.classList.contains('hidden');

        if (generalPanel) {
            generalPanel.classList.add('hidden');
        }
        if (fbPanel) {
            fbPanel.classList.add('hidden');
        }
        if (generalBtn) {
            generalBtn.setAttribute('aria-expanded', 'false');
        }
        if (fbBtn) {
            fbBtn.setAttribute('aria-expanded', 'false');
        }

        if (shouldOpen && targetPanel && targetBtn) {
            targetPanel.classList.remove('hidden');
            targetBtn.setAttribute('aria-expanded', 'true');
        }
    }

    if (generalBtn && generalPanel) {
        generalBtn.addEventListener('click', () => togglePanel(generalPanel, generalBtn));
    }

    if (fbBtn && fbPanel) {
        fbBtn.addEventListener('click', () => togglePanel(fbPanel, fbBtn));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updatePricePanel();
    showAuthNotice();
    showStep(1);
    bindEvents();
    setupReferralExplainButtons();
});
