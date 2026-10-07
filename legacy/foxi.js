(() => {
  const root = document.getElementById('foxi-widget');
  const G = window.GT;
  if (!root || !G) return;

  const ownerRoutes = new Set(['/hoa-don', '/khach-thue', '/hop-dong', '/tien-ich', '/quan-ly-khu-vuc', '/quan-ly-tai-khoan', '/khieu-nai', '/cu-dan', '/tim-phong']);
  let lastComplaintGreeting = '';
  const syncVisibility = () => {
    const route = location.hash.replace(/^#/, '').replace(/\/$/, '') || '/';
    const isTenant = ['\/cu-dan', '\/tim-phong'].includes(route) && G.currentUser?.r === 't';
    const isAdmin = G.currentUser?.r === 'a';
    const visible = !!(window.__isAuth && window.__isAuth() && ownerRoutes.has(route) && isAdmin);
    root.style.display = visible ? 'block' : 'none';
    if (!visible) panel?.classList.remove('open');
    if (route !== '/khieu-nai') panel?.classList.remove('notice');
    const mode = isTenant ? 'tenant' : 'admin';
    if (root.dataset.mode !== mode) {
      root.dataset.mode = mode;
      root.querySelector('.foxi-head strong').textContent = isTenant ? 'Foxi · Trợ lý cư dân' : 'Foxi · Trợ lý chủ nhà';
      root.querySelector('.foxi-head small').textContent = isTenant ? 'Hỗ trợ nhanh thông tin thuê và tiện ích' : 'Hỏi nhanh dữ liệu quản lý trọ';
      root.querySelector('.foxi-suggestions').innerHTML = isTenant
        ? '<button type="button">Tháng này tôi còn hóa đơn nào chưa đóng?</button><button type="button">Lịch tiện ích của tôi</button><button type="button">Thông tin phòng và hợp đồng</button><button type="button">Tôi muốn gửi khiếu nại</button>'
        : '<button type="button">Tháng này phòng nào chưa đóng tiền?</button><button type="button">Phòng nào sắp hết hợp đồng?</button><button type="button">Tổng doanh thu khu A tháng này?</button><button type="button">Liệt kê người thuê chưa cập nhật thông tin lưu trú.</button><button type="button">Nhà nào có tiền điện nước tăng bất thường?</button>';
    }
    if (visible && route === '/khieu-nai') {
      const pending = (G.KN || []).filter(item => (item.status || 'Chờ xử lý') === 'Chờ xử lý').length;
      const greetingKey = route + ':' + pending;
      panel.classList.add('open');
      panel.classList.add('notice');
      panel.setAttribute('aria-hidden', 'false');
      if (lastComplaintGreeting !== greetingKey) {
        addMessage('Foxi đã đọc và sắp xếp các loại khiếu nại. Hiện có tổng ' + pending + ' khiếu nại cần được xử lý ^^', 'bot');
        lastComplaintGreeting = greetingKey;
      }
    }
  };

  const panel = root.querySelector('#foxi-panel');
  const messages = root.querySelector('#foxi-messages');
  const input = root.querySelector('#foxi-input');
  const clean = value => String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s/-]/g, ' ').replace(/\s+/g, ' ').trim();
  const money = value => Number(value || 0).toLocaleString('vi-VN') + ' ₫';
  const date = value => {
    if (!value) return 'chưa có ngày';
    const d = new Date(value + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('vi-VN');
  };
  const currentPeriod = () => {
    const d = new Date();
    return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  };
  const periodIndex = value => {
    const match = String(value || '').match(/^(\d{1,2})\/(\d{4})$/);
    return match ? Number(match[2]) * 12 + Number(match[1]) - 1 : NaN;
  };
  const addMessage = (text, kind) => {
    const el = document.createElement('div');
    el.className = 'foxi-msg ' + kind;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  };
  const tenantName = invoice => {
    const tenant = G.tByC(invoice.cccd);
    return tenant ? tenant.name : 'Chưa có tên khách thuê';
  };
  const tenantAnswer = (q, period) => {
    const t = G.T.find(item => item.cccd === G.currentUser?.cccd) || {};
    if (/khieu nai|phan anh|bao hong|su co/.test(q)) {
      location.hash = '#/cu-dan';
      setTimeout(() => document.querySelector('#v-tenant [data-tenant-open="complaint"]')?.click(), 80);
      return 'Mình đã mở biểu mẫu gửi khiếu nại cho bạn. Hãy chọn loại phản ánh và mô tả vấn đề nhé.';
    }
    if (/dang ky|dat tien ich/.test(q)) {
      document.querySelector('#v-tenant [data-tenant-open="booking"]')?.click();
      return 'Mình đã mở biểu mẫu đăng ký. Bạn chọn tiện ích, ngày và khung giờ phù hợp nhé.';
    }
    if (/vi tri gui xe|bien so xe|xe cua toi/.test(q)) {
      const vehicles = Array.isArray(t.xe) ? t.xe : [];
      if (!vehicles.length) return 'Mình chưa thấy thông tin xe gửi của bạn. Bạn có thể liên hệ chủ trọ để cập nhật nhé.';
      return 'Thông tin gửi xe của bạn:\n' + vehicles.map(item => '• ' + (item.l || 'Xe') + ' · biển số ' + (item.b || '—') + ' · vị trí ' + (item.sl || 'chưa cập nhật')).join('\n');
    }
    if (/lich|tien ich|may giat|gym|bep chung|ho boi/.test(q)) {
      const bookings = (G.B || []).filter(item => item.cccd === t.cccd && item.status !== 'Đã hủy').sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (!bookings.length) return 'Bạn chưa có lượt đăng ký tiện ích nào. Mở mục “Lịch cơ sở vật chất” để chọn khung giờ phù hợp nhé.';
      return 'Lịch tiện ích của bạn:\n' + bookings.slice(0, 6).map(item => '• ' + item.amenity + ' · ' + date(item.date) + ' · ' + item.time + ' · ' + (item.status || 'Đã xác nhận')).join('\n');
    }
    if (/thong tin|hop dong|tien coc|thoi han|phong cua toi/.test(q)) {
      const contract = G.C.find(item => item.cccd === t.cccd && !item.liq);
      const area = G.aOf(t.area);
      return 'Thông tin thuê của bạn:\n• Phòng: ' + (t.room || '—') + (area ? ' · ' + area.n : '') + '\n• Thời hạn: ' + (contract ? date(contract.s) + ' – ' + date(contract.e) : 'chưa có hợp đồng đang hiệu lực') + '\n• Tiền cọc: ' + (contract ? money(contract.dep) : '—');
    }
    if (/hoa don|thanh toan|chua dong|no tien|tien dien|tien nuoc/.test(q)) {
      const invoices = G.I.filter(item => item.cccd === t.cccd && item.per === period);
      if (!invoices.length) return 'Tháng ' + period + ' chưa có hóa đơn nào được ghi nhận cho phòng của bạn.';
      return 'Hóa đơn tháng ' + period + ' của phòng ' + (t.room || '—') + ':\n' + invoices.map(item => '• ' + money(item.total) + ' · ' + (item.st === 'p' ? 'Đã thanh toán' : 'Chưa thanh toán') + (item.due ? ' · hạn ' + date(item.due) : '')).join('\n');
    }
    return 'Mình là Foxi, trợ lý cư dân demo. Bạn có thể hỏi về hóa đơn, lịch tiện ích, thông tin phòng/hợp đồng hoặc nhờ mình mở biểu mẫu khiếu nại.';
  };
  const answer = raw => {
    const q = clean(raw);
    const period = currentPeriod();
    if (G.currentUser?.r === 't') return tenantAnswer(q, period);

    if (/dien/.test(q) && /nuoc/.test(q) && /bat thuong|tang|dot bien|cao hon/.test(q)) {
      const byRoom = new Map();
      G.I.forEach(invoice => {
        const contract = G.C.find(c => c.no === invoice.no);
        const areaCode = invoice.area || contract?.area;
        const idx = periodIndex(invoice.per);
        if (!areaCode || !invoice.room || !Number.isFinite(idx)) return;
        const key = areaCode + '|' + invoice.room + '|' + idx;
        const entry = byRoom.get(key) || { areaCode, room: invoice.room, period: invoice.per, idx, electric: 0, water: 0 };
        entry.electric += Number(invoice.eAmount || 0);
        entry.water += Number(invoice.wAmount || 0);
        byRoom.set(key, entry);
      });
      const months = new Map();
      byRoom.forEach(entry => {
        const key = entry.areaCode + '|' + entry.room;
        if (!months.has(key)) months.set(key, []);
        months.get(key).push(entry);
      });
      const alerts = [];
      months.forEach(entries => {
        entries.sort((a, b) => a.idx - b.idx);
        for (let i = 1; i < entries.length; i++) {
          const before = entries[i - 1], now = entries[i];
          if (now.idx - before.idx !== 1) continue;
          for (const utility of ['electric', 'water']) {
            const increase = now[utility] - before[utility];
            const percent = before[utility] > 0 ? increase / before[utility] : 0;
            if (increase >= 100000 && percent >= 0.5) alerts.push({ before, now, utility, increase, percent });
          }
        }
      });
      if (!alerts.length) return 'Foxi chưa thấy mức tăng bất thường trong các cặp hóa đơn liên tiếp. Hiện mình đánh dấu khi tiền điện hoặc nước tăng ít nhất 50% và 100.000 ₫ so với kỳ trước; cần có dữ liệu của hai kỳ liền nhau để so sánh.';
      alerts.sort((a, b) => b.percent - a.percent);
      const homes = [...new Set(alerts.map(x => G.aOf(x.now.areaCode)?.n || x.now.areaCode))];
      return 'Foxi phát hiện dấu hiệu tiền điện/nước tăng bất thường tại ' + homes.join(', ') + ':\n' + alerts.map(x => {
        const name = x.utility === 'electric' ? 'Tiền điện' : 'Tiền nước';
        return '• ' + (G.aOf(x.now.areaCode)?.n || x.now.areaCode) + ' · phòng ' + x.now.room + ' · ' + name + ': ' + money(x.before[x.utility]) + ' (' + x.before.period + ') → ' + money(x.now[x.utility]) + ' (' + x.now.period + '), tăng ' + Math.round(x.percent * 100) + '%.';
      }).join('\n') + '\nĐây là cảnh báo theo số tiền trên hóa đơn demo; chủ nhà nên kiểm tra chỉ số đồng hồ và thiết bị tại phòng.';
    }

    if (/luu tru|tam tru|tam vang|cap nhat thong tin/.test(q)) {
      const list = G.T.filter(t => (t.tt || 'Chưa đăng ký') !== 'Đã đăng ký');
      if (!list.length) return 'Tất cả người thuê đã cập nhật thông tin đăng ký tạm trú/tạm vắng.';
      return 'Có ' + list.length + ' người thuê chưa cập nhật thông tin lưu trú:\n' + list.map(t =>
        '• ' + t.name + ' · phòng ' + (t.room || '—') + ' · ' + (G.aOf(t.area)?.n || t.area || '—') + ' · ' + (t.status || 'Đang ở')
      ).join('\n');
    }

    if (/chua dong tien|chua thanh toan|chua nop tien|no tien|hoa don chua/.test(q)) {
      const unpaid = G.I.filter(i => i.per === period && i.st !== 'p');
      if (!unpaid.length) return 'Tháng ' + period + ' không có hóa đơn nào còn chưa thanh toán.';
      const total = unpaid.reduce((sum, i) => sum + Number(i.total || 0), 0);
      return 'Tháng ' + period + ' có ' + unpaid.length + ' phòng chưa đóng tiền (tổng ' + money(total) + '):\n' + unpaid.map(i =>
        '• Phòng ' + i.room + ' · ' + tenantName(i) + ' · ' + money(i.total) + ' · hạn ' + date(i.due)
      ).join('\n');
    }

    if (/sap het hop dong|sap het han|hop dong sap het|gan het han/.test(q)) {
      const list = G.C.filter(c => G.cSt(c) === 'Sắp hết hạn');
      if (!list.length) return 'Hiện không có hợp đồng nào sắp hết hạn trong 30 ngày tới.';
      return 'Có ' + list.length + ' hợp đồng sắp hết hạn trong 30 ngày tới:\n' + list.map(c =>
        '• ' + c.no + ' · phòng ' + c.room + ' · ' + (G.tByC(c.cccd)?.name || 'Chưa có tên khách thuê') + ' · hết hạn ' + date(c.e)
      ).join('\n');
    }

    if (/doanh thu|thu duoc|tong tien|bao nhieu tien/.test(q)) {
      const areaMatch = q.match(/(?:khu(?: vuc)?|toa|block)\s+([a-z0-9]+)/);
      const token = areaMatch && areaMatch[1];
      const areas = token ? G.A.filter(a => clean(a.pf) === token || clean(a.c) === token || clean(a.n).split(' ').includes(token)) : G.A;
      if (token && !areas.length) return 'Foxi chưa tìm thấy khu vực “' + token.toUpperCase() + '”. Bạn thử nhập tên tòa hoặc mã khu vực nhé.';
      const codes = new Set(areas.map(a => a.c));
      const invoices = G.I.filter(i => {
        const c = G.C.find(x => x.no === i.no);
        return i.per === period && codes.has(i.area || c?.area);
      });
      const billed = invoices.reduce((sum, i) => sum + Number(i.total || 0), 0);
      const paid = invoices.filter(i => i.st === 'p').reduce((sum, i) => sum + Number(i.total || 0), 0);
      const names = areas.map(a => a.n).join(', ') || 'toàn bộ khu vực';
      return 'Tổng hợp tháng ' + period + ' · ' + names + ':\n• Tổng hóa đơn: ' + money(billed) + '\n• Đã thu: ' + money(paid) + '\n• Còn phải thu: ' + money(billed - paid) + '\n(' + invoices.length + ' hóa đơn trong dữ liệu demo.)';
    }

    return 'Foxi đang ở chế độ demo và có thể tra cứu:\n• Phòng chưa đóng tiền tháng này\n• Hợp đồng sắp hết hạn\n• Doanh thu theo khu vực trong tháng này\n• Người thuê chưa cập nhật thông tin lưu trú\n• Điện/nước tăng bất thường so với kỳ liền trước\n\nBạn có thể chọn một câu hỏi gợi ý bên dưới.';
  };

  const submit = question => {
    const q = String(question || '').trim();
    if (!q) return;
    addMessage(q, 'user');
    input.value = '';
    addMessage(answer(q), 'bot');
  };

  const residentLog = document.querySelector('#residentFoxiLog');
  const residentInput = document.querySelector('#residentFoxiInput');
  const addResidentMessage = (text, kind) => {
    if (!residentLog) return;
    const row = document.createElement('div');
    row.className = 'resident-foxi-msg' + (kind === 'me' ? ' me' : '');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = kind === 'me' ? 'Bạn' : 'Foxi';
    const content = document.createElement('span');
    content.textContent = text;
    bubble.append(who, content);
    row.appendChild(bubble);
    residentLog.appendChild(row);
    residentLog.scrollTop = residentLog.scrollHeight;
  };
  const submitResidentQuestion = question => {
    const text = String(question || '').trim();
    if (!text || G.currentUser?.r !== 't') return;
    addResidentMessage(text, 'me');
    if (residentInput) residentInput.value = '';
    addResidentMessage(tenantAnswer(clean(text), currentPeriod()), 'foxi');
  };
  document.querySelector('#residentFoxiForm')?.addEventListener('submit', event => {
    event.preventDefault();
    submitResidentQuestion(residentInput?.value);
  });
  document.querySelector('#v-tenant .resident-foxi-chips')?.addEventListener('click', event => {
    const button = event.target.closest('[data-resident-question]');
    if (button) submitResidentQuestion(button.dataset.residentQuestion);
  });
  document.querySelector('#v-tenant')?.addEventListener('click', event => {
    const button = event.target.closest('[data-resident-question]');
    if (button && !button.closest('.resident-foxi-chips')) submitResidentQuestion(button.dataset.residentQuestion);
  });

  root.querySelector('#foxi-launcher').addEventListener('click', () => {
    panel.classList.add('open');
    panel.classList.remove('notice');
    panel.setAttribute('aria-hidden', 'false');
    if (!messages.childElementCount) addMessage(G.currentUser?.r === 't' ? 'Chào bạn! Mình là Foxi 🦊\nMình có thể giúp tra cứu hóa đơn, lịch tiện ích, thông tin thuê và gửi khiếu nại.' : 'Chào chủ nhà! Mình là Foxi 🦊\nBạn có thể hỏi về hóa đơn, hợp đồng, doanh thu, thông tin lưu trú và mức tăng điện nước.', 'bot');
    input.focus();
  });
  root.querySelector('#foxi-close').addEventListener('click', () => {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  });
  root.querySelector('#foxi-form').addEventListener('submit', event => {
    event.preventDefault();
    submit(input.value);
  });
  root.querySelector('.foxi-suggestions').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button) submit(button.textContent);
  });
  addEventListener('hashchange', syncVisibility);
  syncVisibility();
})();
