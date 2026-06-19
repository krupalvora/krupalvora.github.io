(function () {
  "use strict";

  /* ----------------------------------------------------------- helpers */
  function boldToHtml(text) {
    if (!text || typeof text !== "string") return "";
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }
  function escapeHtml(text) {
    if (text == null) return "";
    return String(text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function el(id) { return document.getElementById(id); }
  function setText(id, text) { var n = el(id); if (n && text != null) n.textContent = text; }
  function setHtml(id, html) { var n = el(id); if (n && html != null) n.innerHTML = html; }
  function relAttrs(external) { return external ? ' target="_blank" rel="noopener"' : ""; }

  /* ----------------------------------------------------------- nav */
  function renderNav(data) {
    var ul = el("nav-list");
    if (ul && Array.isArray(data.nav)) {
      ul.innerHTML = data.nav
        .map(function (n) { return '<li><a href="' + escapeHtml(n.href) + '">' + escapeHtml(n.label) + "</a></li>"; })
        .join("");
    }
    var logo = el("logo-text");
    if (logo && data.site && data.site.logoText) logo.textContent = data.site.logoText;
  }

  /* ----------------------------------------------------------- hero */
  function renderHero(data) {
    var h = data.hero || {};
    if (h.kicker) setHtml("hero-kicker", boldToHtml(h.kicker));
    if (h.headline) setHtml("hero-headline", boldToHtml(h.headline));
    if (h.subtitle) setHtml("hero-subtitle", boldToHtml(h.subtitle));

    var photo = el("hero-photo");
    if (photo) {
      if (h.photo) { photo.src = h.photo; photo.alt = h.photoAlt || "Profile"; }
      photo.onerror = function () { var w = photo.closest(".hero-photo-wrap"); if (w) w.style.display = "none"; };
    }

    var actions = el("hero-actions");
    if (actions) {
      var btns = "";
      if (h.primaryCta) btns += linkBtn(h.primaryCta, "primary", true);
      if (h.secondaryCta) btns += linkBtn(h.secondaryCta, "secondary", false);
      actions.innerHTML = btns;
    }

    var status = el("hero-status");
    if (status && h.statusPill) {
      status.innerHTML = '<span class="pulse" aria-hidden="true"></span>' + escapeHtml(h.statusPill);
    }

    var stats = el("hero-stats");
    if (stats && Array.isArray(h.stats)) {
      stats.innerHTML = h.stats.map(function (s) {
        return '<div><dt class="count" data-count="' + escapeHtml(s.value) + '">' +
          escapeHtml(s.value) + "</dt><dd>" + escapeHtml(s.label) + "</dd></div>";
      }).join("");
    }
  }

  /* ----------------------------------------------------------- count-up numbers */
  function animateCount(node) {
    var full = node.getAttribute("data-count") || node.textContent;
    var m = String(full).match(/^(\D*)(\d+(?:\.\d+)?)(.*)$/);
    if (!m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { node.textContent = full; return; }
    var prefix = m[1], target = parseFloat(m[2]), suffix = m[3];
    var decimals = (m[2].split(".")[1] || "").length;
    var start = null, dur = 1100;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      var val = (target * eased).toFixed(decimals);
      node.textContent = prefix + val + suffix;
      if (p < 1) requestAnimationFrame(step);
      else node.textContent = full;
    }
    requestAnimationFrame(step);
  }
  function linkBtn(cta, cls, arrow) {
    return '<a class="btn ' + cls + '" href="' + escapeHtml(cta.href) + '"' + relAttrs(cta.external) + ">" +
      escapeHtml(cta.label) + (arrow ? ' <span class="arrow" aria-hidden="true">→</span>' : "") + "</a>";
  }

  /* ----------------------------------------------------------- trust bar */
  function renderTrust(data) {
    var t = data.trustBar || {};
    setText("trust-label", t.label);
    var ul = el("trust-list");
    if (ul && Array.isArray(t.items)) {
      ul.innerHTML = t.items.map(function (item) {
        var inner;
        if (t.useLogos && item.logo) {
          inner = '<img class="trust-logo" src="' + escapeHtml(item.logo) + '" alt="' + escapeHtml(item.name) + '" loading="lazy" />';
        } else {
          inner = escapeHtml(item.name);
        }
        if (item.url) inner = '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">' + inner + "</a>";
        return "<li>" + inner + "</li>";
      }).join("");
    }
  }

  /* ----------------------------------------------------------- services */
  function renderServices(data) {
    var s = data.services || {};
    setText("services-eyebrow", s.eyebrow);
    setText("services-title", s.title);
    setText("services-subtitle", s.subtitle);
    var grid = el("services-grid");
    if (grid && Array.isArray(s.items)) {
      grid.innerHTML = s.items.map(function (item, i) {
        var pts = (item.points || []).map(function (p) { return "<li>" + escapeHtml(p) + "</li>"; }).join("");
        return '<article class="service-card reveal">' +
          '<span class="service-num" aria-hidden="true">' + (i + 1) + "</span>" +
          "<h3>" + escapeHtml(item.title) + "</h3>" +
          "<p>" + escapeHtml(item.description) + "</p>" +
          "<ul>" + pts + "</ul></article>";
      }).join("");
    }
  }

  /* ----------------------------------------------------------- work */
  function renderWork(data) {
    var w = data.work || {};
    setText("work-eyebrow", w.eyebrow);
    setText("work-title", w.title);
    setText("work-subtitle", w.subtitle);
    var list = el("work-list");
    if (list && Array.isArray(w.items)) {
      list.innerHTML = w.items.map(function (item) {
        var tech = (item.tech || []).map(function (x) { return "<span>" + escapeHtml(x) + "</span>"; }).join("");
        var detail = "";
        if (item.challenge) detail += '<p class="work-detail"><span class="lead">Challenge</span>' + escapeHtml(item.challenge) + "</p>";
        if (item.approach) detail += '<p class="work-detail"><span class="lead">Approach</span>' + escapeHtml(item.approach) + "</p>";
        if (item.outcome) detail += '<p class="work-detail"><span class="lead">Outcome</span><strong>' + escapeHtml(item.outcome) + "</strong></p>";
        var link = item.link
          ? '<a class="work-link" href="' + escapeHtml(item.link) + '" target="_blank" rel="noopener">' +
            escapeHtml(item.linkLabel || "Learn more") + ' <span class="arrow" aria-hidden="true">→</span></a>'
          : "";
        return '<article class="work-card reveal">' +
          '<div class="work-metric">' +
            '<span class="work-tag">' + escapeHtml(item.tag) + "</span>" +
            '<div class="work-metric-value count" data-count="' + escapeHtml(item.metric) + '">' + escapeHtml(item.metric) + "</div>" +
            '<p class="work-metric-label">' + escapeHtml(item.metricLabel) + "</p>" +
          "</div>" +
          '<div class="work-body"><h3>' + escapeHtml(item.title) + "</h3>" +
            detail +
            '<div class="work-tech">' + tech + "</div>" + link +
          "</div></article>";
      }).join("");
    }
  }

  /* ----------------------------------------------------------- about */
  function renderAbout(data) {
    var a = data.about || {};
    setText("about-eyebrow", a.eyebrow);
    setText("about-title", a.title);
    var p = el("about-paragraphs");
    if (p && Array.isArray(a.paragraphs)) {
      p.innerHTML = a.paragraphs.map(function (x) { return "<p>" + boldToHtml(x) + "</p>"; }).join("");
    }
    var creds = el("about-credentials");
    if (creds && Array.isArray(a.credentials)) {
      creds.innerHTML = a.credentials.map(function (c) { return "<li>" + escapeHtml(c) + "</li>"; }).join("");
    }
    var hl = el("about-highlights");
    if (hl && Array.isArray(a.highlights)) {
      hl.innerHTML = a.highlights.map(function (h) {
        return '<li><span class="h-label">' + escapeHtml(h.label) + '</span><span class="h-value">' + escapeHtml(h.value) + "</span></li>";
      }).join("");
    }
    var exp = el("about-experience");
    if (exp && Array.isArray(a.experience)) {
      exp.innerHTML = a.experience.map(function (e) {
        return "<li><span class=\"exp-role\">" + escapeHtml(e.role) + "</span> " +
          '<span class="exp-org">· ' + escapeHtml(e.org) + "</span>" +
          '<span class="exp-period">' + escapeHtml(e.period) + "</span>" +
          '<p class="exp-summary">' + escapeHtml(e.summary) + "</p></li>";
      }).join("");
    }
  }

  /* ----------------------------------------------------------- skills */
  function renderSkills(data) {
    var s = data.skills || {};
    setText("skills-eyebrow", s.eyebrow);
    setText("skills-title", s.title);
    setText("skills-subtitle", s.subtitle);
    var grid = el("skills-grid");
    if (grid && Array.isArray(s.categories)) {
      grid.innerHTML = s.categories.map(function (c) {
        var tags = (c.items || []).map(function (x) { return "<span>" + escapeHtml(x) + "</span>"; }).join("");
        return '<div class="skill-card"><h3>' + escapeHtml(c.title) + '</h3><div class="skill-tags">' + tags + "</div></div>";
      }).join("");
    }
  }

  /* ----------------------------------------------------------- writing */
  function renderWriting(data) {
    var w = data.writing || {};
    setText("writing-eyebrow", w.eyebrow);
    setText("writing-title", w.title);
    setText("writing-subtitle", w.subtitle);
    var body = el("writing-body");
    if (!body) return;
    if (Array.isArray(w.items) && w.items.length) {
      body.innerHTML = '<div class="writing-grid">' + w.items.map(function (post) {
        return '<a class="writing-card" href="' + escapeHtml(post.url) + '" target="_blank" rel="noopener">' +
          "<h3>" + escapeHtml(post.title) + "</h3>" +
          (post.summary ? "<p>" + escapeHtml(post.summary) + "</p>" : "") + "</a>";
      }).join("") + "</div>";
    } else {
      body.innerHTML = '<div class="writing-empty"><p>I write about ERP, scaling, and engineering on Medium.</p>' +
        '<a class="btn primary" href="' + escapeHtml(w.profileUrl) + '" target="_blank" rel="noopener">' +
        escapeHtml(w.profileLabel || "Read on Medium") + ' <span class="arrow" aria-hidden="true">→</span></a></div>';
    }
  }

  /* ----------------------------------------------------------- contact */
  function renderContact(data) {
    var c = data.contact || {};
    setText("contact-eyebrow", c.eyebrow);
    setText("contact-title", c.title);
    setText("contact-subtitle", c.subtitle);
    var actions = el("contact-actions");
    if (actions) {
      var btns = "";
      if (c.primaryCta) btns += linkBtn(c.primaryCta, "primary", false);
      if (c.secondaryCta) btns += linkBtn(c.secondaryCta, "secondary", false);
      actions.innerHTML = btns;
    }
    var meta = el("contact-meta");
    if (meta) {
      var rows = [];
      if (c.location) rows.push("<li>" + escapeHtml(c.location) + "</li>");
      if (c.email) rows.push('<li><a href="mailto:' + escapeHtml(c.email) + '">' + escapeHtml(c.email) + "</a></li>");
      if (c.phone) rows.push('<li><a href="tel:' + escapeHtml(c.phoneHref || c.phone) + '">' + escapeHtml(c.phone) + "</a></li>");
      meta.innerHTML = rows.join("");
    }
    var links = el("contact-links");
    if (links && Array.isArray(c.links)) {
      links.innerHTML = c.links.map(function (l) {
        return '<a href="' + escapeHtml(l.href) + '"' + relAttrs(l.external) + ">" + escapeHtml(l.label) + "</a>";
      }).join("");
    }
  }

  /* ----------------------------------------------------------- footer */
  function renderFooter(data) {
    var y = el("year"); if (y) y.textContent = new Date().getFullYear();
    if (data.footer) { setText("footer-copy", data.footer.copy); setText("footer-secondary", data.footer.secondary); }
  }

  /* ----------------------------------------------------------- chrome: nav, scroll, reveal */
  function wireChrome() {
    var header = el("site-header");
    var progress = el("scroll-progress");
    var onScroll = function () {
      if (header) header.classList.toggle("scrolled", window.scrollY > 8);
      if (progress) {
        var h = document.documentElement;
        var max = h.scrollHeight - h.clientHeight;
        progress.style.transform = "scaleX(" + (max > 0 ? window.scrollY / max : 0) + ")";
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // count-up numbers when they scroll into view
    var counts = document.querySelectorAll(".count");
    if ("IntersectionObserver" in window) {
      var co = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { animateCount(en.target); co.unobserve(en.target); } });
      }, { threshold: 0.6 });
      counts.forEach(function (n) { co.observe(n); });
    } else {
      counts.forEach(animateCount);
    }

    var toggle = document.querySelector(".nav-toggle");
    var list = el("nav-list");
    if (toggle && list) {
      toggle.addEventListener("click", function () {
        var open = list.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      });
      list.addEventListener("click", function (e) {
        if (e.target.closest("a")) { list.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
      });
    }

    if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
      }, { threshold: 0.12 });
      // observe after content renders
      requestAnimationFrame(function () {
        document.querySelectorAll(".reveal").forEach(function (n) { io.observe(n); });
      });
    } else {
      document.querySelectorAll(".reveal").forEach(function (n) { n.classList.add("in"); });
    }
  }

  /* ----------------------------------------------------------- boot */
  function render(data) {
    renderNav(data);
    renderHero(data);
    renderTrust(data);
    renderServices(data);
    renderWork(data);
    renderAbout(data);
    renderSkills(data);
    renderWriting(data);
    renderContact(data);
    renderFooter(data);
    wireChrome();
  }

  document.addEventListener("DOMContentLoaded", function () {
    fetch("content.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(render)
      .catch(function (err) {
        console.error("Failed to load content.json:", err);
        // The static HTML hero remains visible as a graceful fallback.
        wireChrome();
      });
  });
})();
