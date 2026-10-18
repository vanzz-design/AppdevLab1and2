/* Authorization demo: the same actions are allowed or blocked depending on role. */
(function () {
  "use strict";

  if (!AuthCore.available()) {
    document.getElementById("unsupported").hidden = false;
    return;
  }

  /* Each action says who may use it, and shows the real rule from our database. */
  var ACTIONS = [
    {
      id: "view-rooms", title: "View live room status", detail: "The public dashboard", need: "public",
      ruleName: "Policy on rooms",
      rule: 'create policy "rooms public read" on public.rooms\n  for select to anon, authenticated\n  using (true);'
    },
    {
      id: "book-room", title: "Book a room", detail: "Reserve a time slot", need: "user",
      ruleName: "Function create_booking()",
      rule: "-- inside create_booking()\nif auth.uid() is null then\n  raise exception 'Not authenticated';\nend if;"
    },
    {
      id: "my-bookings", title: "View my bookings", detail: "Your own reservations", need: "user",
      ruleName: "Policy on bookings",
      rule: 'create policy "bookings read own" on public.bookings\n  for select to authenticated\n  using (user_id = auth.uid() or public.is_admin());'
    },
    {
      id: "analytics", title: "Open admin analytics", detail: "Utilization, no-shows, hardware health", need: "admin",
      ruleName: "Function admin_room_utilization()",
      rule: "-- inside admin_room_utilization()\nselect ...\nfrom public.rooms r\nwhere public.is_admin();   -- returns nothing for non-admins"
    },
    {
      id: "read-logs", title: "Read the RFID tap log", detail: "Every card number and time", need: "admin",
      ruleName: "Policy on rfid_logs",
      rule: 'create policy "admin read logs" on public.rfid_logs\n  for select to authenticated\n  using (public.is_admin());'
    },
    {
      id: "reset-strikes", title: "Reset a student's strikes", detail: "Change strike_count", need: "admin",
      ruleName: "Trigger protect_profile_columns",
      rule: "-- runs before every update on profiles\nif auth.uid() is not null and not public.is_admin() then\n  new.role            := old.role;\n  new.strike_count    := old.strike_count;\n  new.suspended_until := old.suspended_until;\nend if;"
    }
  ];

  var NEED_LABEL = { "public": "Anyone", "user": "Signed-in user", "admin": "Admin only" };
  var NEED_CLASS = { "public": "need-public", "user": "", "admin": "need-admin" };

  var identityText = document.getElementById("identityText");
  var roleField = document.getElementById("roleField");
  var roleSelect = document.getElementById("roleSelect");
  var actionList = document.getElementById("actionList");
  var logList = document.getElementById("log");
  var ruleName = document.getElementById("ruleName");
  var ruleCode = document.getElementById("ruleCode");
  var matrixBody = document.querySelector("#matrix tbody");

  var identity = null;     // verified token claims, or null for a guest
  var sessionNote = "";    // why the session is not usable, if a token exists

  function currentRole() {
    return identity ? AuthCore.getRole(identity.sub) : "guest";
  }

  function allowed(need, role) {
    if (need === "public") return true;
    if (need === "user") return role === "user" || role === "admin";
    return role === "admin";
  }

  /* ----- Identity bar ----- */
  function renderIdentity() {
    identityText.textContent = "";
    if (identity) {
      var strong = document.createElement("strong");
      strong.textContent = identity.name;
      identityText.appendChild(document.createTextNode("Signed in as "));
      identityText.appendChild(strong);
      identityText.appendChild(document.createTextNode(" (" + identity.email + "). Role: " + currentRole() + "."));
      roleField.hidden = false;
      roleSelect.value = currentRole();
    } else {
      identityText.appendChild(document.createTextNode("You are a guest: not signed in. " + (sessionNote ? sessionNote + " " : "")));
      var link = document.createElement("a");
      link.href = "authn.html";
      link.textContent = "Sign in first";
      link.style.color = "#efcb52";
      identityText.appendChild(link);
      identityText.appendChild(document.createTextNode(" to act as a student or an admin."));
      roleField.hidden = true;
    }
  }

  /* ----- Action list ----- */
  function renderActions() {
    actionList.innerHTML = "";
    ACTIONS.forEach(function (action) {
      var li = document.createElement("li");

      var what = document.createElement("span");
      what.className = "what";
      var title = document.createElement("strong");
      title.textContent = action.title;
      var detail = document.createElement("small");
      detail.textContent = action.detail;
      var need = document.createElement("span");
      need.className = ("need " + NEED_CLASS[action.need]).trim();
      need.textContent = NEED_LABEL[action.need];
      what.appendChild(title);
      what.appendChild(detail);
      what.appendChild(document.createElement("br"));
      what.appendChild(need);

      var button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-green btn-small";
      button.textContent = "Try it";
      button.setAttribute("aria-label", "Try: " + action.title);
      button.addEventListener("click", function () { attempt(action); });

      li.appendChild(what);
      li.appendChild(button);
      actionList.appendChild(li);
    });
  }

  /* ----- Permission matrix ----- */
  function renderMatrix() {
    matrixBody.innerHTML = "";
    ACTIONS.forEach(function (action) {
      var tr = document.createElement("tr");
      var name = document.createElement("td");
      name.textContent = action.title;
      tr.appendChild(name);
      ["guest", "user", "admin"].forEach(function (role) {
        var td = document.createElement("td");
        td.dataset.role = role;
        var yes = allowed(action.need, role);
        td.textContent = yes ? "Yes" : "No";
        td.className = yes ? "yes" : "no";
        tr.appendChild(td);
      });
      matrixBody.appendChild(tr);
    });
    highlightColumn();
  }

  function highlightColumn() {
    var role = currentRole();
    document.querySelectorAll("#matrix [data-role]").forEach(function (cell) {
      cell.classList.toggle("col-hl", cell.dataset.role === role);
    });
  }

  /* ----- Log ----- */
  function addLog(code, text) {
    var empty = logList.querySelector(".empty");
    if (empty) logList.innerHTML = "";

    var li = document.createElement("li");
    var time = document.createElement("span");
    time.textContent = new Date().toLocaleTimeString([], { hour12: false });
    var status = document.createElement("span");
    status.className = "code-" + code;
    status.textContent = String(code);
    var note = document.createElement("span");
    note.textContent = text;
    li.appendChild(time);
    li.appendChild(status);
    li.appendChild(note);
    logList.insertBefore(li, logList.firstChild);
  }

  function showRule(action) {
    ruleName.textContent = action.ruleName;
    ruleCode.textContent = action.rule;
  }

  /* ----- The authorization decision ----- */
  async function attempt(action) {
    await loadIdentity();         // re-check the token every time, as a server would
    var role = currentRole();
    showRule(action);

    if (action.need === "public") {
      addLog(200, action.title + ": allowed. This action needs no sign-in.");
    } else if (!identity) {
      addLog(401, action.title + ": blocked. " + (sessionNote || "The server does not know who you are.") + " Sign in first.");
    } else if (allowed(action.need, role)) {
      addLog(200, action.title + ": allowed for " + identity.name + " (" + role + ").");
    } else {
      addLog(403, action.title + ": blocked. " + identity.name + " is signed in, but the " + role + " role cannot do this. It needs " + action.need + ".");
    }
  }

  /* ----- Read and verify the token from the authentication demo ----- */
  async function loadIdentity() {
    var token = AuthCore.loadSession();
    identity = null;
    sessionNote = "";
    if (token) {
      var check = await AuthCore.verifyToken(token);
      if (check.valid) {
        identity = check.payload;
      } else {
        sessionNote = "Your earlier session was rejected: " + check.reason;
        AuthCore.clearSession();
      }
    }
    renderIdentity();
    highlightColumn();
  }

  roleSelect.addEventListener("change", function () {
    if (!identity) return;
    AuthCore.setRole(identity.sub, roleSelect.value);
    renderIdentity();
    highlightColumn();
  });

  document.getElementById("clearLog").addEventListener("click", function () {
    logList.innerHTML = '<li><span class="empty">Nothing yet. Try an action.</span></li>';
  });

  renderActions();
  renderMatrix();
  loadIdentity();
})();
