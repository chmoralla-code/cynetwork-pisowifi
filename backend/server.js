// =====================================================
// CYNETWORK PISOWIFI - ADMIN BACKEND SERVER
// =====================================================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const { MongoClient } = require('mongodb');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { Resolver } = require('dns').promises;

loadEnvironmentFromFile(path.join(__dirname, '.env'));

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
const jwtSecretFromEnv = String(process.env.JWT_SECRET || '').trim();
if (isProduction && !jwtSecretFromEnv) {
    throw new Error('JWT_SECRET environment variable is required in production.');
}
const SECRET_KEY = jwtSecretFromEnv || 'cynetwork-pisowifi-secret-2026';
const persistentDataDir = '/var/data';
const adminPublicDir = path.join(__dirname, 'public');
const clientPublicDir = path.join(__dirname, '..', 'website');
const configuredDatabasePath = String(process.env.DATABASE_PATH || '').trim();
const configuredUploadsDir = String(process.env.UPLOADS_DIR || '').trim();
const accountBackupMongoUri = String(process.env.ACCOUNT_BACKUP_MONGODB_URI || '').trim();
const accountBackupMongoDbName = String(process.env.ACCOUNT_BACKUP_MONGODB_DB || 'cynetwork_pisowifi').trim();
const accountBackupMongoCollectionName = String(
    process.env.ACCOUNT_BACKUP_MONGODB_COLLECTION || 'client_account_backups'
).trim();
const accountBackupMongoSrvFallbackEnabled = parseBooleanFlag(process.env.ACCOUNT_BACKUP_MONGODB_SRV_FALLBACK, true);
const accountBackupMongoDnsServers = String(process.env.ACCOUNT_BACKUP_MONGODB_DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
const dbPath = configuredDatabasePath
    ? path.resolve(configuredDatabasePath)
    : (isProduction
        ? path.join(persistentDataDir, 'pisowifi-admin.db')
        : path.join(__dirname, 'pisowifi-admin.db'));
const uploadedPackageImagesDir = configuredUploadsDir
    ? path.resolve(configuredUploadsDir)
    : (isProduction
        ? path.join(persistentDataDir, 'package-images')
        : path.join(adminPublicDir, 'package-images'));

if (isProduction && !configuredDatabasePath) {
    console.warn(`DATABASE_PATH not set; using production default: ${dbPath}`);
}
if (isProduction && !configuredUploadsDir) {
    console.warn(`UPLOADS_DIR not set; using production default: ${uploadedPackageImagesDir}`);
}

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabaseKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;
if (isProduction && !supabase) {
    console.warn('SUPABASE_URL and SUPABASE_ANON_KEY are not both set; supabase-js client is disabled.');
}

const postgresConnectionString = String(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();
if (isProduction && !postgresConnectionString) {
    throw new Error('SUPABASE_DB_URL (or DATABASE_URL) is required in production.');
}

const pgClient = postgresConnectionString
    ? new Client({
        connectionString: postgresConnectionString,
        ssl: isProduction ? { rejectUnauthorized: false } : undefined
    })
    : null;

let accountBackupMongoClient = null;
let accountBackupCollection = null;
let accountBackupSyncInProgress = false;
let accountBackupSyncQueued = false;
let accountBackupSyncTimer = null;
let accountBackupHydratedFromRemote = false;
let accountBackupLastSyncedAt = null;
let accountBackupLastSyncError = '';
let accountBackupLastSyncReason = '';
let accountBackupConnectionMode = accountBackupMongoUri ? 'pending' : 'disabled';
let resolveStartupReady = null;
const startupReady = new Promise((resolve) => {
    resolveStartupReady = resolve;
});
const startupGateTimeoutMs = Number.parseInt(process.env.STARTUP_READY_TIMEOUT_MS || '15000', 10);
let startupGateTimer = null;

function releaseStartupGate(reason = 'ready') {
    if (typeof resolveStartupReady !== 'function') {
        return;
    }

    console.log(`Startup gate released (${reason}).`);
    resolveStartupReady();
    resolveStartupReady = null;
}

if (Number.isFinite(startupGateTimeoutMs) && startupGateTimeoutMs > 0) {
    startupGateTimer = setTimeout(() => {
        releaseStartupGate(`timeout after ${startupGateTimeoutMs}ms`);
    }, startupGateTimeoutMs);
}

const defaultPackageImages = {
    1: 'assets/images/package1.png',
    2: 'assets/images/package2.png',
    3: 'assets/images/package3.png'
};
const CHAT_SESSION_STATUSES = ['ai', 'live', 'closed'];
const REFERRAL_REWARD_PHP = 100;
const REFERRAL_REDEEM_DEDUCTION_RATE = 0.10;
const REFERRAL_REDEEM_DEDUCTION_PERCENT = Math.round(REFERRAL_REDEEM_DEDUCTION_RATE * 100);
const REFERRAL_REDEEM_DEFAULT_DEDUCTION_PHP = 0;
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const DEFAULT_ADMIN_PASSWORD_HASH = '$2b$10$fu/rvl3xWreWyoqF8W4SJ.uII5QybC0N9wPaj353ifmiPwbc2AUzS';
const LEGACY_DEFAULT_ADMIN_PASSWORD_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
const PACKAGE_CATALOG = {
    1: { name: 'Starter', unitPrice: 5800, duration: '1 Year License | 50 Meters' },
    2: { name: 'Professional', unitPrice: 8500, duration: '3 Years License | 100 Meters' },
    3: { name: 'Enterprise', unitPrice: 11000, duration: 'LIFETIME LICENSE | 250 Meters' },
    4: { name: 'AMAZON LEO', unitPrice: 0, duration: 'OFFICIAL PRICE TO BE ANNOUNCED' },
    5: { name: 'ADDING EAP', unitPrice: 350, duration: 'ADD TPLINK PRODUCT' }
};
const AMAZON_LEO_PACKAGE_ID = 4;
const AMAZON_LEO_SMS_PROVIDER = String(process.env.AMAZON_LEO_SMS_PROVIDER || 'semaphore').trim().toLowerCase();
const SEMAPHORE_SMS_API_KEY = String(process.env.SEMAPHORE_API_KEY || '').trim();
const SEMAPHORE_SMS_SENDER_NAME = String(process.env.SEMAPHORE_SENDER_NAME || 'CYNETWORK').trim();
const AMAZON_LEO_SMS_TEMPLATE = String(
    process.env.AMAZON_LEO_SMS_TEMPLATE
    || 'CYNETWORK: Hi {name}, confirmed na ang Amazon LEO preorder mo. Order ID: {orderId}, Tracking: {trackingNumber}. Official price will be declared once Amazon officially releases the product. Reservation mo ay naka-line na.'
).trim();

function createReferralCode() {
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `CYN${randomPart}`;
}

function normalizePositiveInt(value, fallback = 1, min = 1, max = 999) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

function normalizePriceInt(value, fallback = 0) {
    const numeric = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, Math.round(numeric));
}

function normalizeWifiRateForStorage(value, packageId = 0) {
    const raw = String(value || '').trim();

    // ADDING EAP flow stores credential-like text in wifi_rate field.
    if (Number(packageId) === 5) {
        return raw || 'N/A';
    }

    if (!raw || /^n\/a$/i.test(raw)) {
        return 'N/A';
    }

    const numeric = Number(raw.replace(/mbps/ig, '').trim());
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return raw;
    }

    const rounded = Math.round(numeric * 100) / 100;
    const normalized = Number.isInteger(rounded)
        ? String(rounded)
        : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

    return `${normalized} Mbps`;
}

function toMoneyText(value) {
    return String(normalizePriceInt(value, 0));
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

function normalizeTrackingNumber(value) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) {
        return '';
    }
    return normalized.slice(0, 80);
}

function issueClientToken(accountId, email) {
    return jwt.sign(
        {
            type: 'client',
            id: Number(accountId),
            email: String(email || '').toLowerCase()
        },
        SECRET_KEY,
        { expiresIn: '30d' }
    );
}

function getOptionalClientAuth(req) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return null;
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded?.type === 'client' && decoded?.id) {
            return decoded;
        }
        return null;
    } catch (error) {
        return null;
    }
}

function generateUniqueReferralCode(callback, attempt = 0) {
    if (attempt > 10) {
        callback(new Error('Unable to generate unique referral code'));
        return;
    }

    const code = createReferralCode();
    db.get(
        'SELECT id FROM client_accounts WHERE referral_code = ?',
        [code],
        (err, row) => {
            if (err) {
                callback(err);
                return;
            }

            if (row) {
                generateUniqueReferralCode(callback, attempt + 1);
                return;
            }

            callback(null, code);
        }
    );
}

function applyReferralRewardForOrder(referredAccountId, orderId, callback) {
    const safeAccountId = Number(referredAccountId || 0);
    if (!safeAccountId) {
        callback(null, { rewardApplied: false, rewardAmount: 0 });
        return;
    }

    db.get(
        `SELECT id, referral_code, referred_by_code
         FROM client_accounts WHERE id = ?`,
        [safeAccountId],
        (accountErr, referredAccount) => {
            if (accountErr) {
                callback(accountErr);
                return;
            }

            if (!referredAccount?.referred_by_code) {
                callback(null, { rewardApplied: false, rewardAmount: 0 });
                return;
            }

            const referredByCode = String(referredAccount.referred_by_code).trim().toUpperCase();
            db.get(
                `SELECT id, referral_code
                 FROM client_accounts
                 WHERE referral_code = ?`,
                [referredByCode],
                (referrerErr, referrer) => {
                    if (referrerErr) {
                        callback(referrerErr);
                        return;
                    }

                    if (!referrer || Number(referrer.id) === safeAccountId) {
                        callback(null, { rewardApplied: false, rewardAmount: 0 });
                        return;
                    }

                    db.get(
                        'SELECT id FROM referral_rewards WHERE referred_account_id = ?',
                        [safeAccountId],
                        (existingErr, existingReward) => {
                            if (existingErr) {
                                callback(existingErr);
                                return;
                            }

                            if (existingReward) {
                                callback(null, { rewardApplied: false, rewardAmount: 0 });
                                return;
                            }

                            db.run(
                                `INSERT INTO referral_rewards (
                                    referrer_account_id,
                                    referred_account_id,
                                    first_order_id,
                                    reward_amount
                                ) VALUES (?, ?, ?, ?)`,
                                [referrer.id, safeAccountId, orderId, REFERRAL_REWARD_PHP],
                                (insertRewardErr) => {
                                    if (insertRewardErr) {
                                        callback(insertRewardErr);
                                        return;
                                    }

                                    db.run(
                                        `UPDATE client_accounts
                                         SET referral_balance = COALESCE(referral_balance, 0) + ?,
                                             referral_reward_count = COALESCE(referral_reward_count, 0) + 1,
                                             updated_at = CURRENT_TIMESTAMP
                                         WHERE id = ?`,
                                        [REFERRAL_REWARD_PHP, referrer.id],
                                        (creditErr) => {
                                            if (creditErr) {
                                                callback(creditErr);
                                                return;
                                            }

                                            queueClientAccountBackup('referral-reward');
                                            callback(null, {
                                                rewardApplied: true,
                                                rewardAmount: REFERRAL_REWARD_PHP,
                                                referrerCode: referrer.referral_code
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
}

function ensureUploadedPackageImagesDir() {
    if (!fs.existsSync(uploadedPackageImagesDir)) {
        fs.mkdirSync(uploadedPackageImagesDir, { recursive: true });
    }
}

function getUploadedPackageImagePath(packageId) {
    if (!fs.existsSync(uploadedPackageImagesDir)) {
        return null;
    }

    const matchedFile = fs
        .readdirSync(uploadedPackageImagesDir)
        .find((fileName) => fileName.startsWith(`package${packageId}.`));

    return matchedFile ? path.join(uploadedPackageImagesDir, matchedFile) : null;
}

function buildTrackingNumber(orderId, createdAt = new Date()) {
    const dateObj = new Date(createdAt);
    const safeDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
    const year = safeDate.getFullYear();
    const month = String(safeDate.getMonth() + 1).padStart(2, '0');
    const day = String(safeDate.getDate()).padStart(2, '0');
    const paddedOrderId = String(orderId).padStart(6, '0');
    return `CYN-${year}${month}${day}-${paddedOrderId}`;
}

function toChatSessionPayload(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        clientId: row.client_id,
        orderId: row.order_id,
        trackingNumber: row.tracking_number,
        customerName: row.customer_name,
        customerContact: row.customer_contact,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
        lastMessage: row.last_message,
        lastSender: row.last_sender,
        unreadCount: Number(row.unread_count || 0)
    };
}

function toChatMessagePayload(row) {
    return {
        id: row.id,
        sessionId: row.session_id,
        senderType: row.sender_type,
        message: row.message,
        createdAt: row.created_at,
        readByAdmin: Boolean(row.read_by_admin),
        readByClient: Boolean(row.read_by_client)
    };
}

function toClientAccountPayload(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        fullName: row.full_name,
        contactNumber: row.contact_number,
        email: row.email,
        referralCode: row.referral_code,
        referredByCode: row.referred_by_code,
        referralBalance: Number(row.referral_balance || 0),
        referralRewardCount: Number(row.referral_reward_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        inviteCount: Number(row.invite_count || 0),
        convertedInviteCount: Number(row.converted_invite_count || 0)
    };
}

function toReferralRedemptionPayload(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        clientAccountId: row.client_account_id,
        grossAmount: Number(row.gross_amount || 0),
        vatAmount: Number(row.vat_amount || 0),
        netAmount: Number(row.net_amount || 0),
        gcashName: row.gcash_name,
        gcashNumber: row.gcash_number,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        note: row.note || ''
    };
}

function getOptionalAdminAuth(req) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return null;
    }

    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (error) {
        return null;
    }
}

function parseBooleanFlag(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) {
            return true;
        }
        if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
            return false;
        }
    }

    return fallback;
}

function loadEnvironmentFromFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return;
    }

    let content = '';
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error('Unable to read .env file:', error.message || error);
        return;
    }

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const separatorIndex = line.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
            continue;
        }

        let value = line.slice(separatorIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith('\'') && value.endsWith('\''))
        ) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}

function normalizePhilippineMobileNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) {
        return '';
    }

    if (digits.length === 11 && digits.startsWith('09')) {
        return digits;
    }

    if (digits.length === 12 && digits.startsWith('639')) {
        return `0${digits.slice(2)}`;
    }

    if (digits.length === 10 && digits.startsWith('9')) {
        return `0${digits}`;
    }

    return '';
}

function isAmazonLeoOrder(orderRow) {
    const packageId = Number(orderRow?.package_id || 0);
    const packageName = String(orderRow?.package_name || '').trim().toUpperCase();
    return packageId === AMAZON_LEO_PACKAGE_ID || packageName.includes('AMAZON LEO');
}

function shouldTriggerAmazonLeoSms(status) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    return ['approved', 'delivery', 'completed'].includes(normalizedStatus);
}

function shouldTriggerReferralReward(status) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    return ['approved', 'delivery', 'completed'].includes(normalizedStatus);
}

function buildAmazonLeoApprovalSms(orderRow) {
    const fallbackTracking = `CYN-${String(orderRow?.id || '--')}`;
    const replacements = {
        '{name}': String(orderRow?.full_name || 'Client').trim() || 'Client',
        '{orderId}': String(orderRow?.id || '--'),
        '{trackingNumber}': String(orderRow?.tracking_number || fallbackTracking),
        '{status}': String(orderRow?.status || 'delivery').toUpperCase()
    };

    let text = AMAZON_LEO_SMS_TEMPLATE;
    Object.entries(replacements).forEach(([token, replacement]) => {
        text = text.split(token).join(replacement);
    });

    return text;
}

async function sendSemaphoreSms(number, message) {
    if (!SEMAPHORE_SMS_API_KEY) {
        throw new Error('SEMAPHORE_API_KEY is not configured');
    }

    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is unavailable in this Node runtime');
    }

    const payload = new URLSearchParams();
    payload.set('apikey', SEMAPHORE_SMS_API_KEY);
    payload.set('number', number);
    payload.set('message', message);

    if (SEMAPHORE_SMS_SENDER_NAME) {
        payload.set('sendername', SEMAPHORE_SMS_SENDER_NAME);
    }

    const response = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString()
    });

    const responseText = await response.text();
    if (!response.ok) {
        throw new Error(`Semaphore SMS API error (${response.status}): ${responseText.slice(0, 220)}`);
    }

    let parsedBody = null;
    try {
        parsedBody = JSON.parse(responseText);
    } catch (parseErr) {
        parsedBody = null;
    }

    const primaryResult = Array.isArray(parsedBody) ? parsedBody[0] : parsedBody;
    return {
        providerMessageId: primaryResult?.message_id || primaryResult?.id || null,
        providerStatus: primaryResult?.status || null
    };
}

async function sendPhilippineSms(number, message) {
    if (AMAZON_LEO_SMS_PROVIDER !== 'semaphore') {
        throw new Error(`Unsupported AMAZON_LEO_SMS_PROVIDER "${AMAZON_LEO_SMS_PROVIDER}"`);
    }

    return sendSemaphoreSms(number, message);
}

function maybeSendAmazonLeoApprovalSms(orderId, targetStatus, callback) {
    const normalizedOrderId = normalizePositiveInt(orderId, 0, 1, Number.MAX_SAFE_INTEGER);
    if (!normalizedOrderId) {
        callback(new Error('Invalid order ID for Amazon LEO SMS'));
        return;
    }

    if (!shouldTriggerAmazonLeoSms(targetStatus)) {
        callback(null, { sent: false, skipped: 'status_not_eligible' });
        return;
    }

    if (!parseBooleanFlag(process.env.AMAZON_LEO_SMS_ENABLED, true)) {
        callback(null, { sent: false, skipped: 'sms_disabled' });
        return;
    }

    db.get(
        `SELECT id, package_id, package_name, full_name, contact_number, tracking_number, status, amazon_leo_sms_sent
         FROM orders WHERE id = ?`,
        [normalizedOrderId],
        (loadErr, orderRow) => {
            if (loadErr) {
                callback(loadErr);
                return;
            }

            if (!orderRow) {
                callback(new Error('Order not found for Amazon LEO SMS'));
                return;
            }

            if (!isAmazonLeoOrder(orderRow)) {
                callback(null, { sent: false, skipped: 'not_amazon_leo' });
                return;
            }

            if (Number(orderRow.amazon_leo_sms_sent || 0) === 1) {
                callback(null, { sent: false, skipped: 'already_sent' });
                return;
            }

            const recipient = normalizePhilippineMobileNumber(orderRow.contact_number);
            if (!recipient) {
                const errorMessage = `Invalid Philippine contact number: ${String(orderRow.contact_number || '')}`;
                db.run(
                    `UPDATE orders
                     SET amazon_leo_sms_error = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [errorMessage.slice(0, 350), orderRow.id],
                    () => callback(null, { sent: false, skipped: 'invalid_contact_number', error: errorMessage })
                );
                return;
            }

            const smsText = buildAmazonLeoApprovalSms({
                ...orderRow,
                status: targetStatus
            });

            sendPhilippineSms(recipient, smsText)
                .then((providerResult) => {
                    db.run(
                        `UPDATE orders
                         SET amazon_leo_sms_sent = 1,
                             amazon_leo_sms_sent_at = CURRENT_TIMESTAMP,
                             amazon_leo_sms_error = NULL,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [orderRow.id],
                        (updateErr) => {
                            if (updateErr) {
                                callback(updateErr);
                                return;
                            }

                            callback(null, {
                                sent: true,
                                provider: AMAZON_LEO_SMS_PROVIDER,
                                recipient,
                                ...providerResult
                            });
                        }
                    );
                })
                .catch((sendErr) => {
                    const errorMessage = String(sendErr?.message || sendErr || 'SMS send failed').slice(0, 350);
                    db.run(
                        `UPDATE orders
                         SET amazon_leo_sms_error = ?, updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [errorMessage, orderRow.id],
                        () => callback(null, { sent: false, skipped: 'sms_send_failed', error: errorMessage })
                    );
                });
        }
    );
}

function maybeApplyReferralRewardOnOrderConfirmation(orderId, targetStatus, callback) {
    const normalizedOrderId = normalizePositiveInt(orderId, 0, 1, Number.MAX_SAFE_INTEGER);
    if (!normalizedOrderId) {
        callback(new Error('Invalid order ID for referral reward'));
        return;
    }

    if (!shouldTriggerReferralReward(targetStatus)) {
        callback(null, { rewardApplied: false, rewardAmount: 0, skipped: 'status_not_eligible' });
        return;
    }

    db.get(
        'SELECT id, client_account_id FROM orders WHERE id = ?',
        [normalizedOrderId],
        (loadErr, orderRow) => {
            if (loadErr) {
                callback(loadErr);
                return;
            }

            if (!orderRow) {
                callback(new Error('Order not found for referral reward'));
                return;
            }

            const accountId = Number(orderRow.client_account_id || 0);
            if (!accountId) {
                callback(null, { rewardApplied: false, rewardAmount: 0, skipped: 'no_client_account' });
                return;
            }

            applyReferralRewardForOrder(accountId, orderRow.id, (rewardErr, rewardMeta) => {
                if (rewardErr) {
                    callback(rewardErr);
                    return;
                }

                callback(null, rewardMeta || { rewardApplied: false, rewardAmount: 0 });
            });
        }
    );
}

function toNotificationSettingsPayload(row) {
    return {
        telegramEnabled: Boolean(Number(row?.telegram_enabled || 0)),
        telegramBotToken: String(row?.telegram_bot_token || ''),
        telegramChatId: String(row?.telegram_chat_id || ''),
        intergramEnabled: Boolean(Number(row?.intergram_enabled || 0)),
        intergramWebhookUrl: String(row?.intergram_webhook_url || ''),
        notifyPendingOrders: Boolean(Number(row?.notify_pending_orders ?? 1)),
        notifyAiChats: Boolean(Number(row?.notify_ai_chats ?? 1)),
        updatedAt: row?.updated_at || null
    };
}

function loadNotificationSettings(callback) {
    db.get(
        'SELECT * FROM notification_settings WHERE id = 1',
        (err, row) => {
            if (err) {
                callback(err);
                return;
            }

            if (row) {
                callback(null, row);
                return;
            }

            callback(null, {
                id: 1,
                telegram_enabled: 0,
                telegram_bot_token: '',
                telegram_chat_id: '',
                intergram_enabled: 0,
                intergram_webhook_url: '',
                notify_pending_orders: 1,
                notify_ai_chats: 1,
                updated_at: null
            });
        }
    );
}

function buildNotificationMessage(eventType, payload = {}) {
    const timestamp = new Date().toLocaleString('en-PH');

    if (eventType === 'pending_order') {
        return [
            '[CYNETWORK] New Pending Preorder',
            `Time: ${timestamp}`,
            `Order ID: ${payload.orderId || '--'}`,
            `Tracking: ${payload.trackingNumber || '--'}`,
            `Customer: ${payload.fullName || '--'}`,
            `Contact: ${payload.contactNumber || '--'}`,
            `Package: ${payload.packageName || '--'}`,
            `Quantity: ${payload.quantity || 1}`,
            `Total: PHP ${Number(payload.totalPrice || 0).toLocaleString('en-PH')}`,
            `Status: ${String(payload.status || 'pending').toUpperCase()}`
        ].join('\n');
    }

    if (eventType === 'ai_chat') {
        return [
            '[CYNETWORK] New AI Chat Activity',
            `Time: ${timestamp}`,
            `Session ID: ${payload.sessionId || '--'}`,
            `Client: ${payload.clientId || '--'}`,
            `Customer: ${payload.customerName || '--'}`,
            `Tracking: ${payload.trackingNumber || '--'}`,
            `Status: ${String(payload.status || 'ai').toUpperCase()}`,
            `Message: ${String(payload.message || '').slice(0, 200) || '--'}`
        ].join('\n');
    }

    return [
        '[CYNETWORK] Admin Notification',
        `Time: ${timestamp}`,
        `Type: ${eventType}`,
        `Message: ${String(payload.message || 'System event')}`
    ].join('\n');
}

async function sendTelegramNotification(botToken, chatId, text) {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is unavailable in this Node runtime');
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Telegram API error (${response.status}): ${errorBody.slice(0, 220)}`);
    }

    return response.json();
}

async function sendIntergramNotification(webhookUrl, payload) {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is unavailable in this Node runtime');
    }

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Intergram webhook error (${response.status}): ${errorBody.slice(0, 220)}`);
    }

    return response.text();
}

function dispatchAdminNotification(eventType, payload = {}, options = {}) {
    const force = Boolean(options.force);

    return new Promise((resolve) => {
        loadNotificationSettings(async (settingsErr, settingsRow) => {
            if (settingsErr) {
                console.error('Notification settings load error:', settingsErr.message || settingsErr);
                resolve({ success: false, error: 'settings_load_failed' });
                return;
            }

            const settings = toNotificationSettingsPayload(settingsRow);

            if (!force) {
                if (eventType === 'pending_order' && !settings.notifyPendingOrders) {
                    resolve({ success: true, skipped: 'pending_order_notifications_disabled' });
                    return;
                }

                if (eventType === 'ai_chat' && !settings.notifyAiChats) {
                    resolve({ success: true, skipped: 'ai_chat_notifications_disabled' });
                    return;
                }
            }

            const messageText = buildNotificationMessage(eventType, payload);
            const requests = [];

            if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
                requests.push(
                    sendTelegramNotification(settings.telegramBotToken, settings.telegramChatId, messageText)
                        .then(() => ({ channel: 'telegram', ok: true }))
                        .catch((error) => ({ channel: 'telegram', ok: false, error: error.message }))
                );
            }

            const intergramTarget = String(settings.intergramWebhookUrl || '').trim();
            if (settings.intergramEnabled && intergramTarget) {
                if (/^https?:\/\//i.test(intergramTarget)) {
                    requests.push(
                        sendIntergramNotification(intergramTarget, {
                            source: 'cynetwork-pisowifi',
                            eventType,
                            message: messageText,
                            payload,
                            sentAt: new Date().toISOString()
                        })
                            .then(() => ({ channel: 'intergram', ok: true }))
                            .catch((error) => ({ channel: 'intergram', ok: false, error: error.message }))
                    );
                } else if (settings.telegramBotToken) {
                    requests.push(
                        sendTelegramNotification(settings.telegramBotToken, intergramTarget, messageText)
                            .then(() => ({ channel: 'intergram', ok: true }))
                            .catch((error) => ({ channel: 'intergram', ok: false, error: error.message }))
                    );
                } else {
                    requests.push(Promise.resolve({
                        channel: 'intergram',
                        ok: false,
                        error: 'BotFather token is required when Intergram target is a chat ID.'
                    }));
                }
            }

            if (!requests.length) {
                resolve({ success: true, skipped: 'no_enabled_channels' });
                return;
            }

            const results = await Promise.all(requests);
            results
                .filter((item) => !item.ok)
                .forEach((failed) => {
                    console.warn(`Notification channel failure (${failed.channel}):`, failed.error);
                });

            resolve({
                success: results.some((item) => item.ok),
                results
            });
        });
    });
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use('/admin', express.static(adminPublicDir));
app.use(express.static(clientPublicDir));

// Serve admin dashboard at /admin route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(adminPublicDir, 'index.html'));
});

// Serve client website from root
app.get('/', (req, res) => {
    res.sendFile(path.join(clientPublicDir, 'index.html'));
});

// =====================================================
// DATABASE SETUP
// =====================================================

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database error:', err);
    else console.log(`Connected to SQLite database at: ${dbPath}`);
});

function normalizeDbParams(params) {
    if (Array.isArray(params)) {
        return params;
    }

    if (params === undefined || params === null) {
        return [];
    }

    return [params];
}

function normalizeDbCallArgs(params, callback) {
    if (typeof params === 'function') {
        return {
            params: [],
            callback: params
        };
    }

    return {
        params: normalizeDbParams(params),
        callback
    };
}

function convertSqliteQuestionMarksToPostgres(sqlText) {
    let output = '';
    let placeholderIndex = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < sqlText.length; i += 1) {
        const currentChar = sqlText[i];
        const nextChar = sqlText[i + 1];

        if (!inDoubleQuote && currentChar === '\'') {
            if (inSingleQuote && nextChar === '\'') {
                output += "''";
                i += 1;
                continue;
            }

            inSingleQuote = !inSingleQuote;
            output += currentChar;
            continue;
        }

        if (!inSingleQuote && currentChar === '"') {
            if (inDoubleQuote && nextChar === '"') {
                output += '""';
                i += 1;
                continue;
            }

            inDoubleQuote = !inDoubleQuote;
            output += currentChar;
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote && currentChar === '?') {
            placeholderIndex += 1;
            output += `$${placeholderIndex}`;
            continue;
        }

        output += currentChar;
    }

    return output;
}

function translateSqliteFunctionsToPostgres(sqlText) {
    return sqlText
        .replace(/\bBEGIN\s+IMMEDIATE\s+TRANSACTION\b/ig, 'BEGIN')
        .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/ig, 'INSERT INTO')
        .replace(/date\(created_at,\s*'localtime'\)/ig, 'DATE(created_at)')
        .replace(/date\('now',\s*'localtime'\)/ig, 'CURRENT_DATE')
        .replace(/date\('now',\s*'-6 day',\s*'localtime'\)/ig, "(CURRENT_DATE - INTERVAL '6 day')")
        .replace(/strftime\('%Y-%m',\s*created_at,\s*'localtime'\)/ig, "to_char(created_at, 'YYYY-MM')")
        .replace(/strftime\('%Y-%m',\s*'now',\s*'localtime'\)/ig, "to_char(NOW(), 'YYYY-MM')");
}

function buildPostgresQuery(sql, options = {}) {
    const rawSql = String(sql || '');
    const hasInsertOrIgnore = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(rawSql);
    const forWrite = Boolean(options.forWrite);

    let convertedSql = translateSqliteFunctionsToPostgres(rawSql)
        .trim()
        .replace(/;+\s*$/, '');

    if (hasInsertOrIgnore && !/\bON\s+CONFLICT\b/i.test(convertedSql)) {
        convertedSql = `${convertedSql} ON CONFLICT DO NOTHING`;
    }

    const isInsertStatement = /^\s*INSERT\b/i.test(convertedSql);
    if (forWrite && isInsertStatement && !/\bRETURNING\b/i.test(convertedSql)) {
        convertedSql = `${convertedSql} RETURNING id`;
    }

    return convertSqliteQuestionMarksToPostgres(convertedSql);
}

function runPostgresQuery(sql, params = [], options = {}) {
    if (!pgClient) {
        return Promise.reject(new Error('PostgreSQL client is not configured.'));
    }

    const postgresSql = buildPostgresQuery(sql, options);
    return pgClient.query(postgresSql, normalizeDbParams(params));
}

// Override db methods for production (Supabase)
if (isProduction) {
    db.get = (sql, params, callback) => {
        const { params: normalizedParams, callback: normalizedCallback } = normalizeDbCallArgs(params, callback);
        const handler = (typeof normalizedCallback === 'function') ? normalizedCallback : () => {};
        pgGetAsync(sql, normalizedParams).then(row => handler(null, row)).catch(err => handler(err));
    };
    db.all = (sql, params, callback) => {
        const { params: normalizedParams, callback: normalizedCallback } = normalizeDbCallArgs(params, callback);
        const handler = (typeof normalizedCallback === 'function') ? normalizedCallback : () => {};
        pgAllAsync(sql, normalizedParams).then(rows => handler(null, rows)).catch(err => handler(err));
    };
    db.run = (sql, params, callback) => {
        const { params: normalizedParams, callback: normalizedCallback } = normalizeDbCallArgs(params, callback);
        const handler = (typeof normalizedCallback === 'function') ? normalizedCallback : () => {};
        pgRunAsync(sql, normalizedParams).then(result => {
            // Simulate sqlite3 callback with this.lastID and this.changes
            const mockThis = { lastID: result.lastID, changes: result.changes };
            handler.call(mockThis, null);
        }).catch(err => handler(err));
    };
}

function sqliteGetAsync(sql, params = []) {
    if (isProduction) {
        return pgGetAsync(sql, params);
    }
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row || null);
        });
    });
}

function sqliteAllAsync(sql, params = []) {
    if (isProduction) {
        return pgAllAsync(sql, params);
    }
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows || []);
        });
    });
}

function sqliteRunAsync(sql, params = []) {
    if (isProduction) {
        return pgRunAsync(sql, params);
    }
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({
                lastID: this.lastID,
                changes: this.changes
            });
        });
    });
}

if (pgClient) {
    pgClient.connect((err) => {
        if (err) {
            console.error('PostgreSQL connection error:', err);
        } else {
            console.log('Connected to Supabase PostgreSQL');
            void initializeDatabase()
                .catch((startupError) => {
                    console.error('PostgreSQL startup data initialization failed:', startupError.message || startupError);
                })
                .finally(() => {
                    void initializeManagedAccountBackup().catch((backupError) => {
                        console.error('Managed account backup startup error:', backupError.message || backupError);
                    });
                });
        }

        releaseStartupGate(err ? 'postgres connect failed' : 'postgres connected');
    });
} else {
    console.warn('SUPABASE_DB_URL is not configured; PostgreSQL features are disabled.');
    releaseStartupGate('postgres disabled');
}

function pgGetAsync(sql, params = []) {
    return runPostgresQuery(sql, params).then(res => res.rows[0] || null).catch(err => { throw err; });
}

function pgAllAsync(sql, params = []) {
    return runPostgresQuery(sql, params).then(res => res.rows).catch(err => { throw err; });
}

function pgRunAsync(sql, params = []) {
    return runPostgresQuery(sql, params, { forWrite: true })
        .then(res => ({ lastID: res.rows[0]?.id || null, changes: res.rowCount }))
        .catch(err => { throw err; });
}

async function initializeDatabase() {
    // Insert default admin
    await pgRunAsync(
        `INSERT INTO admins (username, password, email) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING`,
        [DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD_HASH, 'admin@cynetwork.com']
    );

    // Migrate older default hash to the current documented default password.
    await pgRunAsync(
        `UPDATE admins
         SET password = $1
         WHERE username = $2 AND password = $3`,
        [DEFAULT_ADMIN_PASSWORD_HASH, DEFAULT_ADMIN_USERNAME, LEGACY_DEFAULT_ADMIN_PASSWORD_HASH]
    );

    // Insert notification settings
    await pgRunAsync(`INSERT INTO notification_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

    // Updates for orders
    await pgRunAsync(`UPDATE orders SET quantity = 1 WHERE quantity IS NULL OR quantity < 1`);
    await pgRunAsync(`UPDATE orders SET unit_price = price WHERE unit_price IS NULL OR TRIM(unit_price) = ''`);
    await pgRunAsync(`UPDATE orders SET shipping_fee = '0' WHERE shipping_fee IS NULL OR TRIM(shipping_fee) = ''`);
    await pgRunAsync(`UPDATE orders SET total_price = price WHERE total_price IS NULL OR TRIM(total_price) = ''`);
    await pgRunAsync(`UPDATE orders SET amazon_leo_sms_sent = 0 WHERE amazon_leo_sms_sent IS NULL`);
}

function normalizeAccountBackupPayload(rawPayload) {
    if (!rawPayload) {
        return null;
    }
    if (typeof rawPayload === 'string') {
        try {
            return JSON.parse(rawPayload);
        } catch (error) {
            return null;
        }
    }
    if (typeof rawPayload === 'object') {
        return rawPayload;
    }
    return null;
}

async function buildClientAccountSnapshot() {
    const [accounts, rewards, redemptions] = await Promise.all([
        pgAllAsync(`
            SELECT id, full_name, contact_number, email, password, referral_code, referred_by_code,
                   referral_balance, referral_reward_count, created_at, updated_at
            FROM client_accounts
            ORDER BY id ASC
        `),
        pgAllAsync(`
            SELECT id, referrer_account_id, referred_account_id, first_order_id, reward_amount, created_at
            FROM referral_rewards
            ORDER BY id ASC
        `),
        pgAllAsync(`
            SELECT id, client_account_id, gross_amount, vat_amount, net_amount, gcash_name, gcash_number,
                   status, note, created_at, updated_at
            FROM referral_redemptions
            ORDER BY id ASC
        `)
    ]);

    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        accounts,
        rewards,
        redemptions
    };
}

async function restoreClientAccountSnapshotIfNeeded() {
    if (!accountBackupCollection) {
        return false;
    }

    const localAccountCountRow = await pgGetAsync('SELECT COUNT(*) AS total FROM client_accounts');
    const localAccountCount = Number(localAccountCountRow?.total || 0);
    if (localAccountCount > 0) {
        return false;
    }

    const remoteDoc = await accountBackupCollection.findOne(
        { _id: 'client-account-snapshot' },
        { projection: { payload: 1 } }
    );
    const payload = normalizeAccountBackupPayload(remoteDoc?.payload);
    if (!payload) {
        return false;
    }

    const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
    const rewards = Array.isArray(payload.rewards) ? payload.rewards : [];
    const redemptions = Array.isArray(payload.redemptions) ? payload.redemptions : [];
    if (!accounts.length && !rewards.length && !redemptions.length) {
        return false;
    }

    await sqliteRunAsync('BEGIN IMMEDIATE TRANSACTION');
    try {
        for (const account of accounts) {
            await sqliteRunAsync(
                `INSERT INTO client_accounts (
                    id, full_name, contact_number, email, password, referral_code, referred_by_code,
                    referral_balance, referral_reward_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    contact_number = EXCLUDED.contact_number,
                    email = EXCLUDED.email,
                    password = EXCLUDED.password,
                    referral_code = EXCLUDED.referral_code,
                    referred_by_code = EXCLUDED.referred_by_code,
                    referral_balance = EXCLUDED.referral_balance,
                    referral_reward_count = EXCLUDED.referral_reward_count,
                    created_at = EXCLUDED.created_at,
                    updated_at = EXCLUDED.updated_at`,
                [
                    account.id,
                    account.full_name,
                    account.contact_number || null,
                    String(account.email || '').toLowerCase(),
                    account.password,
                    String(account.referral_code || '').toUpperCase(),
                    account.referred_by_code ? String(account.referred_by_code).toUpperCase() : null,
                    Number(account.referral_balance || 0),
                    Number(account.referral_reward_count || 0),
                    account.created_at || new Date().toISOString(),
                    account.updated_at || new Date().toISOString()
                ]
            );
        }

        for (const reward of rewards) {
            await sqliteRunAsync(
                `INSERT INTO referral_rewards (
                    id, referrer_account_id, referred_account_id, first_order_id, reward_amount, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    referrer_account_id = EXCLUDED.referrer_account_id,
                    referred_account_id = EXCLUDED.referred_account_id,
                    first_order_id = EXCLUDED.first_order_id,
                    reward_amount = EXCLUDED.reward_amount,
                    created_at = EXCLUDED.created_at`,
                [
                    reward.id,
                    reward.referrer_account_id,
                    reward.referred_account_id,
                    reward.first_order_id || null,
                    Number(reward.reward_amount || REFERRAL_REWARD_PHP),
                    reward.created_at || new Date().toISOString()
                ]
            );
        }

        for (const redemption of redemptions) {
            await sqliteRunAsync(
                `INSERT INTO referral_redemptions (
                    id, client_account_id, gross_amount, vat_amount, net_amount, gcash_name, gcash_number,
                    status, note, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    client_account_id = EXCLUDED.client_account_id,
                    gross_amount = EXCLUDED.gross_amount,
                    vat_amount = EXCLUDED.vat_amount,
                    net_amount = EXCLUDED.net_amount,
                    gcash_name = EXCLUDED.gcash_name,
                    gcash_number = EXCLUDED.gcash_number,
                    status = EXCLUDED.status,
                    note = EXCLUDED.note,
                    created_at = EXCLUDED.created_at,
                    updated_at = EXCLUDED.updated_at`,
                [
                    redemption.id,
                    redemption.client_account_id,
                    Number(redemption.gross_amount || 0),
                    Number(redemption.vat_amount || REFERRAL_REDEEM_DEFAULT_DEDUCTION_PHP),
                    Number(redemption.net_amount || 0),
                    redemption.gcash_name || '',
                    redemption.gcash_number || '',
                    redemption.status || 'pending',
                    redemption.note || '',
                    redemption.created_at || new Date().toISOString(),
                    redemption.updated_at || new Date().toISOString()
                ]
            );
        }

        await sqliteRunAsync('COMMIT');
        accountBackupHydratedFromRemote = true;
        console.log(`Restored client account snapshot from managed backup (${accounts.length} accounts).`);
        return true;
    } catch (error) {
        await sqliteRunAsync('ROLLBACK');
        throw error;
    }
}

async function pushClientAccountSnapshot(reason = 'manual') {
    if (!accountBackupCollection) {
        return;
    }
    if (accountBackupSyncInProgress) {
        accountBackupSyncQueued = true;
        accountBackupLastSyncReason = reason;
        return;
    }

    accountBackupSyncInProgress = true;
    try {
        const snapshot = await buildClientAccountSnapshot();
        await accountBackupCollection.updateOne(
            { _id: 'client-account-snapshot' },
            {
                $set: {
                    payload: snapshot,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );
        accountBackupLastSyncedAt = new Date().toISOString();
        accountBackupLastSyncReason = reason;
        accountBackupLastSyncError = '';
    } catch (error) {
        accountBackupLastSyncError = String(error.message || error);
        console.error('Managed account backup sync failed:', accountBackupLastSyncError);
    } finally {
        accountBackupSyncInProgress = false;
        if (accountBackupSyncQueued) {
            accountBackupSyncQueued = false;
            const queuedReason = accountBackupLastSyncReason || 'queued';
            setTimeout(() => {
                void pushClientAccountSnapshot(queuedReason);
            }, 250);
        }
    }
}

function queueClientAccountBackup(reason = 'update') {
    if (!accountBackupCollection) {
        return;
    }
    accountBackupLastSyncReason = reason;
    if (accountBackupSyncTimer) {
        clearTimeout(accountBackupSyncTimer);
    }
    accountBackupSyncTimer = setTimeout(() => {
        accountBackupSyncTimer = null;
        void pushClientAccountSnapshot(reason);
    }, 1200);
}

function shouldRetryWithSrvDnsFallback(uri, error) {
    if (!uri || !uri.startsWith('mongodb+srv://') || !error || !accountBackupMongoSrvFallbackEnabled) {
        return false;
    }

    const code = String(error.code || '').toUpperCase();
    const message = String(error.message || '').toLowerCase();
    return message.includes('querysrv') || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEOUT';
}

function decodeUriComponentSafely(value) {
    if (!value) {
        return '';
    }

    try {
        return decodeURIComponent(value);
    } catch (error) {
        return value;
    }
}

function buildMongoSeedlistUriFromSrv(mongoSrvUri, srvRecords, txtRecords = []) {
    const parsed = new URL(mongoSrvUri);
    const authUser = decodeUriComponentSafely(parsed.username);
    const authPassword = decodeUriComponentSafely(parsed.password);
    const authSegment = authUser
        ? `${encodeURIComponent(authUser)}${authPassword ? `:${encodeURIComponent(authPassword)}` : ''}@`
        : '';

    const hosts = srvRecords
        .map((record) => `${record.name}:${record.port}`)
        .join(',');
    if (!hosts) {
        throw new Error('MongoDB SRV lookup returned no hosts');
    }

    const params = new URLSearchParams(parsed.search.replace(/^\?/, ''));
    if (!params.has('tls')) {
        params.set('tls', 'true');
    }

    for (const txtRecord of txtRecords) {
        const joined = Array.isArray(txtRecord) ? txtRecord.join('') : String(txtRecord || '');
        const txtParams = new URLSearchParams(joined);
        for (const [key, value] of txtParams.entries()) {
            if (!params.has(key)) {
                params.set(key, value);
            }
        }
    }

    const dbPath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    const query = params.toString();
    return `mongodb://${authSegment}${hosts}${dbPath}${query ? `?${query}` : ''}`;
}

async function resolveMongoSrvUriToSeedlistUri(mongoSrvUri) {
    const parsed = new URL(mongoSrvUri);
    const hostname = String(parsed.hostname || '').trim();
    if (!hostname) {
        throw new Error('MongoDB SRV URI is missing hostname');
    }

    const lookupName = `_mongodb._tcp.${hostname}`;
    const resolver = new Resolver();
    if (accountBackupMongoDnsServers.length) {
        resolver.setServers(accountBackupMongoDnsServers);
    }

    const srvRecords = await resolver.resolveSrv(lookupName);
    const txtRecords = await resolver.resolveTxt(lookupName).catch(() => []);
    return buildMongoSeedlistUriFromSrv(mongoSrvUri, srvRecords, txtRecords);
}

async function connectManagedAccountBackupClient(mongoUri) {
    const client = new MongoClient(mongoUri, {
        serverSelectionTimeoutMS: 10000
    });

    try {
        await client.connect();
        const collection = client
            .db(accountBackupMongoDbName)
            .collection(accountBackupMongoCollectionName);
        await collection.findOne({ _id: 'client-account-snapshot' });
        return { client, collection };
    } catch (error) {
        try {
            await client.close();
        } catch (closeError) {
            console.error('Failed to close managed backup connection after error:', closeError.message || closeError);
        }
        throw error;
    }
}

async function initializeManagedAccountBackup() {
    if (!accountBackupMongoUri) {
        accountBackupConnectionMode = 'disabled';
        console.log('Managed account backup is disabled (ACCOUNT_BACKUP_MONGODB_URI is not set).');
        return;
    }

    try {
        let connected = await connectManagedAccountBackupClient(accountBackupMongoUri);
        accountBackupConnectionMode = accountBackupMongoUri.startsWith('mongodb+srv://') ? 'srv' : 'standard';

        accountBackupMongoClient = connected.client;
        accountBackupCollection = connected.collection;

        await restoreClientAccountSnapshotIfNeeded();
        await pushClientAccountSnapshot('startup');
        console.log(`Managed account backup is enabled (MongoDB, mode: ${accountBackupConnectionMode}).`);
    } catch (error) {
        if (shouldRetryWithSrvDnsFallback(accountBackupMongoUri, error)) {
            try {
                const fallbackUri = await resolveMongoSrvUriToSeedlistUri(accountBackupMongoUri);
                const connected = await connectManagedAccountBackupClient(fallbackUri);
                accountBackupMongoClient = connected.client;
                accountBackupCollection = connected.collection;
                accountBackupConnectionMode = 'srv-seedlist-fallback';
                await restoreClientAccountSnapshotIfNeeded();
                await pushClientAccountSnapshot('startup');
                console.log('Managed account backup is enabled (MongoDB, mode: srv-seedlist-fallback).');
                return;
            } catch (fallbackError) {
                accountBackupLastSyncError = String(fallbackError.message || fallbackError);
            }
        } else {
            accountBackupLastSyncError = String(error.message || error);
        }

        accountBackupConnectionMode = 'error';
        console.error('Failed to initialize managed account backup:', accountBackupLastSyncError);
        if (accountBackupMongoClient) {
            try {
                await accountBackupMongoClient.close();
            } catch (closeError) {
                console.error('Failed to close managed backup connection:', closeError.message || closeError);
            }
        }
        accountBackupMongoClient = null;
        accountBackupCollection = null;
    }
}

// Create tables
/* db.serialize(() => {
    const addColumnIfMissing = (sql, label) => {
        db.run(sql, (err) => {
            if (err && !String(err.message || '').includes('duplicate column name')) {
                console.error(`Failed adding ${label} column:`, err.message);
            }
        });
    };

    // Admin users table
    db.run(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Orders table
    db.run(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tracking_number TEXT,
            package_id INTEGER NOT NULL,
            package_name TEXT NOT NULL,
            price TEXT NOT NULL,
            duration TEXT NOT NULL,
            full_name TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            address TEXT NOT NULL,
            wifi_name TEXT NOT NULL,
            wifi_password TEXT NOT NULL,
            wifi_rate TEXT NOT NULL,
            proof_image LONGBLOB,
            status TEXT DEFAULT 'pending',
            approved_by TEXT,
            rejection_reason TEXT,
            amazon_leo_sms_sent INTEGER DEFAULT 0,
            amazon_leo_sms_sent_at DATETIME,
            amazon_leo_sms_error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS client_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            contact_number TEXT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            referral_code TEXT UNIQUE NOT NULL,
            referred_by_code TEXT,
            referral_balance INTEGER DEFAULT 0,
            referral_reward_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS referral_rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_account_id INTEGER NOT NULL,
            referred_account_id INTEGER UNIQUE NOT NULL,
            first_order_id INTEGER,
            reward_amount INTEGER NOT NULL DEFAULT ${REFERRAL_REWARD_PHP},
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (referrer_account_id) REFERENCES client_accounts(id),
            FOREIGN KEY (referred_account_id) REFERENCES client_accounts(id),
            FOREIGN KEY (first_order_id) REFERENCES orders(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS referral_redemptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_account_id INTEGER NOT NULL,
            gross_amount INTEGER NOT NULL,
            vat_amount INTEGER NOT NULL DEFAULT ${REFERRAL_REDEEM_DEFAULT_DEDUCTION_PHP},
            net_amount INTEGER NOT NULL,
            gcash_name TEXT NOT NULL,
            gcash_number TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_account_id) REFERENCES client_accounts(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT UNIQUE NOT NULL,
            order_id INTEGER,
            tracking_number TEXT,
            customer_name TEXT,
            customer_contact TEXT,
            status TEXT DEFAULT 'ai',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            sender_type TEXT NOT NULL,
            message TEXT NOT NULL,
            read_by_admin INTEGER DEFAULT 0,
            read_by_client INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS notification_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            telegram_enabled INTEGER DEFAULT 0,
            telegram_bot_token TEXT,
            telegram_chat_id TEXT,
            intergram_enabled INTEGER DEFAULT 0,
            intergram_webhook_url TEXT,
            notify_pending_orders INTEGER DEFAULT 1,
            notify_ai_chats INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    addColumnIfMissing('ALTER TABLE orders ADD COLUMN tracking_number TEXT', 'tracking_number');
    addColumnIfMissing('ALTER TABLE orders ADD COLUMN quantity INTEGER DEFAULT 1', 'quantity');
    addColumnIfMissing('ALTER TABLE orders ADD COLUMN unit_price TEXT', 'unit_price');
    addColumnIfMissing('ALTER TABLE orders ADD COLUMN shipping_fee TEXT DEFAULT \'0\'', 'shipping_fee');
    addColumnIfMissing('ALTER TABLE orders ADD COLUMN total_price TEXT', 'total_price');
    addColumnIfMissing('ALTER TABLE orders ADD COLUMN client_account_id INTEGER', 'client_account_id');
    addColumnIfMissing('ALTER TABLE orders ADD COLUMN referral_code_used TEXT', 'referral_code_used');
    addColumnIfMissing('ALTER TABLE orders ADD COLUMN amazon_leo_sms_sent INTEGER DEFAULT 0', 'amazon_leo_sms_sent');
    addColumnIfMissing('ALTER TABLE orders ADD COLUMN amazon_leo_sms_sent_at DATETIME', 'amazon_leo_sms_sent_at');
    addColumnIfMissing('ALTER TABLE orders ADD COLUMN amazon_leo_sms_error TEXT', 'amazon_leo_sms_error');

    addColumnIfMissing('ALTER TABLE client_accounts ADD COLUMN contact_number TEXT', 'contact_number');
    addColumnIfMissing('ALTER TABLE client_accounts ADD COLUMN referral_balance INTEGER DEFAULT 0', 'referral_balance');
    addColumnIfMissing('ALTER TABLE client_accounts ADD COLUMN referral_reward_count INTEGER DEFAULT 0', 'referral_reward_count');
    addColumnIfMissing('ALTER TABLE client_accounts ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP', 'updated_at');

    addColumnIfMissing('ALTER TABLE notification_settings ADD COLUMN telegram_enabled INTEGER DEFAULT 0', 'notification_settings.telegram_enabled');
    addColumnIfMissing('ALTER TABLE notification_settings ADD COLUMN telegram_bot_token TEXT', 'notification_settings.telegram_bot_token');
    addColumnIfMissing('ALTER TABLE notification_settings ADD COLUMN telegram_chat_id TEXT', 'notification_settings.telegram_chat_id');
    addColumnIfMissing('ALTER TABLE notification_settings ADD COLUMN intergram_enabled INTEGER DEFAULT 0', 'notification_settings.intergram_enabled');
    addColumnIfMissing('ALTER TABLE notification_settings ADD COLUMN intergram_webhook_url TEXT', 'notification_settings.intergram_webhook_url');
    addColumnIfMissing('ALTER TABLE notification_settings ADD COLUMN notify_pending_orders INTEGER DEFAULT 1', 'notification_settings.notify_pending_orders');
    addColumnIfMissing('ALTER TABLE notification_settings ADD COLUMN notify_ai_chats INTEGER DEFAULT 1', 'notification_settings.notify_ai_chats');
    addColumnIfMissing('ALTER TABLE notification_settings ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP', 'notification_settings.created_at');
    addColumnIfMissing('ALTER TABLE notification_settings ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP', 'notification_settings.updated_at');

    db.run(`
        INSERT OR IGNORE INTO notification_settings (
            id,
            telegram_enabled,
            telegram_bot_token,
            telegram_chat_id,
            intergram_enabled,
            intergram_webhook_url,
            notify_pending_orders,
            notify_ai_chats
        ) VALUES (1, 0, '', '', 0, '', 1, 1)
    `);

    // Backfill old orders with deterministic tracking numbers.
    db.run(`
        UPDATE orders
        SET tracking_number = 'CYN-' || strftime('%Y%m%d', COALESCE(created_at, CURRENT_TIMESTAMP)) || '-' || substr('000000' || id, -6)
        WHERE tracking_number IS NULL OR TRIM(tracking_number) = ''
    `);

    db.run(`
        UPDATE orders
        SET quantity = 1
        WHERE quantity IS NULL OR quantity < 1
    `);

    db.run(`
        UPDATE orders
        SET unit_price = price
        WHERE unit_price IS NULL OR TRIM(unit_price) = ''
    `);

    db.run(`
        UPDATE orders
        SET shipping_fee = '0'
        WHERE shipping_fee IS NULL OR TRIM(shipping_fee) = ''
    `);

    db.run(`
        UPDATE orders
        SET total_price = price
        WHERE total_price IS NULL OR TRIM(total_price) = ''
    `);

    db.run(`
        UPDATE orders
        SET amazon_leo_sms_sent = 0
        WHERE amazon_leo_sms_sent IS NULL
    `);

    pgGetAsync('SELECT 1 AS ready').then(async () => {
        try {
            await initializeManagedAccountBackup();
        } catch (error) {
            console.error('Managed account backup startup error:', error.message || error);
        } finally {
            if (typeof resolveStartupReady === 'function') {
                resolveStartupReady();
                resolveStartupReady = null;
            }
        }
    });
});

/*
// Create default admin if not exists
const adminUsername = 'admin';
const adminPassword = 'admin123';

bcrypt.hash(adminPassword, 10, (err, hash) => {
    if (err) return console.error('Hash error:', err);
    
    db.get('SELECT id FROM admins WHERE username = ?', [adminUsername], (err, row) => {
        if (!row) {
            db.run(
                'INSERT INTO admins (username, password, email) VALUES (?, ?, ?)',
                [adminUsername, hash, 'admin@cynetwork.com'],
                (err) => {
                    if (!err) console.log('Default admin created - Username: admin, Password: admin123');
                }
            );
        }
    });
});
*/

// =====================================================
// AUTHENTICATION MIDDLEWARE
// =====================================================

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.adminId = decoded.id;
        req.adminUsername = decoded.username;
        next();
    });
};

const verifyClientToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No client token provided' });
    }

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err || decoded?.type !== 'client' || !decoded?.id) {
            return res.status(401).json({ error: 'Invalid client token' });
        }

        req.clientAccountId = Number(decoded.id);
        req.clientEmail = decoded.email || null;
        next();
    });
};

// =====================================================
// AUTHENTICATION ROUTES
// =====================================================

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    db.get('SELECT id, username, password FROM admins WHERE username = ?', [username], (err, row) => {
        if (err || !row) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        bcrypt.compare(password, row.password, (err, isMatch) => {
            if (err || !isMatch) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }
            
            const token = jwt.sign({ id: row.id, username: row.username }, SECRET_KEY, {
                expiresIn: '24h'
            });
            
            res.json({ token, username: row.username });
        });
    });
});

app.post('/api/admin/change-password', verifyToken, (req, res) => {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const adminId = Number(req.adminId || 0);
    const adminUsername = String(req.adminUsername || '').trim();

    const lookupQuery = adminId
        ? 'SELECT id, username, password FROM admins WHERE id = ?'
        : 'SELECT id, username, password FROM admins WHERE username = ?';
    const lookupParams = adminId ? [adminId] : [adminUsername];

    db.get(lookupQuery, lookupParams, (lookupErr, adminRow) => {
        if (lookupErr || !adminRow) {
            return res.status(401).json({ error: 'Unable to verify admin account' });
        }

        bcrypt.compare(currentPassword, adminRow.password, (compareErr, isMatch) => {
            if (compareErr || !isMatch) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            bcrypt.hash(newPassword, 10, (hashErr, newHash) => {
                if (hashErr) {
                    return res.status(500).json({ error: 'Failed to secure new password' });
                }

                db.run('UPDATE admins SET password = ? WHERE id = ?', [newHash, adminRow.id], function(updateErr) {
                    if (updateErr) {
                        return res.status(500).json({ error: 'Failed to update password' });
                    }

                    if (!this.changes) {
                        return res.status(404).json({ error: 'Admin account not found' });
                    }

                    res.json({ success: true, message: 'Password updated successfully' });
                });
            });
        });
    });
});

// =====================================================
// CLIENT ACCOUNT & REFERRAL ROUTES
// =====================================================

app.post('/api/client/register', (req, res) => {
    const fullName = String(req.body.fullName || '').trim();
    const contactNumber = String(req.body.contactNumber || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    const rawReferralCode = String(req.body.referralCode || '').trim().toUpperCase();

    if (!fullName || !email || !password) {
        return res.status(400).json({ error: 'Full name, email, and password are required' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Password and confirm password do not match' });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const createAccount = (referralCodeToStore = null) => {
        generateUniqueReferralCode((codeErr, ownReferralCode) => {
            if (codeErr) {
                return res.status(500).json({ error: 'Failed to generate referral code' });
            }

            bcrypt.hash(password, 10, (hashErr, hash) => {
                if (hashErr) {
                    return res.status(500).json({ error: 'Failed to secure password' });
                }

                db.run(
                    `INSERT INTO client_accounts (
                        full_name,
                        contact_number,
                        email,
                        password,
                        referral_code,
                        referred_by_code,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [fullName, contactNumber || null, email, hash, ownReferralCode, referralCodeToStore],
                    function(insertErr) {
                        if (insertErr) {
                            if (String(insertErr.message || '').includes('UNIQUE constraint failed: client_accounts.email')) {
                                return res.status(409).json({ error: 'Email is already registered' });
                            }

                            if (String(insertErr.message || '').includes('UNIQUE constraint failed: client_accounts.referral_code')) {
                                return res.status(500).json({ error: 'Referral code collision. Please try again.' });
                            }

                            return res.status(500).json({ error: 'Failed to create account' });
                        }

                        db.get(
                            `SELECT
                                c.*,
                                (SELECT COUNT(*) FROM client_accounts r WHERE r.referred_by_code = c.referral_code) AS invite_count,
                                (SELECT COUNT(*) FROM referral_rewards rr WHERE rr.referrer_account_id = c.id) AS converted_invite_count
                             FROM client_accounts c
                             WHERE c.id = ?`,
                            [this.lastID],
                            (loadErr, accountRow) => {
                                if (loadErr || !accountRow) {
                                    return res.status(500).json({ error: 'Account created but could not be loaded' });
                                }

                                const token = issueClientToken(accountRow.id, accountRow.email);
                                queueClientAccountBackup('client-register');
                                res.json({
                                    success: true,
                                    token,
                                    account: toClientAccountPayload(accountRow)
                                });
                            }
                        );
                    }
                );
            });
        });
    };

    if (rawReferralCode) {
        db.get(
            'SELECT id FROM client_accounts WHERE referral_code = ?',
            [rawReferralCode],
            (refErr, refRow) => {
                if (refErr) {
                    return res.status(500).json({ error: 'Failed to validate referral code' });
                }

                if (!refRow) {
                    return res.status(400).json({ error: 'Referral code is invalid' });
                }

                createAccount(rawReferralCode);
            }
        );
        return;
    }

    createAccount(null);
});

app.post('/api/client/login', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    db.get(
        `SELECT
            c.*,
            (SELECT COUNT(*) FROM client_accounts r WHERE r.referred_by_code = c.referral_code) AS invite_count,
            (SELECT COUNT(*) FROM referral_rewards rr WHERE rr.referrer_account_id = c.id) AS converted_invite_count
         FROM client_accounts c
         WHERE c.email = ?`,
        [email],
        (err, accountRow) => {
            if (err || !accountRow) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            bcrypt.compare(password, accountRow.password, (compareErr, matched) => {
                if (compareErr || !matched) {
                    return res.status(401).json({ error: 'Invalid email or password' });
                }

                const token = issueClientToken(accountRow.id, accountRow.email);
                res.json({
                    success: true,
                    token,
                    account: toClientAccountPayload(accountRow)
                });
            });
        }
    );
});

app.post('/api/client/forgot-password', (req, res) => {
    const fullName = String(req.body.fullName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!fullName || !email || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: 'Full name, email, new password, and confirm password are required' });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'New password and confirm password do not match' });
    }

    db.get(
        'SELECT id, full_name FROM client_accounts WHERE email = ?',
        [email],
        (lookupErr, accountRow) => {
            if (lookupErr) {
                return res.status(500).json({ error: 'Failed to verify account details' });
            }

            if (!accountRow) {
                return res.status(404).json({ error: 'Account details not found' });
            }

            const isNameMatch = String(accountRow.full_name || '').trim().toLowerCase() === fullName.toLowerCase();
            if (!isNameMatch) {
                return res.status(404).json({ error: 'Account details not found' });
            }

            bcrypt.hash(newPassword, 10, (hashErr, hash) => {
                if (hashErr) {
                    return res.status(500).json({ error: 'Failed to secure new password' });
                }

                db.run(
                    `UPDATE client_accounts
                     SET password = ?,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [hash, accountRow.id],
                    function(updateErr) {
                        if (updateErr) {
                            return res.status(500).json({ error: 'Failed to update account password' });
                        }

                        if (!this.changes) {
                            return res.status(404).json({ error: 'Account not found' });
                        }

                        queueClientAccountBackup('client-forgot-password');
                        res.json({
                            success: true,
                            message: 'Password reset successful. You can now login.'
                        });
                    }
                );
            });
        }
    );
});

app.get('/api/client/me', verifyClientToken, (req, res) => {
    db.get(
        `SELECT
            c.*,
            (SELECT COUNT(*) FROM client_accounts r WHERE r.referred_by_code = c.referral_code) AS invite_count,
            (SELECT COUNT(*) FROM referral_rewards rr WHERE rr.referrer_account_id = c.id) AS converted_invite_count
         FROM client_accounts c
         WHERE c.id = ?`,
        [req.clientAccountId],
        (err, row) => {
            if (err || !row) {
                return res.status(404).json({ error: 'Client account not found' });
            }

            res.json({ success: true, account: toClientAccountPayload(row) });
        }
    );
});

app.get('/api/client/referral/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) {
        return res.status(400).json({ error: 'Referral code is required' });
    }

    db.get(
        'SELECT full_name, referral_code FROM client_accounts WHERE referral_code = ?',
        [code],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to validate referral code' });
            }

            if (!row) {
                return res.status(404).json({ error: 'Referral code not found' });
            }

            res.json({
                success: true,
                code: row.referral_code,
                inviterName: row.full_name
            });
        }
    );
});

app.get('/api/client/redemptions', verifyClientToken, (req, res) => {
    db.all(
        `SELECT *
         FROM referral_redemptions
         WHERE client_account_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [req.clientAccountId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to load redemption history' });
            }

            res.json({
                success: true,
                redemptions: (rows || []).map(toReferralRedemptionPayload)
            });
        }
    );
});

app.post('/api/client/redeem-referral', verifyClientToken, (req, res) => {
    const gcashName = String(req.body.gcashName || '').trim();
    const gcashNumber = normalizeGcashNumber(req.body.gcashNumber || '');

    if (!gcashName) {
        return res.status(400).json({ error: 'GCash name is required' });
    }

    if (!gcashNumber) {
        return res.status(400).json({ error: 'Please enter a valid GCash number' });
    }

    db.get(
        `SELECT id, email, referral_balance
         FROM client_accounts
         WHERE id = ?`,
        [req.clientAccountId],
        (accountErr, accountRow) => {
            if (accountErr || !accountRow) {
                return res.status(404).json({ error: 'Client account not found' });
            }

            const grossAmount = Number(accountRow.referral_balance || 0);
            const vatAmount = Math.max(0, Math.round(grossAmount * REFERRAL_REDEEM_DEDUCTION_RATE));
            const netAmount = grossAmount - vatAmount;

            if (netAmount <= 0) {
                return res.status(400).json({
                    error: `Referral balance is not enough after ${REFERRAL_REDEEM_DEDUCTION_PERCENT}% deduction.`
                });
            }

            db.serialize(() => {
                const rollbackWithError = (message, err = null, status = 500) => {
                    db.run('ROLLBACK', () => {
                        if (err) {
                            console.error(message, err.message || err);
                        }
                        res.status(status).json({ error: message });
                    });
                };

                db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
                    if (beginErr) {
                        return res.status(500).json({ error: 'Unable to start redemption transaction' });
                    }

                    db.run(
                        `UPDATE client_accounts
                         SET referral_balance = referral_balance - ?,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ? AND referral_balance >= ?`,
                        [grossAmount, req.clientAccountId, grossAmount],
                        function(updateErr) {
                            if (updateErr) {
                                return rollbackWithError('Failed to reserve referral rewards for redemption', updateErr);
                            }

                            if (this.changes === 0) {
                                return rollbackWithError('Referral balance changed. Please refresh and try again.', null, 409);
                            }

                            db.run(
                                `INSERT INTO referral_redemptions (
                                    client_account_id,
                                    gross_amount,
                                    vat_amount,
                                    net_amount,
                                    gcash_name,
                                    gcash_number,
                                    status,
                                    note,
                                    created_at,
                                    updated_at
                                ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                                [
                                    req.clientAccountId,
                                    grossAmount,
                                    vatAmount,
                                    netAmount,
                                    gcashName,
                                    gcashNumber,
                                    `Redemption of rewards will be given within 2 business days. A ${REFERRAL_REDEEM_DEDUCTION_PERCENT}% deduction was applied.`
                                ],
                                function(insertErr) {
                                    if (insertErr) {
                                        return rollbackWithError('Failed to create redemption request', insertErr);
                                    }

                                    const redemptionId = this.lastID;

                                    db.get(
                                        `SELECT
                                            c.*,
                                            (SELECT COUNT(*) FROM client_accounts r WHERE r.referred_by_code = c.referral_code) AS invite_count,
                                            (SELECT COUNT(*) FROM referral_rewards rr WHERE rr.referrer_account_id = c.id) AS converted_invite_count
                                         FROM client_accounts c
                                         WHERE c.id = ?`,
                                        [req.clientAccountId],
                                        (accountLoadErr, latestAccountRow) => {
                                            if (accountLoadErr || !latestAccountRow) {
                                                return rollbackWithError('Redemption was created but account refresh failed', accountLoadErr);
                                            }

                                            db.get(
                                                'SELECT * FROM referral_redemptions WHERE id = ?',
                                                [redemptionId],
                                                (redemptionErr, redemptionRow) => {
                                                    if (redemptionErr || !redemptionRow) {
                                                        return rollbackWithError('Redemption was created but details could not be loaded', redemptionErr);
                                                    }

                                                    db.run('COMMIT', (commitErr) => {
                                                        if (commitErr) {
                                                            return rollbackWithError('Failed to finalize redemption request', commitErr);
                                                        }

                                                        queueClientAccountBackup('referral-redemption');
                                                        res.json({
                                                            success: true,
                                                            message: 'Redemption request submitted. Redemption of rewards will be given within 2 business days.',
                                                            account: toClientAccountPayload(latestAccountRow),
                                                            redemption: toReferralRedemptionPayload(redemptionRow)
                                                        });
                                                    });
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                });
            });
        }
    );
});

// =====================================================
// ORDER ROUTES
// =====================================================

// Get all orders
app.get('/api/orders', verifyToken, (req, res) => {
    db.all(
        `SELECT id, tracking_number, package_name, price, unit_price, quantity, total_price, full_name, contact_number, status, created_at 
         FROM orders ORDER BY created_at DESC`,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(rows || []);
        }
    );
});

// Get order details
app.get('/api/orders/:id', verifyToken, (req, res) => {
    const { id } = req.params;
    
    db.get(
        'SELECT * FROM orders WHERE id = ?',
        [id],
        (err, row) => {
            if (err || !row) {
                return res.status(404).json({ error: 'Order not found' });
            }
            
            // Convert BLOB to base64 for proof image
            if (row.proof_image) {
                row.proof_image = 'data:image/jpeg;base64,' + Buffer.from(row.proof_image).toString('base64');
            }
            
            res.json(row);
        }
    );
});

// Approve order
app.post('/api/orders/:id/approve', verifyToken, (req, res) => {
    const { id } = req.params;
    const trackingNumber = normalizeTrackingNumber(req.body?.trackingNumber);

    if (!trackingNumber) {
        return res.status(400).json({ error: 'Tracking number is required when setting order to delivery' });
    }
    
    db.run(
        `UPDATE orders SET status = 'delivery', tracking_number = ?, approved_by = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [trackingNumber, req.adminUsername, id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (!this.changes) {
                return res.status(404).json({ error: 'Order not found' });
            }

            maybeApplyReferralRewardOnOrderConfirmation(id, 'delivery', (rewardErr, rewardMeta) => {
                if (rewardErr) {
                    console.error('Referral reward processing error:', rewardErr.message || rewardErr);
                }

                maybeSendAmazonLeoApprovalSms(id, 'delivery', (smsErr, smsMeta) => {
                    if (smsErr) {
                        console.error('Amazon LEO SMS automation error:', smsErr.message || smsErr);
                        return res.json({
                            success: true,
                            message: 'Order approved and set for delivery. Amazon LEO SMS check failed.',
                            sms: {
                                sent: false,
                                error: smsErr.message || String(smsErr)
                            },
                            referralReward: rewardMeta || { rewardApplied: false, rewardAmount: 0 }
                        });
                    }

                    const smsMessage = smsMeta?.sent
                        ? 'Order approved and set for delivery. Amazon LEO SMS sent to client.'
                        : 'Order approved and set for delivery.';

                    res.json({
                        success: true,
                        message: smsMessage,
                        sms: smsMeta || null,
                        referralReward: rewardMeta || { rewardApplied: false, rewardAmount: 0 }
                    });
                });
            });
        }
    );
});

// Reject order
app.post('/api/orders/:id/reject', verifyToken, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
        return res.status(400).json({ error: 'Rejection reason required' });
    }
    
    db.run(
        `UPDATE orders SET status = 'rejected', rejection_reason = ?, 
         approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [reason, req.adminUsername, id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ success: true, message: 'Order rejected' });
        }
    );
});

// Update order status
app.post('/api/orders/:id/status', verifyToken, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const trackingNumber = normalizeTrackingNumber(req.body?.trackingNumber);
    
    const validStatuses = ['pending', 'approved', 'delivery', 'rejected', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    if (status === 'delivery' && !trackingNumber) {
        return res.status(400).json({ error: 'Tracking number is required when setting order to delivery' });
    }

    const updateQuery = status === 'delivery'
        ? `UPDATE orders SET status = ?, tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        : `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    const updateParams = status === 'delivery'
        ? [status, trackingNumber, id]
        : [status, id];
    
    db.run(
        updateQuery,
        updateParams,
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (!this.changes) {
                return res.status(404).json({ error: 'Order not found' });
            }

            maybeApplyReferralRewardOnOrderConfirmation(id, status, (rewardErr, rewardMeta) => {
                if (rewardErr) {
                    console.error('Referral reward processing error:', rewardErr.message || rewardErr);
                }

                maybeSendAmazonLeoApprovalSms(id, status, (smsErr, smsMeta) => {
                    if (smsErr) {
                        console.error('Amazon LEO SMS automation error:', smsErr.message || smsErr);
                        return res.json({
                            success: true,
                            message: 'Order status updated. Amazon LEO SMS check failed.',
                            sms: {
                                sent: false,
                                error: smsErr.message || String(smsErr)
                            },
                            referralReward: rewardMeta || { rewardApplied: false, rewardAmount: 0 }
                        });
                    }

                    const smsMessage = smsMeta?.sent
                        ? 'Order status updated. Amazon LEO SMS sent to client.'
                        : 'Order status updated';

                    res.json({
                        success: true,
                        message: smsMessage,
                        sms: smsMeta || null,
                        referralReward: rewardMeta || { rewardApplied: false, rewardAmount: 0 }
                    });
                });
            });
        }
    );
});

// =====================================================
// ORDER SUBMISSION FROM WEBSITE
// =====================================================

app.post('/api/submit-order', (req, res) => {
    const {
        packageId,
        packageName,
        price,
        duration,
        quantity,
        fullName,
        contactNumber,
        address,
        wifiName,
        wifiPassword,
        wifiRate,
        proofImage
    } = req.body;

    const normalizedFullName = String(fullName || '').trim();
    const normalizedContactNumber = String(contactNumber || '').trim();
    const normalizedAddress = String(address || '').trim();
    const normalizedWifiName = String(wifiName || 'PREORDER').trim() || 'PREORDER';
    const normalizedWifiPassword = String(wifiPassword || 'PREORDER').trim() || 'PREORDER';

    // Validate required fields
    if (!packageId || !normalizedFullName || !normalizedContactNumber || !normalizedAddress) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedPackageId = normalizePositiveInt(packageId, 1, 1, 5);
    const catalog = PACKAGE_CATALOG[normalizedPackageId];
    const resolvedPackageName = catalog?.name || String(packageName || `Package ${normalizedPackageId}`);
    const resolvedDuration = catalog?.duration || String(duration || 'Custom Duration');
    const resolvedUnitPrice = catalog?.unitPrice ?? normalizePriceInt(price, 0);
    const resolvedQuantity = normalizePositiveInt(quantity, 1, 1, 100);
    const normalizedWifiRate = normalizeWifiRateForStorage(wifiRate, normalizedPackageId);
    const shippingFee = 0;
    const totalPrice = resolvedUnitPrice * resolvedQuantity + shippingFee;

    const optionalClientAuth = getOptionalClientAuth(req);
    const clientAccountId = optionalClientAuth?.id ? Number(optionalClientAuth.id) : null;

    if (!clientAccountId) {
        return res.status(401).json({
            error: 'Please register or login to your client account before placing an order'
        });
    }
    
    let proofBuffer = null;
    
    // Convert base64 proof image to buffer
    if (proofImage) {
        try {
            const base64Data = proofImage.replace(/^data:image\/\w+;base64,/, '');
            proofBuffer = Buffer.from(base64Data, 'base64');
        } catch (err) {
            console.error('Error converting image:', err);
        }
    }
    
    const insertOrderRow = (accountRow = null) => {
        db.run(
            `INSERT INTO orders (
                package_id,
                package_name,
                price,
                duration,
                full_name,
                contact_number,
                address,
                wifi_name,
                wifi_password,
                wifi_rate,
                proof_image,
                status,
                quantity,
                unit_price,
                shipping_fee,
                total_price,
                client_account_id,
                referral_code_used
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
            [
                normalizedPackageId,
                resolvedPackageName,
                toMoneyText(totalPrice),
                resolvedDuration,
                normalizedFullName,
                normalizedContactNumber,
                normalizedAddress,
                normalizedWifiName,
                normalizedWifiPassword,
                normalizedWifiRate,
                proofBuffer,
                resolvedQuantity,
                toMoneyText(resolvedUnitPrice),
                toMoneyText(shippingFee),
                toMoneyText(totalPrice),
                accountRow?.id || null,
                accountRow?.referred_by_code || null
            ],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to save order' });
                }

                const orderId = this.lastID;
                const trackingNumber = buildTrackingNumber(orderId, new Date());

                db.run(
                    `UPDATE orders SET tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [trackingNumber, orderId],
                    (updateErr) => {
                        if (updateErr) {
                            console.error('Tracking update error:', updateErr);
                            return res.status(500).json({ error: 'Failed to generate tracking number' });
                        }

                        void dispatchAdminNotification('pending_order', {
                            orderId,
                            trackingNumber,
                            fullName: normalizedFullName,
                            contactNumber: normalizedContactNumber,
                            packageName: resolvedPackageName,
                            quantity: resolvedQuantity,
                            totalPrice,
                            status: 'pending'
                        });

                        res.json({
                            success: true,
                            orderId,
                            trackingNumber,
                            status: 'pending',
                            quantity: resolvedQuantity,
                            unitPrice: toMoneyText(resolvedUnitPrice),
                            shippingFee: toMoneyText(shippingFee),
                            totalPrice: toMoneyText(totalPrice),
                            referralRewardApplied: false,
                            referralRewardAmount: 0,
                            referralRewardPendingApproval: Boolean(accountRow?.id && accountRow?.referred_by_code),
                            message: 'Order submitted successfully'
                        });
                    }
                );
            }
        );
    };

    db.get(
        `SELECT id, referred_by_code
         FROM client_accounts
         WHERE id = ?`,
        [clientAccountId],
        (accountErr, accountRow) => {
            if (accountErr) {
                console.error('Client account lookup error:', accountErr.message);
                return res.status(500).json({ error: 'Failed to validate client account' });
            }

            if (!accountRow) {
                return res.status(401).json({
                    error: 'Client account session is invalid. Please login again.'
                });
            }

            insertOrderRow(accountRow);
        }
    );
});

// Public order tracking (for client website)
app.get('/api/track-order/:id', (req, res) => {
    const rawLookup = String(req.params.id || '').trim();

    if (!rawLookup) {
        return res.status(400).json({ error: 'Order ID or tracking number is required' });
    }

    const normalizedLookup = rawLookup.toUpperCase();
    const isNumericOrderId = /^\d+$/.test(normalizedLookup);
    const query = isNumericOrderId
          ? `SELECT id, tracking_number, package_name, quantity, total_price, shipping_fee, status, rejection_reason, created_at, updated_at
           FROM orders WHERE id = ? OR tracking_number = ? ORDER BY id DESC LIMIT 1`
          : `SELECT id, tracking_number, package_name, quantity, total_price, shipping_fee, status, rejection_reason, created_at, updated_at
           FROM orders WHERE tracking_number = ? LIMIT 1`;
    const params = isNumericOrderId ? [normalizedLookup, normalizedLookup] : [normalizedLookup];

    db.get(query, params, (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!row) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const trackingNumber = row.tracking_number || buildTrackingNumber(row.id, row.created_at);
        if (!row.tracking_number) {
            db.run(
                `UPDATE orders SET tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [trackingNumber, row.id]
            );
        }

        res.json({
            orderId: row.id,
            trackingNumber,
            packageName: row.package_name,
            quantity: Number(row.quantity || 1),
            totalPrice: row.total_price || row.price || '0',
            shippingFee: row.shipping_fee || '0',
            status: row.status,
            rejectionReason: row.rejection_reason,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        });
    });
});

// =====================================================
// LIVE SUPPORT CHAT ROUTES
// =====================================================

app.post('/api/chat/session', (req, res) => {
    const { clientId, orderId, trackingNumber, customerName, customerContact } = req.body;

    if (!clientId || typeof clientId !== 'string' || clientId.trim().length < 5) {
        return res.status(400).json({ error: 'Valid clientId is required' });
    }

    const normalizedClientId = clientId.trim();
    const normalizedTracking = trackingNumber ? String(trackingNumber).trim().toUpperCase() : null;
    const normalizedOrderId = orderId && /^\d+$/.test(String(orderId)) ? parseInt(orderId, 10) : null;

    db.get(
        `SELECT * FROM chat_sessions WHERE client_id = ?`,
        [normalizedClientId],
        (err, existingSession) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (!existingSession) {
                db.run(
                    `INSERT INTO chat_sessions (client_id, order_id, tracking_number, customer_name, customer_contact, status)
                     VALUES (?, ?, ?, ?, ?, 'ai')`,
                    [
                        normalizedClientId,
                        normalizedOrderId,
                        normalizedTracking,
                        customerName || null,
                        customerContact || null
                    ],
                    function(insertErr) {
                        if (insertErr) {
                            return res.status(500).json({ error: 'Failed to create chat session' });
                        }

                        db.get(
                            `SELECT * FROM chat_sessions WHERE id = ?`,
                            [this.lastID],
                            (getErr, createdSession) => {
                                if (getErr || !createdSession) {
                                    return res.status(500).json({ error: 'Failed to load chat session' });
                                }
                                res.json({ success: true, session: toChatSessionPayload(createdSession) });
                            }
                        );
                    }
                );
                return;
            }

            const nextOrderId = normalizedOrderId || existingSession.order_id || null;
            const nextTracking = normalizedTracking || existingSession.tracking_number || null;
            const nextCustomerName = customerName || existingSession.customer_name || null;
            const nextCustomerContact = customerContact || existingSession.customer_contact || null;

            db.run(
                `UPDATE chat_sessions
                 SET order_id = ?, tracking_number = ?, customer_name = ?, customer_contact = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [nextOrderId, nextTracking, nextCustomerName, nextCustomerContact, existingSession.id],
                (updateErr) => {
                    if (updateErr) {
                        return res.status(500).json({ error: 'Failed to update chat session' });
                    }

                    db.get(
                        `SELECT * FROM chat_sessions WHERE id = ?`,
                        [existingSession.id],
                        (getErr, updatedSession) => {
                            if (getErr || !updatedSession) {
                                return res.status(500).json({ error: 'Failed to load chat session' });
                            }
                            res.json({ success: true, session: toChatSessionPayload(updatedSession) });
                        }
                    );
                }
            );
        }
    );
});

app.post('/api/chat/live-support-request', (req, res) => {
    const { sessionId, clientId } = req.body;

    if (!sessionId || !clientId) {
        return res.status(400).json({ error: 'sessionId and clientId are required' });
    }

    db.get(
        `SELECT * FROM chat_sessions WHERE id = ?`,
        [sessionId],
        (err, session) => {
            if (err || !session) {
                return res.status(404).json({ error: 'Chat session not found' });
            }

            if (session.client_id !== clientId) {
                return res.status(403).json({ error: 'Unauthorized chat session access' });
            }

            db.run(
                `UPDATE chat_sessions SET status = 'live', updated_at = CURRENT_TIMESTAMP, last_message_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [sessionId],
                (updateErr) => {
                    if (updateErr) {
                        return res.status(500).json({ error: 'Failed to request live support' });
                    }

                    db.run(
                        `INSERT INTO chat_messages (session_id, sender_type, message, read_by_admin, read_by_client)
                         VALUES (?, 'system', ?, 0, 1)`,
                        [sessionId, 'Client requested live customer support.'],
                        (messageErr) => {
                            if (messageErr) {
                                return res.status(500).json({ error: 'Failed to add live support request message' });
                            }

                            res.json({ success: true, status: 'live' });
                        }
                    );
                }
            );
        }
    );
});

app.post('/api/chat/messages', (req, res) => {
    const { sessionId, clientId, senderType, message } = req.body;

    if (!sessionId || !clientId || !message) {
        return res.status(400).json({ error: 'sessionId, clientId, and message are required' });
    }

    if (!['client', 'ai'].includes(senderType)) {
        return res.status(400).json({ error: 'Invalid sender type' });
    }

    const trimmedMessage = String(message).trim();
    if (!trimmedMessage) {
        return res.status(400).json({ error: 'Message cannot be empty' });
    }

    db.get(
        `SELECT * FROM chat_sessions WHERE id = ?`,
        [sessionId],
        (sessionErr, session) => {
            if (sessionErr || !session) {
                return res.status(404).json({ error: 'Chat session not found' });
            }

            if (session.client_id !== clientId) {
                return res.status(403).json({ error: 'Unauthorized chat session access' });
            }

            const readByAdmin = senderType === 'client' ? 0 : 1;
            const readByClient = 1;

            db.run(
                `INSERT INTO chat_messages (session_id, sender_type, message, read_by_admin, read_by_client)
                 VALUES (?, ?, ?, ?, ?)`,
                [sessionId, senderType, trimmedMessage, readByAdmin, readByClient],
                function(insertErr) {
                    if (insertErr) {
                        return res.status(500).json({ error: 'Failed to save chat message' });
                    }

                    db.run(
                        `UPDATE chat_sessions
                         SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [sessionId]
                    );

                            db.get(
                                `SELECT * FROM chat_messages WHERE id = ?`,
                                [this.lastID],
                                (getErr, createdMessage) => {
                                    if (getErr || !createdMessage) {
                                        return res.status(500).json({ error: 'Failed to load chat message' });
                                    }

                                    if (senderType === 'client') {
                                        void dispatchAdminNotification('ai_chat', {
                                            sessionId: session.id,
                                            clientId: session.client_id,
                                            customerName: session.customer_name || null,
                                            trackingNumber: session.tracking_number || null,
                                            status: session.status || 'ai',
                                            message: trimmedMessage
                                        });
                                    }

                                    res.json({ success: true, message: toChatMessagePayload(createdMessage) });
                                }
                            );
                }
            );
        }
    );
});

app.get('/api/chat/messages/:sessionId', (req, res) => {
    const sessionId = parseInt(req.params.sessionId, 10);
    const afterId = parseInt(req.query.afterId || '0', 10);
    const clientId = req.query.clientId ? String(req.query.clientId) : '';
    const shouldMarkRead = String(req.query.markRead || '1') !== '0';
    const adminAuth = getOptionalAdminAuth(req);

    if (!sessionId) {
        return res.status(400).json({ error: 'Invalid session ID' });
    }

    db.get(
        `SELECT * FROM chat_sessions WHERE id = ?`,
        [sessionId],
        (sessionErr, session) => {
            if (sessionErr || !session) {
                return res.status(404).json({ error: 'Chat session not found' });
            }

            if (!adminAuth && session.client_id !== clientId) {
                return res.status(403).json({ error: 'Unauthorized chat session access' });
            }

            db.all(
                `SELECT * FROM chat_messages WHERE session_id = ? AND id > ? ORDER BY id ASC`,
                [sessionId, afterId],
                (messagesErr, rows) => {
                    if (messagesErr) {
                        return res.status(500).json({ error: 'Failed to load chat messages' });
                    }

                    if (shouldMarkRead) {
                        if (adminAuth) {
                            db.run(
                                `UPDATE chat_messages SET read_by_admin = 1
                                 WHERE session_id = ? AND sender_type = 'client' AND read_by_admin = 0`,
                                [sessionId]
                            );
                        } else {
                            db.run(
                                `UPDATE chat_messages SET read_by_client = 1
                                 WHERE session_id = ? AND sender_type = 'admin' AND read_by_client = 0`,
                                [sessionId]
                            );
                        }
                    }

                    res.json({
                        success: true,
                        session: toChatSessionPayload(session),
                        messages: (rows || []).map(toChatMessagePayload)
                    });
                }
            );
        }
    );
});

app.get('/api/chat/sessions', verifyToken, (req, res) => {
    db.all(
        `SELECT
            s.*,
            (SELECT message FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS last_message,
            (SELECT sender_type FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id AND m.sender_type = 'client' AND m.read_by_admin = 0) AS unread_count
         FROM chat_sessions s
         ORDER BY unread_count DESC, s.last_message_at DESC`,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to load chat sessions' });
            }

            res.json({
                success: true,
                sessions: (rows || []).map(toChatSessionPayload)
            });
        }
    );
});

app.get('/api/chat/unread-count', verifyToken, (req, res) => {
    db.get(
        `SELECT COUNT(*) AS unread_count
         FROM chat_messages
         WHERE sender_type = 'client' AND read_by_admin = 0`,
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to load unread count' });
            }

            res.json({ success: true, unreadCount: Number(row?.unread_count || 0) });
        }
    );
});

app.post('/api/chat/sessions/:id/reply', verifyToken, (req, res) => {
    const sessionId = parseInt(req.params.id, 10);
    const message = String(req.body.message || '').trim();

    if (!sessionId) {
        return res.status(400).json({ error: 'Invalid session ID' });
    }

    if (!message) {
        return res.status(400).json({ error: 'Reply message is required' });
    }

    db.get(
        `SELECT * FROM chat_sessions WHERE id = ?`,
        [sessionId],
        (sessionErr, session) => {
            if (sessionErr || !session) {
                return res.status(404).json({ error: 'Chat session not found' });
            }

            db.run(
                `INSERT INTO chat_messages (session_id, sender_type, message, read_by_admin, read_by_client)
                 VALUES (?, 'admin', ?, 1, 0)`,
                [sessionId, message],
                function(insertErr) {
                    if (insertErr) {
                        return res.status(500).json({ error: 'Failed to send reply' });
                    }

                    db.run(
                        `UPDATE chat_sessions
                         SET status = 'live', last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [sessionId],
                        (updateErr) => {
                            if (updateErr) {
                                return res.status(500).json({ error: 'Failed to update chat session' });
                            }

                            db.get(
                                `SELECT * FROM chat_messages WHERE id = ?`,
                                [this.lastID],
                                (getErr, createdMessage) => {
                                    if (getErr || !createdMessage) {
                                        return res.status(500).json({ error: 'Failed to load reply message' });
                                    }

                                    res.json({
                                        success: true,
                                        message: toChatMessagePayload(createdMessage)
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

app.post('/api/chat/sessions/:id/status', verifyToken, (req, res) => {
    const sessionId = parseInt(req.params.id, 10);
    const status = String(req.body.status || '').toLowerCase();

    if (!sessionId) {
        return res.status(400).json({ error: 'Invalid session ID' });
    }

    if (!CHAT_SESSION_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid chat status' });
    }

    db.run(
        `UPDATE chat_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, sessionId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update chat status' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Chat session not found' });
            }

            res.json({ success: true, status });
        }
    );
});

// =====================================================
// ADMIN NOTIFICATION SETTINGS
// =====================================================

app.get('/api/notifications/settings', verifyToken, (req, res) => {
    loadNotificationSettings((err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to load notification settings' });
        }

        const payload = toNotificationSettingsPayload(row);

        res.json({
            success: true,
            settings: {
                telegram_enabled: payload.telegramEnabled ? 1 : 0,
                telegram_bot_token: payload.telegramBotToken,
                telegram_chat_id: payload.telegramChatId,
                intergram_enabled: payload.intergramEnabled ? 1 : 0,
                intergram_webhook_url: payload.intergramWebhookUrl,
                notify_pending_orders: payload.notifyPendingOrders ? 1 : 0,
                notify_ai_chats: payload.notifyAiChats ? 1 : 0,
                updated_at: payload.updatedAt || null
            }
        });
    });
});

app.post('/api/notifications/settings', verifyToken, (req, res) => {
    const telegramEnabled = parseBooleanFlag(
        req.body.telegramEnabled ?? req.body.telegram_enabled,
        false
    );
    const telegramBotToken = String(
        req.body.telegramBotToken ?? req.body.telegram_bot_token ?? ''
    ).trim();
    const telegramChatId = String(
        req.body.telegramChatId ?? req.body.telegram_chat_id ?? ''
    ).trim();
    const intergramEnabled = parseBooleanFlag(
        req.body.intergramEnabled ?? req.body.intergram_enabled,
        false
    );
    const intergramWebhookUrl = String(
        req.body.intergramWebhookUrl
        ?? req.body.intergram_webhook_url
        ?? req.body.intergramChatId
        ?? req.body.intergram_chat_id
        ?? ''
    ).trim();
    const notifyPendingOrders = parseBooleanFlag(
        req.body.notifyPendingOrders ?? req.body.notify_pending_orders,
        true
    );
    const notifyAiChats = parseBooleanFlag(
        req.body.notifyAiChats ?? req.body.notify_ai_chats,
        true
    );

    if (telegramEnabled && (!telegramBotToken || !telegramChatId)) {
        return res.status(400).json({
            error: 'Telegram Bot Token and Chat ID are required when Telegram notifications are enabled.'
        });
    }

    if (intergramEnabled && !intergramWebhookUrl) {
        return res.status(400).json({
            error: 'Intergram Chat ID (or webhook URL) is required when Intergram notifications are enabled.'
        });
    }

    if (intergramEnabled && !/^https?:\/\//i.test(intergramWebhookUrl) && !telegramBotToken) {
        return res.status(400).json({
            error: 'BotFather token is required when Intergram target is a chat ID.'
        });
    }

    db.run(
        `INSERT INTO notification_settings (
            id,
            telegram_enabled,
            telegram_bot_token,
            telegram_chat_id,
            intergram_enabled,
            intergram_webhook_url,
            notify_pending_orders,
            notify_ai_chats,
            updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            telegram_enabled = excluded.telegram_enabled,
            telegram_bot_token = excluded.telegram_bot_token,
            telegram_chat_id = excluded.telegram_chat_id,
            intergram_enabled = excluded.intergram_enabled,
            intergram_webhook_url = excluded.intergram_webhook_url,
            notify_pending_orders = excluded.notify_pending_orders,
            notify_ai_chats = excluded.notify_ai_chats,
            updated_at = CURRENT_TIMESTAMP`,
        [
            telegramEnabled ? 1 : 0,
            telegramBotToken,
            telegramChatId,
            intergramEnabled ? 1 : 0,
            intergramWebhookUrl,
            notifyPendingOrders ? 1 : 0,
            notifyAiChats ? 1 : 0
        ],
        (err) => {
            if (err) {
                console.error('Failed to save notification settings:', err.message);
                return res.status(500).json({ error: 'Failed to save notification settings' });
            }

            loadNotificationSettings((loadErr, settingsRow) => {
                if (loadErr) {
                    return res.status(500).json({ error: 'Settings were saved but could not be reloaded' });
                }

                const payload = toNotificationSettingsPayload(settingsRow);

                res.json({
                    success: true,
                    message: 'Notification settings saved successfully',
                    settings: {
                        telegram_enabled: payload.telegramEnabled ? 1 : 0,
                        telegram_bot_token: payload.telegramBotToken,
                        telegram_chat_id: payload.telegramChatId,
                        intergram_enabled: payload.intergramEnabled ? 1 : 0,
                        intergram_webhook_url: payload.intergramWebhookUrl,
                        notify_pending_orders: payload.notifyPendingOrders ? 1 : 0,
                        notify_ai_chats: payload.notifyAiChats ? 1 : 0,
                        updated_at: payload.updatedAt || null
                    }
                });
            });
        }
    );
});

app.post('/api/notifications/test', verifyToken, async (req, res) => {
    const type = String(req.body.type || 'pending_order').toLowerCase();

    if (!['pending_order', 'ai_chat'].includes(type)) {
        return res.status(400).json({ error: 'Invalid test notification type' });
    }

    const payload = type === 'pending_order'
        ? {
            orderId: 'TEST-ORDER',
            trackingNumber: 'TEST-TRACKING',
            fullName: 'Test Customer',
            contactNumber: '+639000000000',
            packageName: 'Starter',
            quantity: 1,
            totalPrice: 5800,
            status: 'pending'
        }
        : {
            sessionId: 'TEST-SESSION',
            clientId: 'TEST-CLIENT',
            customerName: 'Test Chat User',
            trackingNumber: 'TEST-TRACKING',
            status: 'ai',
            message: 'This is a sample AI chat notification from CYNETWORK dashboard test.'
        };

    const result = await dispatchAdminNotification(type, payload, { force: true });
    res.json({ success: true, result });
});

// =====================================================
// SALES ANALYTICS REPORT
// =====================================================

app.get('/api/reports/sales', verifyToken, (req, res) => {
    db.get(
        `SELECT
            COUNT(*) AS total_orders,
            COALESCE(SUM(CAST(total_price AS INTEGER)), 0) AS gross_sales,
            COALESCE(SUM(CAST(quantity AS INTEGER)), 0) AS total_units,
            COALESCE(SUM(CASE WHEN date(created_at, 'localtime') = date('now', 'localtime') THEN CAST(total_price AS INTEGER) ELSE 0 END), 0) AS today_sales,
            COALESCE(SUM(CASE WHEN date(created_at, 'localtime') = date('now', 'localtime') THEN 1 ELSE 0 END), 0) AS today_orders,
            COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime') THEN CAST(total_price AS INTEGER) ELSE 0 END), 0) AS month_sales,
            COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime') THEN 1 ELSE 0 END), 0) AS month_orders
        FROM orders`,
        (summaryErr, summaryRow) => {
            if (summaryErr) {
                return res.status(500).json({ error: 'Failed to load sales summary' });
            }

            db.all(
                `SELECT
                    package_name,
                    COUNT(*) AS order_count,
                    COALESCE(SUM(CAST(quantity AS INTEGER)), 0) AS units_sold,
                    COALESCE(SUM(CAST(total_price AS INTEGER)), 0) AS sales_amount
                 FROM orders
                 GROUP BY package_name
                 ORDER BY sales_amount DESC`,
                (packageErr, packageRows) => {
                    if (packageErr) {
                        return res.status(500).json({ error: 'Failed to load package analytics' });
                    }

                    db.all(
                        `SELECT
                            date(created_at, 'localtime') AS report_date,
                            COUNT(*) AS order_count,
                            COALESCE(SUM(CAST(quantity AS INTEGER)), 0) AS units_sold,
                            COALESCE(SUM(CAST(total_price AS INTEGER)), 0) AS sales_amount
                         FROM orders
                         WHERE date(created_at, 'localtime') >= date('now', '-6 day', 'localtime')
                         GROUP BY date(created_at, 'localtime')
                         ORDER BY report_date ASC`,
                        (trendErr, trendRows) => {
                            if (trendErr) {
                                return res.status(500).json({ error: 'Failed to load sales trend report' });
                            }

                            const totalOrders = Number(summaryRow?.total_orders || 0);
                            const grossSales = Number(summaryRow?.gross_sales || 0);

                            res.json({
                                success: true,
                                summary: {
                                    totalOrders,
                                    grossSales,
                                    totalUnits: Number(summaryRow?.total_units || 0),
                                    todaySales: Number(summaryRow?.today_sales || 0),
                                    todayOrders: Number(summaryRow?.today_orders || 0),
                                    monthSales: Number(summaryRow?.month_sales || 0),
                                    monthOrders: Number(summaryRow?.month_orders || 0),
                                    averageOrderValue: totalOrders > 0 ? Math.round(grossSales / totalOrders) : 0
                                },
                                packageBreakdown: (packageRows || []).map((row) => ({
                                    packageName: row.package_name,
                                    orderCount: Number(row.order_count || 0),
                                    unitsSold: Number(row.units_sold || 0),
                                    salesAmount: Number(row.sales_amount || 0)
                                })),
                                dailyTrend: (trendRows || []).map((row) => ({
                                    reportDate: row.report_date,
                                    orderCount: Number(row.order_count || 0),
                                    unitsSold: Number(row.units_sold || 0),
                                    salesAmount: Number(row.sales_amount || 0)
                                }))
                            });
                        }
                    );
                }
            );
        }
    );
});

// =====================================================
// ADMIN DASHBOARD STATS
// =====================================================

app.get('/api/stats', verifyToken, (req, res) => {
    db.all(
        `SELECT 
            (SELECT COUNT(*) FROM orders) as total_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'approved') as approved_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'delivery') as delivery_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'rejected') as rejected_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'completed') as completed_orders,
            (SELECT COUNT(*) FROM orders WHERE status = 'cancelled') as cancelled_orders`,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(rows[0] || {});
        }
    );
});

// =====================================================
// IMAGE MANAGEMENT
// =====================================================

app.post('/api/images/upload', verifyToken, (req, res) => {
    const { packageId, image } = req.body;
    
    if (!packageId || !image) {
        return res.status(400).json({ error: 'Missing package ID or image' });
    }
    
    // Validate package ID
    if (![1, 2, 3].includes(parseInt(packageId))) {
        return res.status(400).json({ error: 'Invalid package ID' });
    }
    
    try {
        const mimeMatch = image.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/);
        if (!mimeMatch) {
            return res.status(400).json({ error: 'Invalid image format' });
        }

        let extension = mimeMatch[1].toLowerCase();
        if (extension === 'jpeg') {
            extension = 'jpg';
        }

        const allowedExtensions = ['png', 'jpg', 'webp'];
        if (!allowedExtensions.includes(extension)) {
            extension = 'png';
        }

        // Convert base64 to buffer
        const base64Data = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        ensureUploadedPackageImagesDir();

        // Remove any old uploaded image for this package before saving the new one.
        fs.readdirSync(uploadedPackageImagesDir)
            .filter((fileName) => fileName.startsWith(`package${packageId}.`))
            .forEach((fileName) => {
                fs.unlinkSync(path.join(uploadedPackageImagesDir, fileName));
            });

        const imagePath = path.join(uploadedPackageImagesDir, `package${packageId}.${extension}`);
        
        fs.writeFileSync(imagePath, imageBuffer);
        
        res.json({
            success: true,
            message: 'Image uploaded successfully',
            path: `/api/images/package/${packageId}`
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

// Serve package images for both admin and client website
app.get('/api/images/package/:packageId', (req, res) => {
    const packageId = parseInt(req.params.packageId, 10);
    if (![1, 2, 3].includes(packageId)) {
        return res.status(400).json({ error: 'Invalid package ID' });
    }

    const uploadedImagePath = getUploadedPackageImagePath(packageId);
    if (uploadedImagePath && fs.existsSync(uploadedImagePath)) {
        return res.sendFile(uploadedImagePath);
    }

    const fallbackRelativePath = defaultPackageImages[packageId];
    const fallbackAbsolutePath = path.join(clientPublicDir, fallbackRelativePath);
    if (fs.existsSync(fallbackAbsolutePath)) {
        return res.sendFile(fallbackAbsolutePath);
    }

    return res.status(404).json({ error: 'Image not found' });
});

// Backward-compatible static image route
app.get('/package-images/:filename', (req, res) => {
    const imagePath = path.join(uploadedPackageImagesDir, req.params.filename);
    if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
    } else {
        res.status(404).json({ error: 'Image not found' });
    }
});

app.get('/health', (req, res) => {
    const databaseExists = fs.existsSync(dbPath);
    const uploadsDirExists = fs.existsSync(uploadedPackageImagesDir);
    let databaseSizeBytes = null;
    let databaseStatError = null;

    if (databaseExists) {
        try {
            databaseSizeBytes = fs.statSync(dbPath).size;
        } catch (error) {
            databaseStatError = String(error.message || error);
        }
    }

    res.status(200).json({
        ok: true,
        service: 'cynetwork-pisowifi-backend',
        time: new Date().toISOString(),
        storage: {
            databasePath: dbPath,
            databaseExists,
            databaseSizeBytes,
            databaseStatError,
            uploadsDir: uploadedPackageImagesDir,
            uploadsDirExists
        },
        accountBackup: {
            enabled: Boolean(accountBackupCollection),
            configured: Boolean(accountBackupMongoUri),
            provider: 'mongodb',
            connectionMode: accountBackupConnectionMode,
            database: accountBackupMongoDbName,
            collection: accountBackupMongoCollectionName,
            srvFallbackEnabled: accountBackupMongoSrvFallbackEnabled,
            dnsServers: accountBackupMongoDnsServers,
            hydratedFromRemote: accountBackupHydratedFromRemote,
            lastSyncedAt: accountBackupLastSyncedAt,
            lastSyncReason: accountBackupLastSyncReason || null,
            lastSyncError: accountBackupLastSyncError || null
        }
    });
});

// =====================================================
// START SERVER
// =====================================================

startupReady.finally(() => {
    if (startupGateTimer) {
        clearTimeout(startupGateTimer);
        startupGateTimer = null;
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
    ========================================
    CYNETWORK PISOWIFI Admin Backend
    ========================================
    Server running on port: ${PORT}
    Client Website: / 
    Admin Dashboard: /admin
    Health Check: /health
    Environment: ${process.env.NODE_ENV || 'development'}
    
    Default Credentials:
    Username: ${DEFAULT_ADMIN_USERNAME}
    Password: ${DEFAULT_ADMIN_PASSWORD}
    
    API Endpoints:
    POST   /api/login
    POST   /api/admin/change-password
    POST   /api/client/register
    POST   /api/client/login
    POST   /api/client/forgot-password
    GET    /api/client/me
    GET    /api/client/referral/:code
    GET    /api/client/redemptions
    POST   /api/client/redeem-referral
    GET    /api/orders
    GET    /api/orders/:id
    POST   /api/orders/:id/approve
    POST   /api/orders/:id/reject
    POST   /api/orders/:id/status
    POST   /api/submit-order
    GET    /api/track-order/:id
    POST   /api/chat/session
    POST   /api/chat/live-support-request
    POST   /api/chat/messages
    GET    /api/chat/messages/:sessionId
    GET    /api/chat/sessions
    GET    /api/chat/unread-count
    POST   /api/chat/sessions/:id/reply
    POST   /api/chat/sessions/:id/status
    GET    /api/notifications/settings
    POST   /api/notifications/settings
    POST   /api/notifications/test
    GET    /api/stats
    GET    /api/reports/sales
    GET    /api/images/package/:packageId
    POST   /api/images/upload
    ========================================
    `);
    });
});
