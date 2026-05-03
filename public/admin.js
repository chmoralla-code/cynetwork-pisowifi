(function(){
  const socket = io();
  const tbody = document.querySelector('#ordersTable tbody');
  let currentChatOrder = null;

  function fetchOrders(){
    fetch('/api/orders').then(r=>r.json()).then(arr=>{ renderOrders(arr); }).catch(()=>{});
  }

  function renderOrders(arr){
    tbody.innerHTML='';
    if(!arr.length) { tbody.innerHTML='<tr><td colspan="8">No orders</td></tr>'; return; }
    arr.forEach(o => addOrUpdateRow(o));
  }

  function addOrUpdateRow(o){
    const id = 'order-' + o.orderId;
    let tr = document.getElementById(id);
    if(!tr){ tr = document.createElement('tr'); tr.id = id; tbody.appendChild(tr); }
    const proofHtml = o.proof ? ('<a href="'+o.proof+'" target="_blank"><img src="'+o.proof+'" style="height:36px;border-radius:6px"></a>') : '-';
    tr.innerHTML = '<td><strong>'+o.orderId+'</strong></td>'+
                   '<td>'+o.package+'</td>'+
                   '<td>₱'+o.price+'</td>'+
                   '<td>'+o.fullName+'</td>'+
                   '<td>'+ (o.contactNumber || '-') +'</td>'+
                   '<td>'+ proofHtml +'</td>'+
                   '<td><span class="status-badge">'+o.status+'</span></td>'+
                   '<td>'+
                     (o.status==='pending'?'<button class="btn-action btn-approve">✅ Approve</button>':'<button class="btn-action btn-ship">📦 Ship</button>')+
                     ' <button class="btn-action btn-chat">💬 Chat</button>'+
                     ' <button class="btn-action btn-delete">🗑️ Delete</button>'+
                   '</td>';
  }

  // Delegated actions
  document.addEventListener('click', function(e){
    const el = e.target;
    if(!el) return;
    const tr = el.closest('tr'); if(!tr) return;
    const orderId = tr.id.replace('order-','');

    if(el.classList.contains('btn-approve')){
      if(!confirm('Approve this order?')) return;
      fetch('/api/orders/' + orderId, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: 'approved' }) }).then(r=>r.json()).then(()=>{/* handled by socket */});
    }

    if(el.classList.contains('btn-ship')){
      if(!confirm('Mark as shipped?')) return;
      fetch('/api/orders/' + orderId, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: 'shipped' }) }).then(r=>r.json()).then(()=>{});
    }

    if(el.classList.contains('btn-delete')){
      if(!confirm('Delete order?')) return;
      fetch('/api/orders/' + orderId, { method: 'DELETE' }).then(r=>r.json()).then(()=>{});
    }

    if(el.classList.contains('btn-chat')){
      openChat(orderId);
    }
  });

  // Chat modal logic (reuse modal from admin.html)
  const chatModal = document.getElementById('chatModal');
  const chatOrderIdEl = document.getElementById('chatOrderId');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const closeChat = document.getElementById('closeChat');

  function openChat(orderId){
    currentChatOrder = orderId; chatOrderIdEl.textContent = orderId; chatMessages.innerHTML=''; chatModal.classList.remove('hidden'); socket.emit('join', orderId);
    fetch('/api/chats/' + orderId).then(r=>r.json()).then(arr=>{ arr.forEach(m=>appendMessage(m.from,m.text)); });
  }
  function closeChatModal(){ currentChatOrder=null; chatModal.classList.add('hidden'); chatMessages.innerHTML=''; }
  closeChat.addEventListener('click', closeChatModal);
  chatForm.addEventListener('submit', function(e){ e.preventDefault(); const text = chatInput.value.trim(); if(!text || !currentChatOrder) return; socket.emit('send-message', { orderId: currentChatOrder, from: 'Admin', text }); appendMessage('Admin', text, true); chatInput.value=''; });

  function appendMessage(from,text,me){ const d = document.createElement('div'); d.className='message' + (me? ' me':''); d.innerHTML='<strong>'+from+'</strong><div>'+text+'</div>'; chatMessages.appendChild(d); chatMessages.scrollTop = chatMessages.scrollHeight; }

  // socket events
  socket.on('new-order', function(o){ addOrUpdateRow(o); });
  socket.on('order-updated', function(o){ addOrUpdateRow(o); });
  socket.on('status-updated', function(o){ addOrUpdateRow(o); });
  socket.on('order-deleted', function(id){ const el = document.getElementById('order-'+id); if(el) el.remove(); });
  socket.on('new-message', function(payload){ if(payload && payload.orderId === currentChatOrder){ appendMessage(payload.message.from, payload.message.text); } });

  fetchOrders();
})();
