CYNETWORK PISOWIFI — Demo

Quick start:

1. Open a terminal in the project folder:

```powershell
cd "C:\Users\Cyrhiel\Documents\GAME CODE PRACTICE\cynetwork-pisowifi"
npm install
npm start
```

2. Open the site:
- Customer: http://localhost:4000/
- Admin: http://localhost:4000/admin.html

Notes:
- This demo uses an in-memory store (no database). Orders and chats are reset when the server restarts.
- The server uses Express + Socket.IO for realtime chat and order events.
- To deploy: push to a Git remote and use Railway, Render, or any Node host. Bind a domain and point DNS to the host.
