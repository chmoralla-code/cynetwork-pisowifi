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
- `DATABASE_PATH=/var/data/pisowifi-admin.db`
- `UPLOADS_DIR=/var/data/package-images`
- `SEMAPHORE_API_KEY=<your-semaphore-api-key>` (required for PH SMS sending)
- `SEMAPHORE_SENDER_NAME=CYNETWORK` (optional sender name)
- `AMAZON_LEO_SMS_ENABLED=true`
- `AMAZON_LEO_SMS_PROVIDER=semaphore`

### 4. Persistent storage
- Render mounts a persistent disk at `/var/data`.
- Orders database and uploaded package images stay available across restarts/redeploys.
- Keep using the **same Render service + disk** (do not delete/recreate them) to retain accounts and sessions.

### 5. Verify deployment
- Open `<your-render-url>/health` and confirm `ok: true`.
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
