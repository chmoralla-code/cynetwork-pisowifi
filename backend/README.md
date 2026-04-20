# CYNETWORK PISOWIFI - SETUP GUIDE

## Project Structure

```
CYNETWORK PISOWIFI/
├── website/                    # Customer website
│   ├── index.html             # Main website
│   ├── styles.css             # Website styles
│   ├── script.js              # Website functionality
│   └── assets/images/         # Product images
│
└── backend/                   # Admin backend server
    ├── server.js              # Express server
    ├── package.json           # Dependencies
    ├── pisowifi-admin.db      # SQLite database (auto-created)
    └── public/
        ├── index.html         # Admin dashboard
        ├── admin-styles.css   # Dashboard styles
        └── admin-script.js    # Dashboard functionality
```

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation Steps

#### 1. Install Backend Dependencies

Open PowerShell and navigate to the backend folder:

```powershell
cd "C:\Users\Cyrhiel\Documents\CYNETWORK PISOWIFI\backend"
npm install
```

This will install:
- Express.js (server framework)
- SQLite3 (database)
- bcrypt (password hashing)
- JWT (authentication tokens)
- CORS (cross-origin requests)

#### 2. Start the Backend Server

```powershell
npm start
```

You should see:
```
========================================
CYNETWORK PISOWIFI Admin Backend
========================================
Server running on port: 3000
Client Website: /
Admin Dashboard: /admin
Health Check: /health

Default Credentials:
Username: admin
Password: admin123
```

#### 3. Access the Admin Dashboard

Open your browser and go to:
```
http://localhost:3000/admin
```

Login with:
- **Username:** admin
- **Password:** admin123

#### 4. Open Customer Website

In a separate browser tab, open:
```
http://localhost:3000/
```

## Admin Dashboard Features

### Dashboard Overview
- Total orders count
- Pending orders count
- Approved orders count
- Rejected orders count
- Recent orders list

### Orders Management
- **View All Orders:** See complete list with filters
- **Search:** Find orders by customer name or phone
- **Filter:** Filter by status (pending, approved, rejected, completed)

### Order Review
- View customer details
- Check proof of payment (image)
- WiFi configuration details
- Order timeline

### Order Actions

#### Approve Order
- Verify proof of payment
- Approve order
- Automatically notifies (can be added)
- Automatically sends Philippine SMS for Amazon LEO preorders when status becomes approved/confirmed (when SMS env vars are configured)

#### Reject Order
- Provide rejection reason
- Reason is saved for customer reference

#### Update Status
- Mark approved orders as completed
- Track order lifecycle

### Pending Orders View
- Quick access to all pending orders
- Dedicated section for order review

## API Endpoints

### Authentication
- `POST /api/login` - Admin login

### Client Account & Verification
- `POST /api/client/send-otp` - Send 6-digit OTP for register/forgot password
- `POST /api/client/send-email-code` - Legacy alias for send OTP
- `POST /api/client/register` - Register client account (requires email OTP)
- `POST /api/client/login` - Login client account
- `POST /api/client/forgot-password` - Reset password (requires email OTP)
- `GET /api/client/me` - Get current client profile
- `GET /api/client/referral/:code` - Validate referral code
- `GET /api/client/redemptions` - Get referral redemption history
- `POST /api/client/redeem-referral` - Submit referral redemption request

### Orders (requires authentication)
- `GET /api/orders` - List all orders
- `GET /api/orders/:id` - Get order details
- `POST /api/orders/:id/approve` - Approve order
- `POST /api/orders/:id/reject` - Reject order with reason
- `POST /api/orders/:id/status` - Update order status

### Customer Submission
- `POST /api/submit-order` - Submit new order (from website)

### Statistics
- `GET /api/stats` - Get dashboard statistics

## Database

The SQLite database (`pisowifi-admin.db`) is automatically created on first run and includes:

### Tables

#### admins
- id (primary key)
- username (unique)
- password (hashed)
- email
- created_at

#### orders
- id (primary key)
- package_id, package_name, price, duration
- full_name, contact_number, address
- wifi_name, wifi_password, wifi_rate
- proof_image (binary)
- status (pending, approved, delivery, rejected, completed, cancelled)
- approved_by (admin username)
- rejection_reason
- created_at, updated_at

## 24/7 Cloud Deployment (Render)

This project now includes a Render blueprint file at `../render.yaml` for always-on hosting.

### 1. Push project to GitHub
- Create a GitHub repository with both `website/` and `backend/` folders in the same repo.
- Commit and push your latest code.

### 2. Create service on Render
- In Render, choose **New +** -> **Blueprint**.
- Connect your GitHub repo and deploy.
- Render reads `render.yaml` and creates the web service automatically.

### 3. Production environment values
- `NODE_ENV=production`
- `JWT_SECRET` is auto-generated in the blueprint and kept stable across redeploys (`sync: false`).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_DB_URL` are intentionally placeholders in `render.yaml`; set real values in Render Dashboard before going live.
- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_ANON_KEY=<supabase-publishable-key>`
- `SUPABASE_DB_URL=<supabase-postgres-connection-string>` (prefer the IPv4 pooler URL with `sslmode=require`)
- `STARTUP_READY_TIMEOUT_MS=15000` (optional startup gate timeout in milliseconds)
- `ACCOUNT_BACKUP_MONGODB_URI=<mongodb-connection-string>` (recommended for account durability even if the web service/disk is recreated)
- `ACCOUNT_BACKUP_MONGODB_DB=cynetwork_pisowifi` (optional)
- `ACCOUNT_BACKUP_MONGODB_COLLECTION=client_account_backups` (optional)
- `ACCOUNT_BACKUP_MONGODB_SRV_FALLBACK=true` (optional, retries with DNS seed-list fallback for `mongodb+srv` failures)
- `ACCOUNT_BACKUP_MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1` (optional, DNS servers used by SRV fallback)
- `DATABASE_PATH=/var/data/pisowifi-admin.db`
- `UPLOADS_DIR=/var/data/package-images`
- `SEMAPHORE_API_KEY=<your-semaphore-api-key>` (required for PH SMS sending)
- `SEMAPHORE_SENDER_NAME=CYNETWORK` (optional sender name)
- `AMAZON_LEO_SMS_ENABLED=true`
- `AMAZON_LEO_SMS_PROVIDER=semaphore`
- `EMAIL_VERIFICATION_ENABLED=true`
- `SMTP_HOST=<smtp-host>`
- `SMTP_PORT=587`
- `SMTP_SECURE=false` (set `true` for SSL ports such as 465)
- `SMTP_USER=<smtp-username>`
- `SMTP_PASS=<smtp-password>`
- `SMTP_ALLOW_UNAUTH=false` (set `true` only for trusted relay without auth)
- `SMTP_FROM_EMAIL=<no-reply@your-domain.com>`
- `SMTP_FROM_NAME=CYNETWORK PISOWIFI`
- `ALLOW_DEV_EMAIL_CODE_FALLBACK=true` (local/dev only; allows testing with preview OTP when SMTP is not configured)
- `EMAIL_CODE_TTL_MINUTES=10`
- `EMAIL_CODE_RESEND_COOLDOWN_SECONDS=60`
- `EMAIL_CODE_MAX_ATTEMPTS=5`

### 3.1 Initialize Supabase schema before first deploy
- Open Supabase Dashboard -> SQL Editor.
- Run `../supabase_schema.sql` once so all required tables exist.
- Confirm the `admins` table has a default row or create one manually if needed.

### 4. Persistent storage
- Render mounts a persistent disk at `/var/data`.
- Orders database and uploaded package images stay available across restarts/redeploys.
- Keep using the **same Render service + disk** (do not delete/recreate them) to retain accounts and sessions.
- In production, the backend now automatically falls back to `/var/data/pisowifi-admin.db` and `/var/data/package-images` when env vars are missing, so it avoids writing to temporary container storage.
- Client accounts/referral tables are also mirrored to MongoDB when `ACCOUNT_BACKUP_MONGODB_URI` is set, then auto-restored if local SQLite storage is ever reset.

### 5. Verify deployment
- Open `<your-render-url>/health` and confirm `ok: true`.
- Check `storage.databasePath` in `/health` and confirm it points to `/var/data/pisowifi-admin.db`.
- Check `/health -> accountBackup.enabled` is `true`, `connectionMode` is `srv`, `standard`, or `srv-seedlist-fallback`, and `lastSyncedAt` has a timestamp.
- Open `<your-render-url>/` for customer site.
- Open `<your-render-url>/admin` for admin dashboard.
- Login with default admin credentials, then change the password.

## Security Notes

1. **Change Default Password:** After first login, change the default admin password
2. **Environment Variables:** In production, set `JWT_SECRET` to a strong random value
3. **HTTPS:** Use HTTPS in production
4. **Database Backup:** Regularly backup the SQLite database file

## Troubleshooting

### Port 3000 Already in Use
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual number)
taskkill /PID <PID> /F
```

### Database Locked Error
- Close all admin dashboard instances
- Restart the server

### Orders Not Appearing
- Ensure backend server is running
- Check browser console for API errors
- Verify CORS is enabled

### Login Fails
- Clear browser cookies and localStorage
- Verify server is running (`http://localhost:3000/admin`)
- Check credentials (default: admin/admin123)

### MongoDB `querySrv ECONNREFUSED`
- Keep `ACCOUNT_BACKUP_MONGODB_URI` set to your Atlas URI.
- Enable `ACCOUNT_BACKUP_MONGODB_SRV_FALLBACK=true` (default) so the server retries using DNS seed-list resolution.
- Optionally set `ACCOUNT_BACKUP_MONGODB_DNS_SERVERS` to stable DNS resolvers (example: `8.8.8.8,1.1.1.1`).
- Check `/health -> accountBackup.connectionMode`; `srv-seedlist-fallback` means fallback is active.

## Next Steps

1. ✅ Install dependencies
2. ✅ Start backend server
3. ✅ Login to admin dashboard
4. ✅ Test order submission from website
5. ✅ Review and approve/reject orders
6. 🔄 Customize admin password
7. 🔄 Set up email notifications (optional)

---

**Support:** For issues, check the browser console (F12) and server logs.
