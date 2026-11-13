/* YF ignition · front-end */
const SALE_ABI = [
  'function totalLotsMinted() view returns (uint256)',
  'function mintedLots(address) view returns (uint256)',
  'function mintOpen() view returns (bool)',
  'function mintPhase() view returns (uint8)',
  'function opened() view returns (bool)',
  'function refundsActive() view returns (bool)',
  'function refunded(address) view returns (bool)',
  'function mintStart() view returns (uint256)',
  'function raised() view returns (uint256)',
  'function pair() view returns (address)',
  'function isAgent(address) view returns (bool)',
  'function LOT_PRICE() view returns (uint256)',
  'function TOKENS_PER_LOT() view returns (uint256)',
  'function MAX_PER_WALLET() view returns (uint256)',
  'function SALE_DURATION() view returns (uint256)',
  'function mint(uint256 lots) payable',
  'function refund()',
  'function enableRefunds()',
];

const RPCS = [
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed.bnbchain.org',
];

const state = {
  cfg: null,
  provider: null,
  signer: null,
  account: null,
  qty: 1,
  lotsSold: 0,
  mintStart: 0,
  saleDuration: 2 * 3600,
  phase: 0,
  mintOpen: false,
  opened: false,
  refundsActive: false,
  alreadyRefunded: false,
  isAgent: false,
  myMinted: 0,
  lotPrice: 0n,
  tokensPerLot: 0n,
  maxPerWallet: 1n,
  pair: ethers.ZeroAddress,
  rpcIndex: 0,
};

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('en-US');

function isConfiguredAddress(a) {
  try {
    return !!a && ethers.isAddress(a) && a !== ethers.ZeroAddress;
  } catch {
    return false;
  }
}

async function loadConfig() {
  const r = await fetch('config.json', { cache: 'no-store' });
  state.cfg = await r.json();
  const c = state.cfg;
  const explorer = c.explorer || 'https://bscscan.com';
  if (isConfiguredAddress(c.token)) $('tokenLink').href = explorer + '/address/' + c.token;
  if (isConfiguredAddress(c.sale)) $('saleLink').href = explorer + '/address/' + c.sale;
  $('mintPer').textContent =
    '1 份 = ' + c.lotPriceBnb + ' BNB · ' + fmt(c.tokensPerLot) + ' ' + c.symbol +
    ' · 每钱包限 ' + c.maxPerWallet + ' 份';
  state.maxPerWallet = BigInt(c.maxPerWallet ?? 1);
  state.lotPrice = ethers.parseEther(String(c.lotPriceBnb ?? '0.001'));
  state.tokensPerLot = ethers.parseUnits(String(c.tokensPerLot ?? '0'), 18);
  state.saleDuration = Number(c.saleHours ?? 2) * 3600;
  $('qty2').hidden = Number(state.maxPerWallet) <= 1;
}

function readProvider() {
  const url = RPCS[state.rpcIndex % RPCS.length];
  return new ethers.JsonRpcProvider(url, 56, { staticNetwork: true });
}

function saleDurationSec() {
  return state.saleDuration || 2 * 3600;
}

async function refresh() {
  if (!isConfiguredAddress(state.cfg?.sale)) {
    render();
    return;
  }
  try {
    const rp = readProvider();
    const sale = new ethers.Contract(state.cfg.sale, SALE_ABI, rp);
    const [lots, open, phase, opened, refunding, start, price, tpl, maxW, duration, pair] = await Promise.all([
      sale.totalLotsMinted(),
      sale.mintOpen().catch(() => false),
      sale.mintPhase().catch(() => 0),
      sale.opened().catch(() => false),
      sale.refundsActive().catch(() => false),
      sale.mintStart().catch(() => 0),
      sale.LOT_PRICE().catch(() => ethers.parseEther('0.001')),
      sale.TOKENS_PER_LOT().catch(() => 0n),
      sale.MAX_PER_WALLET().catch(() => 1n),
      sale.SALE_DURATION().catch(() => BigInt(saleDurationSec())),
      sale.pair().catch(() => ethers.ZeroAddress),
    ]);
    state.lotsSold = Number(lots);
    state.mintOpen = open;
    state.phase = Number(phase);
    state.opened = opened;
    state.refundsActive = refunding;
    state.mintStart = Number(start);
    state.lotPrice = price;
    state.tokensPerLot = tpl;
    state.maxPerWallet = maxW;
    state.saleDuration = Number(duration);
    state.pair = pair;

    const explorer = state.cfg.explorer || 'https://bscscan.com';
    if (pair && pair !== ethers.ZeroAddress) {
      $('pairLink').href = explorer + '/address/' + pair;
    }

    if (state.account) {
      const [mined, agentOk, didRefund] = await Promise.all([
        sale.mintedLots(state.account).catch(() => 0n),
        sale.isAgent(state.account).catch(() => false),
        sale.refunded(state.account).catch(() => false),
      ]);
      state.myMinted = Number(mined);
      state.isAgent = agentOk;
      state.alreadyRefunded = !!didRefund;
    }
  } catch (e) {
    console.warn('refresh failed', e);
    state.rpcIndex = (state.rpcIndex + 1) % RPCS.length;
  }
  render();
}

const PHASES = ['未开盘', '进行中', '已失败 · 可退款', '已点火'];

function windowEnded() {
  if (!state.mintStart || state.opened) return false;
  const now = Math.floor(Date.now() / 1000);
  return now >= state.mintStart + saleDurationSec() && state.lotsSold < 100;
}

function canRefund() {
  return (state.refundsActive || windowEnded() || state.phase === 2) && !state.opened;
}

function render() {
  $('lotsSold').textContent = state.lotsSold;
  $('progressFill').style.width = (state.lotsSold / 100) * 100 + '%';
  const phase = state.opened ? 3 : canRefund() ? 2 : state.phase;
  $('phase').textContent = PHASES[phase] || '—';
  const left = Math.max(0, 100 - state.lotsSold);
  if (!isConfiguredAddress(state.cfg?.sale)) {
    $('progressNote').textContent = '合约尚未部署，当前只是页面预览。';
  } else if (state.lotsSold >= 100) {
    $('progressNote').textContent = '满座，引信已点燃。';
  } else {
    $('progressNote').textContent = `还差 ${left} 份点火 · 还需要 ${left} 个持有 Agent ID 的钱包`;
  }

  const pay = (state.lotPrice * BigInt(state.qty));
  $('payAmount').textContent = ethers.formatEther(pay) + ' BNB';
  const got = Number(ethers.formatEther(state.tokensPerLot * BigInt(state.qty)));
  $('getAmount').textContent = fmt(got) + ' ' + state.cfg.symbol;

  $('myMinted').textContent = state.account ? `${state.myMinted} / ${state.maxPerWallet}` : '—';
  $('agentStatus').textContent = state.account ? (state.isAgent ? '✅ 已持有' : '❌ 没有 Agent ID') : '—';

  $('qty1').classList.toggle('active', state.qty === 1);
  const allowTwo = Number(state.maxPerWallet) > 1;
  $('qty2').hidden = !allowTwo;
  $('qty2').classList.toggle('active', state.qty === 2 && allowTwo);
  if (!allowTwo && state.qty !== 1) state.qty = 1;

  const btn = $('mintBtn');
  const hint = $('hint');
  hint.textContent = '';

  if (!isConfiguredAddress(state.cfg?.sale)) {
    btn.disabled = true;
    btn.textContent = '合约尚未部署';
    return;
  }
  if (!state.account) {
    btn.disabled = true;
    btn.textContent = '请先连接钱包';
    return;
  }
  if (state.opened) {
    btn.disabled = true;
    btn.textContent = '已点火 · 去 PancakeSwap 交易';
    hint.textContent = '交易已解锁，池子已开。';
    return;
  }
  if (canRefund()) {
    if (state.alreadyRefunded) {
      btn.disabled = true;
      btn.textContent = '退款已领取';
      return;
    }
    if (state.myMinted <= 0) {
      btn.disabled = true;
      btn.textContent = '该钱包没有可退款份额';
      return;
    }
    btn.disabled = false;
    btn.textContent = state.refundsActive ? '领取全额退款' : '开启并领取全额退款';
    return;
  }
  if (!state.isAgent) {
    btn.disabled = true;
    btn.textContent = '需要 .ai Agent ID';
    hint.textContent = '这个钱包没有 Agent ID，合约会拒绝铸造。';
    return;
  }
  if (state.myMinted >= Number(state.maxPerWallet)) {
    btn.disabled = true;
    btn.textContent = '该钱包已打满';
    return;
  }
  if (!state.mintOpen) {
    const now = Math.floor(Date.now() / 1000);
    btn.disabled = true;
    btn.textContent = state.mintStart > now ? '尚未开盘' : '铸造已关闭';
    return;
  }
  btn.disabled = false;
  btn.textContent = `铸造 ${state.qty} 份 · ${ethers.formatEther(pay)} BNB`;
}

async function ensureBsc() {
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (Number(chainId) === 56) return true;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x38' }],
    });
    return true;
  } catch (_) {
    alert('请把钱包切到 BNB Smart Chain (56)');
    return false;
  }
}

async function connect() {
  if (!window.ethereum) {
    alert('没有检测到浏览器钱包。可以改用 Binance Agentic Wallet（baw）直接调用合约。');
    return;
  }
  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!(await ensureBsc())) return;
    state.provider = new ethers.BrowserProvider(window.ethereum);
    state.signer = await state.provider.getSigner();
    state.account = await state.signer.getAddress();
    $('connectBtn').textContent = state.account.slice(0, 6) + '…' + state.account.slice(-4);
    await refresh();
  } catch (e) {
    console.error(e);
  }
}

async function doMint() {
  if (!state.signer) return;
  const sale = new ethers.Contract(state.cfg.sale, SALE_ABI, state.signer);
  const btn = $('mintBtn');
  const hint = $('hint');
  try {
    if (canRefund()) {
      btn.disabled = true;
      if (!state.refundsActive) {
        hint.textContent = '先开启退款…';
        const enableTx = await sale.enableRefunds();
        hint.textContent = '已提交开启退款 ' + enableTx.hash;
        await enableTx.wait();
        state.refundsActive = true;
      }
      hint.textContent = '发送退款交易…';
      const tx = await sale.refund();
      hint.textContent = '已提交 ' + tx.hash;
      await tx.wait();
      hint.textContent = '✅ 退款完成';
      await refresh();
      return;
    }
    btn.disabled = true;
    hint.textContent = '在钱包里确认交易…';
    const value = state.lotPrice * BigInt(state.qty);
    const tx = await sale.mint(state.qty, { value });
    hint.textContent = '已提交 ' + tx.hash;
    await tx.wait();
    hint.textContent = '✅ 铸造成功';
    await refresh();
  } catch (e) {
    console.error(e);
    hint.textContent = '❌ ' + (e.shortMessage || e.message || '交易失败');
    btn.disabled = false;
  }
}

function tick() {
  const el = $('countdown');
  const label = $('countdownLabel');
  if (!state.mintStart) {
    el.textContent = '--:--:--';
    if (label) label.textContent = '距开盘';
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  if (state.opened) {
    el.textContent = '已点火';
    if (label) label.textContent = '状态';
    return;
  }
  if (canRefund()) {
    el.textContent = '已结束';
    if (label) label.textContent = '状态';
    return;
  }
  let left;
  if (now < state.mintStart) {
    left = state.mintStart - now;
    if (label) label.textContent = '距开盘';
  } else {
    left = Math.max(0, state.mintStart + saleDurationSec() - now);
    if (label) label.textContent = '距结束';
  }
  const h = String(Math.floor(left / 3600)).padStart(2, '0');
  const m = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
  const s = String(left % 60).padStart(2, '0');
  el.textContent = `${h}:${m}:${s}`;
}


function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (_) {}
  document.body.removeChild(ta);
}

function copyPrompt(id, btn) {
  const el = $(id);
  const text = (el?.innerText || el?.textContent || '').trim();
  if (!text) return;
  const label = btn.textContent;
  const done = () => {
    btn.textContent = '已复制';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = label;
      btn.classList.remove('copied');
    }, 1600);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

async function main() {
  await loadConfig();
  $('connectBtn').addEventListener('click', connect);
  $('qty1').addEventListener('click', () => { state.qty = 1; render(); });
  $('qty2').addEventListener('click', () => { state.qty = 2; render(); });
  $('mintBtn').addEventListener('click', doMint);
  document.querySelectorAll('.prompt-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.prompt-tab').forEach((t) => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('.prompt-text').forEach((el) => {
        const on = el.id === tab.getAttribute('data-tab');
        el.classList.toggle('active', on);
        el.hidden = !on;
      });
    });
  });
  $('copyPromptBtn').addEventListener('click', () => {
    const el = document.querySelector('.prompt-text.active') || $('mintPrompt');
    copyPrompt(el.id, $('copyPromptBtn'));
  });

  if (window.ethereum) {
    window.ethereum.on?.('accountsChanged', async (accs) => {
      state.account = accs[0] || null;
      if (state.account) {
        state.signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
        $('connectBtn').textContent = state.account.slice(0, 6) + '…' + state.account.slice(-4);
      } else {
        state.signer = null;
        $('connectBtn').textContent = '连接钱包';
      }
      await refresh();
    });
    window.ethereum.on?.('chainChanged', () => {
      window.location.reload();
    });
  }

  await refresh();
  setInterval(tick, 1000);
  setInterval(refresh, 15000);
  tick();
}

main();
