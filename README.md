# CYNETWORK PISOWIFI — Advanced Admin Dashboard

This project features a fully cloned and enhanced admin dashboard matching the design of the reference Render site.

## Key Features
- **Modern Dashboard**: Light-themed, data-rich overview with order status metrics.
- **Sales Analytics**: Gross sales, today's sales, and unit tracking.
- **JuanFi Integration**: Real-time income analytics for PisoWiFi machines.
- **Client Management**: Database of registered clients and balances.
- **AI Chat Monitor**: Real-time notification tracking.

## Deployment & Setup

### 1. Vercel
The project is configured for Vercel deployment. Serverless functions in `/api` handle the backend logic.
- Aliased: https://cynetworkpisowifi.vercel.app

### 2. Supabase
You must apply the updated schema to your Supabase project:
1. Copy the contents of `supabase_schema.sql`.
2. Go to your **Supabase Dashboard** -> **SQL Editor**.
3. Create a new query, paste the SQL, and click **Run**.
4. Ensure **Realtime** is enabled for `piso_orders`, `piso_chats`, `piso_clients`, and `piso_harvests`.

## Local Development
```powershell
cd cynetwork-pisowifi
npm install
npm start
```
- Customer: http://localhost:4000/
- Admin: http://localhost:4000/admin/index.html
