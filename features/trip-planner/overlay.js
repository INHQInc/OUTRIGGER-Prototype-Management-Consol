/* Trip Planner CTA behavior. Kept minimal and dependency-free so it runs
   identically on the frozen clone and as an Optimizely variation on live. */
(function () {
  function onClick(e) {
    var btn = e.target.closest("[data-opmc-tp-action='start']");
    if (!btn) return;
    e.preventDefault();
    // Prototype behavior: in a real integration this opens the planner flow.
    btn.textContent = "Planner coming soon ✓";
    btn.disabled = true;
  }
  document.addEventListener("click", onClick);
})();
