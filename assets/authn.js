/* Authentication demo: sign in, watch each server check, receive a signed token. */
(function () {
  "use strict";

  if (!AuthCore.available()) {
    document.getElementById("unsupported").hidden = false;
    document.getElementById("submitBtn").disabled = true;
    return;
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STEP_MS = reduceMotion ? 0 : 450;
  var MAX_ATTEMPTS = 3;
  var LOCK_SECONDS = 20;

  var form = document.getElementById("signinForm");
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");
  var togglePw = document.getElementById("togglePw");
  var msg = document.getElementById("msg");
  var submitBtn = document.getElementById("submitBtn");
  var steps = Array.prototype.slice.call(document.querySelectorAll("#steps li"));
  var serverLog = document.getElementById("serverLog");
  var sessionPanel = document.getElementById("sessionPanel");
  var tokenView = document.getElementById("tokenView");
  var signOutBtn = document.getElementById("signOutBtn");

  var failures = 0;
  var lockTimer = null;
  var expiryTimer = null;
  var busy = false;

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function setStep(index, state) {
    var item = steps[index];
    item.dataset.state = state;
    var mark = item.querySelector(".mark");
    mark.textContent = state === "ok" ? "\u2713" : state === "fail" ? "!" : String(index + 1);
  }

  function resetSteps() {
    steps.forEach(function (_, i) { setStep(i, "idle"); });
  }

  function showMessage(text, kind) {
    msg.textContent = text;
    msg.className = "msg " + (kind === "ok" ? "msg-ok" : "msg-error");
  }

  /* ----- Lockout after repeated failures ----- */
  function startLock() {
    var left = LOCK_SECONDS;
    submitBtn.disabled = true;
    showMessage("Too many attempts. Try again in " + left + " seconds.", "error");
    lockTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(lockTimer);
        lockTimer = null;
        failures = 0;
        submitBtn.disabled = false;
        showMessage("", "error");
        return;
      }
      showMessage("Too many attempts. Try again in " + left + " seconds.", "error");
    }, 1000);
  }

  /* ----- Session panel ----- */
  function renderSession(token, payload) {
    var parts = token.split(".");
    tokenView.innerHTML =
      '<span class="t-head"></span>.<span class="t-body"></span>.<span class="t-sig"></span>';
    tokenView.children[0].textContent = parts[0];
    tokenView.children[1].textContent = parts[1];
    tokenView.children[2].textContent = parts[2];

    document.getElementById("sName").textContent = payload.name;
    document.getElementById("sEmail").textContent = payload.email;
    sessionPanel.hidden = false;

    function tick() {
      var left = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
      var m = Math.floor(left / 60);
      var s = String(left % 60).padStart(2, "0");
      document.getElementById("sExpires").textContent = left > 0 ? m + ":" + s : "expired";
    }
    tick();
    clearInterval(expiryTimer);
    expiryTimer = setInterval(tick, 1000);
  }

  function hideSession() {
    sessionPanel.hidden = true;
    clearInterval(expiryTimer);
  }

  /* ----- Sign in ----- */
  async function signIn(email, password) {
    busy = true;
    submitBtn.disabled = true;
    resetSteps();
    hideSession();
    showMessage("", "error");

    // Step 1: receive
    setStep(0, "active");
    steps[0].dataset.state = "active";
    serverLog.textContent = "Server log: received a sign-in request (" + password.length + " password characters, not stored).";
    await wait(STEP_MS);
    setStep(0, "ok");

    // Steps 2 and 3: look up and check
    setStep(1, "active");
    await wait(STEP_MS);
    var result = await AuthCore.authenticate(email, password);

    if (!result.ok && result.step === 2) {
      setStep(1, "fail");
      steps[2].dataset.state = "skip";
      steps[3].dataset.state = "skip";
      steps[4].dataset.state = "skip";
      return fail(result.reason);
    }
    setStep(1, "ok");

    setStep(2, "active");
    await wait(STEP_MS);
    if (!result.ok) {
      setStep(2, "fail");
      steps[3].dataset.state = "skip";
      steps[4].dataset.state = "skip";
      return fail(result.reason);
    }
    setStep(2, "ok");

    // Step 4: token
    setStep(3, "active");
    await wait(STEP_MS);
    var token = await AuthCore.issueToken(result.user);
    setStep(3, "ok");

    // Step 5: session
    setStep(4, "active");
    await wait(STEP_MS);
    AuthCore.saveSession(token);
    setStep(4, "ok");

    failures = 0;
    serverLog.textContent = "Server log: " + result.user.email + " authenticated. Token issued for " + AuthCore.TOKEN_MINUTES + " minutes.";
    showMessage("Signed in.", "ok");
    var check = await AuthCore.verifyToken(token);
    renderSession(token, check.payload);
    passwordInput.value = "";
    busy = false;
    submitBtn.disabled = false;
  }

  function fail(reason) {
    failures += 1;
    serverLog.textContent = "Server log (never shown to the user): " + reason;
    showMessage("Invalid login credentials", "error");
    busy = false;
    if (failures >= MAX_ATTEMPTS) {
      startLock();
    } else {
      submitBtn.disabled = false;
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (busy || lockTimer) return;
    var email = emailInput.value.trim();
    var password = passwordInput.value;
    if (!email || !password) {
      showMessage("Enter your email and password.", "error");
      return;
    }
    signIn(email, password);
  });

  togglePw.addEventListener("click", function () {
    var show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    togglePw.textContent = show ? "Hide" : "Show";
    togglePw.setAttribute("aria-pressed", String(show));
  });

  document.querySelectorAll("[data-fill]").forEach(function (button) {
    button.addEventListener("click", function () {
      var admin = button.dataset.fill === "admin";
      emailInput.value = admin ? "admin@vrc.demo" : "student@vrc.demo";
      passwordInput.value = admin ? "Admin#123" : "Student#123";
      passwordInput.focus();
    });
  });

  signOutBtn.addEventListener("click", function () {
    AuthCore.clearSession();
    hideSession();
    resetSteps();
    serverLog.textContent = "Server log: session ended. The token is discarded in the browser.";
    showMessage("Signed out.", "ok");
    emailInput.focus();
  });

  /* ----- Restore a session from earlier in this tab ----- */
  var stored = AuthCore.loadSession();
  if (stored) {
    AuthCore.verifyToken(stored).then(function (check) {
      if (check.valid) {
        steps.forEach(function (_, i) { setStep(i, "ok"); });
        serverLog.textContent = "Server log: valid session found in this tab.";
        renderSession(stored, check.payload);
      } else {
        AuthCore.clearSession();
      }
    });
  }
})();
