(() => {
  const header = document.querySelector("header[data-nav]");
  if (!header) return;

  const active = (header.getAttribute("data-active") || "").toLowerCase();

  const isActive = (key) => (active === key ? "active" : "");

  header.innerHTML = `
    <div class="container">
      <div class="topbar">
        <a class="brand" href="/" aria-label="SIX43 Home">
          <img src="/assets/logo.png" alt="SIX43" />
          <span class="tagline">Baseball IQ • Coaching Tools • Analytics</span>
        </a>

        <nav aria-label="Primary navigation">
          <div class="navlinks">
            <a class="${isActive("learn")}" href="/learn.html">Learn</a>
            <a class="${isActive("articles")}" href="/blog.html">Articles</a>
            <a class="${isActive("tools")}" href="/tools.html">Tools</a>
            <a class="${isActive("listen")}" href="/listen.html">Listen</a>
            <a class="${isActive("about")}" href="/about.html">About</a>
          </div>

          <a class="btn primary" href="/articles/why-decision-making-beats-tools.html">Start Here</a>

          <button class="menu-btn" type="button" aria-label="Open menu" onclick="toggleMenu()">
            ☰ Menu
          </button>
        </nav>
      </div>

      <div id="menuPanel" class="menu-panel" aria-label="Mobile menu">
        <a class="${isActive("learn")}" href="/learn.html">Learn</a>
        <a class="${isActive("articles")}" href="/blog.html">Articles</a>
        <a class="${isActive("tools")}" href="/tools.html">Tools</a>
        <a class="${isActive("listen")}" href="/listen.html">Listen</a>
        <a class="${isActive("about")}" href="/about.html">About</a>

        <div class="row">
          <a class="btn primary" href="/articles/why-decision-making-beats-tools.html">Start Here</a>
        </div>
      </div>
    </div>
  `;
})();
