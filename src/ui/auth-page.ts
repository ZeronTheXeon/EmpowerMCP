/**
 * Companion auth web page for obtaining an Empower session token.
 * Self-contained HTML/CSS/JS — no external dependencies.
 */
export const authPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Empower MCP — Authenticate</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f1117;
      color: #e1e4e8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .container {
      width: 100%;
      max-width: 440px;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
      color: #f0f0f0;
    }
    .subtitle {
      color: #8b949e;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .security-note {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      background: #0d1117;
      border: 1px solid #1f6feb33;
      border-radius: 6px;
      padding: 0.75rem;
      font-size: 0.8rem;
      color: #8b949e;
      margin-bottom: 1.5rem;
    }
    .security-note svg { flex-shrink: 0; margin-top: 1px; }
    label {
      display: block;
      font-size: 0.85rem;
      font-weight: 500;
      margin-bottom: 0.35rem;
      color: #c9d1d9;
    }
    input[type="email"], input[type="password"], input[type="text"] {
      width: 100%;
      padding: 0.6rem 0.75rem;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #e1e4e8;
      font-size: 0.9rem;
      margin-bottom: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #58a6ff; }
    button {
      width: 100%;
      padding: 0.65rem;
      border: none;
      border-radius: 6px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-primary {
      background: #238636;
      color: #fff;
    }
    .btn-primary:hover { background: #2ea043; }
    .btn-primary:disabled {
      background: #238636aa;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: #21262d;
      color: #c9d1d9;
      border: 1px solid #30363d;
    }
    .btn-secondary:hover { background: #30363d; }
    .challenge-options {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .challenge-options button {
      flex: 1;
    }
    .error {
      background: #3d1117;
      border: 1px solid #f8514966;
      color: #f85149;
      padding: 0.6rem 0.75rem;
      border-radius: 6px;
      font-size: 0.85rem;
      margin-bottom: 1rem;
      display: none;
    }
    .error.visible { display: block; }
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid #ffffff33;
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      vertical-align: middle;
      margin-right: 0.5rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .step { display: none; }
    .step.active { display: block; }
    .token-area {
      width: 100%;
      min-height: 120px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #e1e4e8;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.75rem;
      padding: 0.75rem;
      resize: vertical;
      word-break: break-all;
      margin-bottom: 0.75rem;
    }
    .copy-success {
      color: #3fb950;
      font-size: 0.85rem;
      display: none;
      margin-bottom: 0.5rem;
    }
    .instructions {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 0.75rem;
      font-size: 0.8rem;
      color: #8b949e;
      margin-top: 1rem;
      line-height: 1.5;
    }
    .instructions code {
      background: #161b22;
      padding: 0.15rem 0.35rem;
      border-radius: 3px;
      font-size: 0.78rem;
      color: #c9d1d9;
    }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer {
      text-align: center;
      font-size: 0.75rem;
      color: #484f58;
      margin-top: 1.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Empower MCP Server</h1>
    <p class="subtitle">Authenticate to get your session token for MCP clients</p>

    <div class="security-note">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="#58a6ff"><path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 2a1 1 0 00-1 1v4a1 1 0 002 0V4a1 1 0 00-1-1zm0 8a1 1 0 100-2 1 1 0 000 2z"/></svg>
      <span>Your credentials are sent directly to Empower through this server. Nothing is stored or logged. <a href="https://github.com/ZeronTheXeon/EmpowerMCP" target="_blank">View source</a></span>
    </div>

    <div class="card">
      <div id="error" class="error"></div>

      <!-- Step 1: Email -->
      <div id="step-email" class="step active">
        <label for="email">Email Address</label>
        <input type="email" id="email" placeholder="you@example.com" autocomplete="email">
        <button class="btn-primary" onclick="submitEmail()">Continue</button>
      </div>

      <!-- Step 2: 2FA Challenge Selection -->
      <div id="step-challenge" class="step">
        <label>Choose verification method</label>
        <div class="challenge-options">
          <button class="btn-secondary" onclick="selectChallenge('SMS')">SMS</button>
          <button class="btn-secondary" onclick="selectChallenge('EMAIL')">Email</button>
        </div>
      </div>

      <!-- Step 3: 2FA Code Entry -->
      <div id="step-code" class="step">
        <label for="code">Verification Code</label>
        <input type="text" id="code" placeholder="Enter 2FA code" autocomplete="one-time-code" inputmode="numeric">
        <button class="btn-primary" onclick="submitCode()">Verify</button>
      </div>

      <!-- Step 4: Password -->
      <div id="step-password" class="step">
        <label for="password">Password</label>
        <input type="password" id="password" placeholder="Enter your Empower password" autocomplete="current-password">
        <button class="btn-primary" onclick="submitPassword()">Sign In</button>
      </div>

      <!-- Step 5: Token Display -->
      <div id="step-token" class="step">
        <label>Your Session Token</label>
        <textarea class="token-area" id="token" readonly></textarea>
        <div id="copy-success" class="copy-success">Copied to clipboard!</div>
        <button class="btn-primary" onclick="copyToken()">Copy to Clipboard</button>
        <div class="instructions">
          <strong>How to use:</strong><br>
          Add this to your MCP client config (Claude Desktop, Cursor, etc.):<br><br>
          <code>"headers": { "Authorization": "Bearer &lt;token&gt;" }</code><br><br>
          The token will expire after some time. Return here to re-authenticate when needed.
        </div>
      </div>
    </div>

    <div class="footer">
      Empower MCP Server &mdash; Bring Your Own Token
    </div>
  </div>

  <script>
    let state = { csrf: '', cookies: {}, email: '', challengeType: '' };

    function showStep(id) {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById('step-' + id).classList.add('active');
      hideError();
    }

    function showError(msg) {
      const el = document.getElementById('error');
      el.textContent = msg;
      el.classList.add('visible');
    }

    function hideError() {
      document.getElementById('error').classList.remove('visible');
    }

    function setLoading(btn, loading) {
      if (loading) {
        btn.disabled = true;
        btn.dataset.origText = btn.textContent;
        btn.innerHTML = '<span class="spinner"></span>Loading...';
      } else {
        btn.disabled = false;
        btn.textContent = btn.dataset.origText || 'Submit';
      }
    }

    async function api(path, body) {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    }

    async function submitEmail() {
      const btn = document.querySelector('#step-email button');
      const email = document.getElementById('email').value.trim();
      if (!email) return showError('Please enter your email address.');

      state.email = email;
      setLoading(btn, true);
      try {
        const data = await api('/auth/login', { email });
        state.csrf = data.csrf;
        state.cookies = data.cookies;

        if (data.challengeMethods.includes('NONE')) {
          // No 2FA needed, skip to password
          showStep('password');
        } else {
          showStep('challenge');
        }
      } catch (e) {
        showError(e.message);
      } finally {
        setLoading(btn, false);
      }
    }

    async function selectChallenge(type) {
      state.challengeType = type;
      const btns = document.querySelectorAll('#step-challenge button');
      btns.forEach(b => b.disabled = true);

      try {
        const data = await api('/auth/challenge', {
          csrf: state.csrf,
          challengeType: type,
          cookies: state.cookies,
        });
        state.csrf = data.csrf;
        state.cookies = data.cookies;
        showStep('code');
      } catch (e) {
        showError(e.message);
      } finally {
        btns.forEach(b => b.disabled = false);
      }
    }

    async function submitCode() {
      const btn = document.querySelector('#step-code button');
      const code = document.getElementById('code').value.trim();
      if (!code) return showError('Please enter the verification code.');

      setLoading(btn, true);
      try {
        const data = await api('/auth/verify', {
          csrf: state.csrf,
          challengeType: state.challengeType,
          code,
          cookies: state.cookies,
        });
        state.csrf = data.csrf;
        state.cookies = data.cookies;
        showStep('password');
      } catch (e) {
        showError(e.message);
      } finally {
        setLoading(btn, false);
      }
    }

    async function submitPassword() {
      const btn = document.querySelector('#step-password button');
      const password = document.getElementById('password').value;
      if (!password) return showError('Please enter your password.');

      setLoading(btn, true);
      try {
        const data = await api('/auth/password', {
          csrf: state.csrf,
          email: state.email,
          password,
          cookies: state.cookies,
        });
        document.getElementById('token').value = data.session;
        showStep('token');
        // Clear sensitive state
        state = { csrf: '', cookies: {}, email: '', challengeType: '' };
      } catch (e) {
        showError(e.message);
      } finally {
        setLoading(btn, false);
      }
    }

    async function copyToken() {
      const token = document.getElementById('token').value;
      await navigator.clipboard.writeText(token);
      const el = document.getElementById('copy-success');
      el.style.display = 'block';
      setTimeout(() => el.style.display = 'none', 2000);
    }

    // Allow Enter key to submit forms
    document.getElementById('email').addEventListener('keydown', e => { if (e.key === 'Enter') submitEmail(); });
    document.getElementById('code').addEventListener('keydown', e => { if (e.key === 'Enter') submitCode(); });
    document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') submitPassword(); });
  </script>
</body>
</html>`;
