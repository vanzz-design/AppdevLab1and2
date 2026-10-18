/* VRC Labs: shared behaviour (copy buttons, table of contents, hero walkthrough) */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Copy buttons on code blocks ---------- */
  document.querySelectorAll(".code .copy").forEach(function (button) {
    button.addEventListener("click", function () {
      var code = button.closest(".code").querySelector("code");
      var text = code ? code.innerText : "";

      function done(ok) {
        button.textContent = ok ? "Copied" : "Press Ctrl+C";
        button.dataset.copied = ok ? "true" : "false";
        setTimeout(function () {
          button.textContent = "Copy";
          delete button.dataset.copied;
        }, 1800);
      }

      function fallback() {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        document.body.removeChild(area);
        done(ok);
      }

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      } else {
        fallback();
      }
    });
  });

  /* ---------- Table of contents: mark the section being read ---------- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a[href^='#']"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {};
    tocLinks.forEach(function (link) { byId[link.getAttribute("href").slice(1)] = link; });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && byId[entry.target.id]) {
          tocLinks.forEach(function (l) { l.removeAttribute("aria-current"); });
          byId[entry.target.id].setAttribute("aria-current", "true");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });

    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }

  /* ---------- Hero walkthrough: one card tap, end to end ---------- */
  var root = document.getElementById("pipeline");
  if (!root) return;

  var button = document.getElementById("tapBtn");
  var stages = Array.prototype.slice.call(root.querySelectorAll(".pipe-stages li"));
  var output = document.getElementById("pipeOut");
  var chip = document.getElementById("roomChip");
  var pill = document.getElementById("roomPill");

  var occupied = false;
  var running = false;
  var STEP_MS = reduceMotion ? 120 : 700;

  function setState(index, state) {
    stages[index].dataset.state = state;
    stages[index].querySelector(".dot").textContent = state === "done" ? "\u2713" : String(index + 1);
  }

  function reset() {
    stages.forEach(function (_, i) { setState(i, "idle"); });
  }

  function paintRoom() {
    pill.textContent = occupied ? "Occupied" : "Vacant";
    pill.className = "pill " + (occupied ? "pill-occupied" : "pill-vacant");
    chip.dataset.flash = occupied ? "occupied" : "vacant";
    setTimeout(function () { delete chip.dataset.flash; }, 1200);
  }

  function lines(status) {
    return [
      "ESP32 + RC522 reads the card\nuid = A1B2C3D4",
      "POST /rest/v1/rfid_logs\napikey: sb_publishable_...\n{\"card_uid\":\"A1B2C3D4\",\n \"room_id\":\"CS-101\",\n \"status\":\"" + status + "\"}",
      "HTTP 201 Created\nrow inserted into rfid_logs\ntrigger: rooms.status = " + status,
      "Realtime event\npostgres_changes UPDATE on rooms\nCS-101 -> " + status,
      "React dashboard receives the event\nCS-101 card shows " + status
    ];
  }

  function run() {
    if (running) return;
    running = true;
    button.disabled = true;
    reset();

    var next = occupied ? "Vacant" : "Occupied";
    var text = lines(next);
    var i = 0;

    function tick() {
      if (i > 0) setState(i - 1, "done");
      if (i >= stages.length) {
        occupied = !occupied;
        paintRoom();
        button.disabled = false;
        button.textContent = occupied ? "Tap again to vacate" : "Tap a card";
        running = false;
        return;
      }
      setState(i, "active");
      output.textContent = text[i];
      i += 1;
      setTimeout(tick, STEP_MS);
    }

    tick();
  }

  button.addEventListener("click", run);
})();
