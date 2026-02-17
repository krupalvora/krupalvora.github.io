(function () {
  "use strict";

  // Simple **bold** to <strong> for JSON strings
  function boldToHtml(text) {
    if (!text || typeof text !== "string") return "";
    return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function escapeHtml(text) {
    if (!text || typeof text !== "string") return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function setText(el, text, allowHtml) {
    if (!el) return;
    if (allowHtml) el.innerHTML = boldToHtml(String(text || ""));
    else el.textContent = text != null ? String(text) : "";
  }

  function setAttr(el, name, value) {
    if (!el || value == null) return;
    el.setAttribute(name, String(value));
  }

  // --- Render from content.json ---

  function renderSite(data) {
    document.title = data.site?.title || document.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && data.site?.metaDescription)
      metaDesc.setAttribute("content", data.site.metaDescription);
    const logo = document.getElementById("logo-text");
    if (logo) logo.textContent = data.site?.logoText || "kvora.dev";
  }

  function renderHero(data) {
    const h = data.hero || {};
    const photo = document.getElementById("hero-photo");
    if (photo && h.photo) {
      photo.src = h.photo;
      photo.alt = h.photoAlt || "Profile";
      photo.onerror = function () {
        var wrap = photo.closest(".hero-photo-wrap");
        if (wrap) wrap.style.display = "none";
      };
    } else {
      var wrap = document.querySelector(".hero-photo-wrap");
      if (wrap) wrap.style.display = "none";
    }

    setText(document.getElementById("hero-kicker"), h.kicker);
    const headlineEl = document.getElementById("hero-headline");
    if (headlineEl && h.headline)
      headlineEl.innerHTML = boldToHtml(h.headline.replace(/\n/g, "<br />"));

    const subEl = document.getElementById("hero-subtitle");
    if (subEl && h.subtitle) subEl.innerHTML = boldToHtml(h.subtitle);

    const metaEl = document.getElementById("hero-meta");
    if (metaEl && h.meta && Array.isArray(h.meta)) {
      metaEl.innerHTML = h.meta
        .map(
          (m) =>
            `<div><span class="meta-label">${escapeHtml(m.label)}</span><span class="meta-value">${escapeHtml(m.value)}</span></div>`
        )
        .join("");
    }

    const actionsEl = document.getElementById("hero-actions");
    if (actionsEl && h.primaryCta) {
      const primary =
        h.primaryCtaHref && h.primaryCtaHref.startsWith("#")
          ? `<a href="${escapeHtml(h.primaryCtaHref)}" class="btn primary">${escapeHtml(h.primaryCta)}</a>`
          : `<a href="${escapeHtml(h.primaryCtaHref || "#projects")}" class="btn primary">${escapeHtml(h.primaryCta)}</a>`;
      const secondary = h.secondaryCta
        ? `<a href="${escapeHtml(h.secondaryCtaHref || "#contact")}" class="btn ghost">${escapeHtml(h.secondaryCta)}</a>`
        : "";
      actionsEl.innerHTML = primary + (secondary ? " " + secondary : "");
    }

    const linksEl = document.getElementById("hero-links");
    if (linksEl && h.links && Array.isArray(h.links)) {
      const parts = [];
      h.links.forEach((link, i) => {
        if (i > 0) parts.push("<span>·</span>");
        const attrs = link.external
          ? ' target="_blank" rel="noreferrer"'
          : "";
        parts.push(
          `<a href="${escapeHtml(link.href)}"${attrs}>${escapeHtml(link.label)}</a>`
        );
      });
      linksEl.innerHTML = parts.join("\n");
    }

    const statusEl = document.getElementById("hero-status");
    if (statusEl && h.statusPill)
      statusEl.innerHTML = '<span class="dot"></span> ' + escapeHtml(h.statusPill);

    const chipsEl = document.getElementById("hero-chips");
    if (chipsEl && h.chips && Array.isArray(h.chips)) {
      chipsEl.innerHTML = h.chips
        .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
        .join("");
    }
  }

  function renderAbout(data) {
    const a = data.about || {};
    const contentEl = document.getElementById("about-content");
    if (contentEl) {
      let html = a.title ? `<h2 class="section-title">${escapeHtml(a.title)}</h2>` : "";
      if (a.paragraphs && Array.isArray(a.paragraphs))
        a.paragraphs.forEach((p) => {
          html += `<p>${boldToHtml(p)}</p>`;
        });
      contentEl.innerHTML = html;
    }

    const cardsEl = document.getElementById("about-cards");
    if (cardsEl && a.cards && Array.isArray(a.cards)) {
      cardsEl.innerHTML = a.cards
        .map(
          (card) =>
            `<div class="card mini"><p class="mini-label">${escapeHtml(card.label)}</p><ul class="checklist">${(card.items || [])
              .map((i) => `<li>${escapeHtml(i)}</li>`)
              .join("")}</ul></div>`
        )
        .join("");
    }
  }

  function renderExperience(data) {
    const ex = data.experience || {};
    setText(document.getElementById("experience-title"), ex.title);
    setText(document.getElementById("experience-subtitle"), ex.subtitle);

    const timelineEl = document.getElementById("experience-timeline");
    if (!timelineEl || !ex.items || !Array.isArray(ex.items)) return;

    timelineEl.innerHTML = ex.items
      .map((job) => {
        let pointsHtml = "";
        if (job.points && job.points.length)
          pointsHtml = `<ul class="timeline-points">${job.points
            .map((p) => `<li>${boldToHtml(p)}</li>`)
            .join("")}</ul>`;
        const tagsHtml =
          job.tags && job.tags.length
            ? `<div class="tag-row">${job.tags
                .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
                .join("")}</div>`
            : "";
        return `<article class="timeline-item">
          <header class="timeline-header">
            <div>
              <h3>${escapeHtml(job.title)}</h3>
              <p class="timeline-company">${escapeHtml(job.company)}</p>
            </div>
            <p class="timeline-meta">${escapeHtml(job.meta || "")}</p>
          </header>
          <p class="timeline-summary">${escapeHtml(job.summary || "")}</p>
          ${pointsHtml}
          ${tagsHtml}
        </article>`;
      })
      .join("");
  }

  function renderSkills(data) {
    const sk = data.skills || {};
    setText(document.getElementById("skills-title"), sk.title);
    setText(document.getElementById("skills-subtitle"), sk.subtitle);

    const gridEl = document.getElementById("skills-grid");
    if (!gridEl || !sk.categories || !Array.isArray(sk.categories)) return;

    gridEl.innerHTML = sk.categories
      .map(
        (cat) =>
          `<div class="card">
            <h3>${escapeHtml(cat.title)}</h3>
            <ul class="pill-list">${(cat.items || [])
              .map((i) => `<li>${escapeHtml(i)}</li>`)
              .join("")}</ul>
          </div>`
      )
      .join("");
  }

  function renderProjects(data) {
    const pr = data.projects || {};
    setText(document.getElementById("projects-title"), pr.title);
    setText(document.getElementById("projects-subtitle"), pr.subtitle);

    const filtersEl = document.getElementById("project-filters");
    if (filtersEl && pr.filters && Array.isArray(pr.filters)) {
      filtersEl.innerHTML = pr.filters
        .map(
          (f, i) =>
            `<button class="filter-btn ${i === 0 ? "active" : ""}" data-filter="${escapeHtml(f.id)}">${escapeHtml(f.label)}</button>`
        )
        .join("");
    }

    const listEl = document.getElementById("project-list");
    if (!listEl || !pr.items || !Array.isArray(pr.items)) return;

    listEl.innerHTML = pr.items
      .map((item) => {
        const badge = item.badge
          ? `<span class="badge">${escapeHtml(item.badge)}</span>`
          : "";
        const bullets =
          item.bullets && item.bullets.length
            ? `<ul class="card-list">${item.bullets
                .map((b) => `<li>${escapeHtml(b)}</li>`)
                .join("")}</ul>`
            : "";
        const techTags =
          item.techTags && item.techTags.length
            ? `<div class="tag-row">${item.techTags
                .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
                .join("")}</div>`
            : "";
        const linkHtml =
          item.link && item.linkLabel
            ? `<div class="card-footer"><a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer" class="text-link">${escapeHtml(item.linkLabel)}</a></div>`
            : "";
        const tags = (item.tags || "").toString().trim().split(/\s+/).filter(Boolean);
        const dataTags = tags.length ? ` data-tags="${tags.join(" ")}"` : "";
        return `<article class="card project-card"${dataTags}>
          <div class="card-header">
            <h3>${escapeHtml(item.title)}</h3>
            ${badge}
          </div>
          <p>${escapeHtml(item.description)}</p>
          ${bullets}
          ${techTags}
          ${linkHtml}
        </article>`;
      })
      .join("");
  }

  function renderContributions(data) {
    const c = data.contributions || {};
    setText(document.getElementById("contributions-title"), c.title);
    setText(document.getElementById("contributions-subtitle"), c.subtitle);

    const listEl = document.getElementById("contributions-list");
    if (!listEl || !c.items || !Array.isArray(c.items)) return;

    listEl.innerHTML = c.items
      .map((item) => {
        const badge = item.badge
          ? `<span class="badge">${escapeHtml(item.badge)}</span>`
          : "";
        const bullets =
          item.bullets && item.bullets.length
            ? `<ul class="card-list">${item.bullets
                .map((b) => `<li>${escapeHtml(b)}</li>`)
                .join("")}</ul>`
            : "";
        const linkHtml =
          item.link && item.linkLabel
            ? `<div class="card-footer"><a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer" class="text-link">${escapeHtml(item.linkLabel)}</a></div>`
            : "";
        return `<article class="card">
          <div class="card-header">
            <h3>${escapeHtml(item.title)}</h3>
            ${badge}
          </div>
          <p>${escapeHtml(item.description)}</p>
          ${bullets}
          ${linkHtml}
        </article>`;
      })
      .join("");
  }

  function renderContact(data) {
    const c = data.contact || {};
    setText(document.getElementById("contact-title"), c.title);
    setText(document.getElementById("contact-subtitle"), c.subtitle);
    setText(document.getElementById("form-title"), c.formTitle);
    setText(document.getElementById("form-caption"), c.formCaption);
    const submitBtn = document.getElementById("form-submit-btn");
    if (submitBtn) submitBtn.textContent = c.formSubmitLabel || "Open mail with draft";

    const listEl = document.getElementById("contact-list");
    if (listEl) {
      listEl.innerHTML = [
        c.email && { label: "Email", content: `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` },
        c.phone && { label: "Phone", content: `<a href="tel:${escapeHtml((c.phoneHref || c.phone).replace(/\s/g, ""))}">${escapeHtml(c.phone)}</a>` },
        c.location && { label: "Location", content: escapeHtml(c.location) },
      ]
        .filter(Boolean)
        .map(
          (row) =>
            `<li><span>${escapeHtml(row.label)}</span>${row.content}</li>`
        )
        .join("");
    }

    const linksEl = document.getElementById("contact-links");
    if (linksEl && c.links && Array.isArray(c.links)) {
      linksEl.innerHTML = c.links
        .map((link) => {
          const attrs = link.external
            ? ' target="_blank" rel="noreferrer"'
            : "";
          return `<a href="${escapeHtml(link.href)}"${attrs}>${escapeHtml(link.label)}</a>`;
        })
        .join("");
    }
  }

  function renderFooter(data) {
    const f = data.footer || {};
    setText(document.getElementById("footer-copy"), f.copy);
    setText(document.getElementById("footer-secondary"), f.secondary);
  }

  // --- Contact form: open mail client with draft ---

  function setupContactForm(contentData) {
    const form = document.getElementById("contact-form");
    const formOutput = document.getElementById("form-output");
    const contact = contentData.contact || {};
    const mailtoEmail = contact.mailtoEmail || contact.email || "krupalvora789@gmail.com";
    const defaultMessage =
      contact.introDefaultMessage ||
      "I'd love to connect about a potential opportunity.";

    if (!form || !formOutput) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const formData = new FormData(form);
      const name = String(formData.get("name") || "").trim();
      const email = String(formData.get("email") || "").trim();
      const message = String(formData.get("message") || "").trim();

      if (!name || !email) {
        formOutput.textContent = "Please add at least your name and email.";
        formOutput.classList.add("error");
        return;
      }

      const subject = "Quick intro from " + name;
      const body = [
        "Hi Krupal,",
        "",
        "I'm " + name + " (" + email + ").",
        message ? "Here's what we're building / looking for:\n\n" + message : defaultMessage,
        "",
        "Looking forward to speaking!",
      ].join("\n");

      const mailto =
        "mailto:" +
        encodeURIComponent(mailtoEmail) +
        "?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(body);

      formOutput.classList.remove("error");
      formOutput.textContent = "Opening your mail app…";

      window.location.href = mailto;
    });
  }

  // --- Project filters (after projects are rendered) ---

  function setupProjectFilters() {
    const filterButtons = document.querySelectorAll(".filter-btn");
    const projectCards = document.querySelectorAll(".project-card");

    filterButtons.forEach((btn) => {
      btn.addEventListener("click", function () {
        const filter = btn.dataset.filter || "all";

        filterButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        projectCards.forEach((card) => {
          const tags = (card.dataset.tags || "").split(" ");
          const show = filter === "all" || tags.includes(filter);
          card.style.display = show ? "" : "none";
        });
      });
    });
  }

  // --- Smooth scroll ---

  function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", function (event) {
        const href = anchor.getAttribute("href");
        if (!href || href === "#" || href === "#top") return;

        const target = document.querySelector(href);
        if (!target) return;

        event.preventDefault();
        const yOffset = -68;
        const y =
          target.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: "smooth" });
      });
    });
  }

  // --- Mobile nav ---

  function setupMobileNav() {
    const navToggle = document.querySelector(".nav-toggle");
    const navList = document.querySelector(".nav-list");

    if (!navToggle || !navList) return;

    navToggle.addEventListener("click", function () {
      const isOpen = navList.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(isOpen));

      const spans = navToggle.querySelectorAll("span");
      const [line1, line2] = spans;
      if (isOpen && line1 && line2) {
        line1.style.transform = "translateY(3px) rotate(45deg)";
        line2.style.transform = "translateY(-3px) rotate(-45deg)";
        line2.style.opacity = "1";
      } else if (line1 && line2) {
        line1.style.transform = "";
        line2.style.transform = "";
        line2.style.opacity = "1";
      }
    });

    navList.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", function () {
        if (window.innerWidth <= 768 && navList.classList.contains("open")) {
          navList.classList.remove("open");
          navToggle.setAttribute("aria-expanded", "false");
          const spans = navToggle.querySelectorAll("span");
          if (spans[0]) spans[0].style.transform = "";
          if (spans[1]) {
            spans[1].style.transform = "";
            spans[1].style.opacity = "1";
          }
        }
      });
    });
  }

  // --- Footer year ---

  function setFooterYear() {
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  // --- Init: fetch content and render ---

  fetch("content.json")
    .then((r) => {
      if (!r.ok) throw new Error("Failed to load content.json");
      return r.json();
    })
    .then((data) => {
      renderSite(data);
      renderHero(data);
      renderAbout(data);
      renderExperience(data);
      renderSkills(data);
      renderProjects(data);
      renderContributions(data);
      renderContact(data);
      renderFooter(data);

      setupContactForm(data);
      setupProjectFilters();
      setupSmoothScroll();
      setupMobileNav();
      setFooterYear();
    })
    .catch((err) => {
      console.error(err);
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<p style="padding:1rem;color:#f97373;">Could not load content.json. Check the file path and CORS if using file://.</p>'
      );
    });
})();
