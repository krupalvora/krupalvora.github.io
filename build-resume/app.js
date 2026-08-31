/* ==========================================================================
   Resume builder - /build-resume
   Vanilla JS, no build step. Data lives in localStorage; the A4 preview on the
   right is what gets printed (see the @media print block in builder.css).
   ========================================================================== */
(function () {
  "use strict";

  var STORE_KEY = "kv:resume-builder:v1";
  var PDFJS_BASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";

  /* ------------------------------------------------------------ seed data */
  function seed() {
    return {
      version: 1,
      order: ["summary", "experience", "extra:oss", "skills", "projects", "awards", "education"],
      labels: {
        summary: "Professional Summary",
        experience: "Professional Experience",
        skills: "Technical Skills",
        projects: "Personal Projects",
        awards: "Certifications & Achievements",
        education: "Education"
      },
      basics: {
        name: "Krupal Vinod Vora",
        headline: "Senior Software Engineer | ERP & Cloud Architecture",
        location: "Mumbai, India",
        phone: "+91 8104409285",
        email: "krupalvora789@gmail.com",
        links: [
          { label: "LinkedIn", url: "https://www.linkedin.com/in/krupalvora" },
          { label: "GitHub", url: "https://github.com/krupalvora" },
          { label: "Portfolio", url: "https://krupalvora.github.io/" },
          { label: "Medium", url: "https://medium.com/@krupalvora" }
        ]
      },
      summary:
        "Senior Software Engineer with 4+ years of experience designing, building, and operating production-grade ERP and data systems on AWS. Currently lead the ERP function at SolarSquare, single-handedly managing a horizontally scaled ERPNext platform serving 450+ users across finance, supply chain, and warehouse operations. Strong background in distributed systems, backend integrations, observability, and IT General Controls (ITGC) for audit and IPO readiness.",
      experience: [
        {
          role: "Software Development Engineer II (SDE-2)",
          company: "Solar Square Energy",
          location: "Mumbai, India",
          start: "Oct 2024",
          end: "Present",
          bullets: [
            "**Leading the ERP POD at SolarSquare,** architecting and operating a horizontally scaled, distributed, cloud-native ERP platform on AWS \u2014 Auto Scaling Group web tier (Gunicorn/Nginx/SocketIO), dedicated worker fleet, ElastiCache Redis, RDS MariaDB, S3, and Lambda \u2014 delivering enterprise-grade performance and elasticity for 450+ users across supply chain, finance, and warehouse operations (B2B & B2C).",
            "**Engineered and integrated mission-critical backend systems** \u2014 banking and payment gateway APIs, AMC lifecycle automation, and an Order Management System (OMS) \u2014 enabling end-to-end financial transactions and order automation across B2B and B2C channels.",
            "**Inventory tracking & loss prevention** \u2014 built workflows and data pipelines that identified and prevented ~\u20b920 Lakhs of mid-mile logistics losses, improving operational transparency and warehouse efficiency.",
            "**Implemented DevOps and observability best practices** by integrating Kibana for centralized logging and building an automated CI/CD pipeline with the GitHub API and LLM-powered (Claude, OpenCode) code reviews, improving developer velocity, code quality, and release efficiency.",
            "**Strengthened IT General Controls (ITGC) posture for IPO readiness** by building a custom Role-Based Access Control (RBAC) framework with end-to-end activity logging, implementing maker-checker approval workflows on sensitive financial transactions (enforcing segregation of duties), and developing an audit framework that captures access, change, and approval evidence into structured reports \u2014 directly addressing the access, change, and operations control domains expected in SOX and ITGC audits."
          ],
          groups: []
        },
        {
          role: "Associate Consultant",
          company: "DataCurate Technologies",
          location: "Mumbai, India",
          start: "Jun 2022",
          end: "Oct 2024",
          bullets: [],
          groups: [
            {
              client: "Client: HDFC ERGO",
              bullets: [
                "Engineered a supervised machine learning model to target WhatsApp campaigns at users with elevated lead-conversion probability, cutting messaging costs by 70% and significantly improving lead conversion efficacy.",
                "Collaborated with Marketing and Engineering teams to build a unified marketing data pipeline optimising email, SMS, and WhatsApp channels, contributing to a 6% lift in overall lead conversion."
              ]
            },
            {
              client: "Client: Star Health Insurance",
              bullets: [
                "Built ETL workflows, a Detail Data Store (DDS), automation scripts, production reports, and analytical dashboards using SQL and SAS-based technologies in a production environment.",
                "Contributed to fraud-detection mechanisms leveraging data warehousing, rule engines, and custom rule sets exposed via APIs."
              ]
            }
          ]
        }
      ],
      extras: [
        {
          id: "oss",
          label: "Open Source Contributions",
          items: [
            {
              name: "frappe/erpnext \u2014 Core Stock Module Performance Optimization \u00b7 [PR #51644](https://github.com/frappe/erpnext/pull/51644)",
              org: "World's leading open-source ERP platform \u00b7 33.9K+ GitHub stars \u00b7 11.3K+ forks",
              start: "",
              end: "",
              bullets: [
                "Refactored get_stock_ledgers_for_serial_nos to leverage ERPNext v15's Serial and Batch Bundle data model, replacing application-layer filtering with bundle-based SQL joins for serial-number validation while preserving backward compatibility with legacy SLE serial data.",
                "Reduced query execution time from ~583s to ~67s (~8.7\u00d7 faster) and database queries from ~104K to ~14.5K (~86% reduction) on serial-tracked datasets \u2014 directly improving Delivery Note, Purchase Receipt, Stock Entry, and Stock Reconciliation workflows for the global ERPNext community."
              ]
            }
          ]
        }
      ],
      skills: [
        { label: "Languages", items: "Python, SQL, JavaScript, HTML/CSS" },
        { label: "Frameworks & Platforms", items: "Frappe, ERPNext, Flask, FastAPI" },
        { label: "Cloud & Infrastructure", items: "AWS (EC2, Auto Scaling Groups, RDS MariaDB, ElastiCache Redis, S3, Lambda, CloudWatch, IAM), Nginx, Linux / Bash, Docker" },
        { label: "Data & Analytics", items: "ETL, Data Pipelines, Analytics, SAS" },
        { label: "DevOps & Tooling", items: "Git / GitHub, CI/CD, Kibana, Supervisor" },
        { label: "Other", items: "REST APIs, System Design, GenAI / LLM Integration, DSA" }
      ],
      projects: [
        {
          name: "Real-Time Product Recommendation System for ERPNext POS",
          bullets: [
            "Built a real-time product recommendation engine for ERPNext POS using the Apriori algorithm with Pandas and mlxtend, enabling intelligent upsell suggestions at the point of sale."
          ]
        },
        {
          name: "Amba Tech (NGO) \u2014 Event Management ERP",
          bullets: [
            "Designed and developed an end-to-end ERP system with an Angular web app, mobile app, and Metabase dashboards for event management. Implemented a QR-based attendance system to enable precise tracking and data-driven decisions for the organising team."
          ]
        }
      ],
      awards: [
        "**Microsoft Certified: Azure Fundamentals (AZ-900)** \u2014 Mar 2023",
        "**Winner \u2014 Mumbai Hackathon 2022**, hosted by Zerodha and Frappe \u2014 Mar 2022"
      ],
      education: [
        {
          degree: "Bachelor of Engineering, Information Technology",
          institution: "University of Mumbai",
          location: "Mumbai, India",
          start: "Jul 2018",
          end: "Jun 2022"
        }
      ]
    };
  }

  var BLANK = {
    link: function () { return { label: "", url: "" }; },
    experience: function () { return { role: "", company: "", location: "", start: "", end: "", bullets: [""], groups: [] }; },
    group: function () { return { client: "Client: ", bullets: [""] }; },
    skill: function () { return { label: "", items: "" }; },
    project: function () { return { name: "", bullets: [""] }; },
    education: function () { return { degree: "", institution: "", location: "", start: "", end: "" }; },
    extraItem: function () { return { name: "", org: "", start: "", end: "", bullets: [""] }; }
  };

  var FIXED_SECTIONS = ["summary", "experience", "skills", "projects", "awards", "education"];

  var FMT_HINT_SHORT = "**bold** and [text](url) work.";
  var FMT_HINT = "One per line. " + FMT_HINT_SHORT;

  /* ---------------------------------------------------------------- utils */
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* Only http(s)/mailto get through - anything else renders as plain text so a
     pasted "javascript:" can never become a live link. */
  function safeUrl(u) {
    var raw = String(u || "").replace(/&amp;/g, "&").trim();
    if (/^(https?:\/\/|mailto:)/i.test(raw)) return esc(raw);
    if (/^www\./i.test(raw)) return esc("https://" + raw);
    if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(raw)) return esc("mailto:" + raw);
    return null;
  }

  /* Inline markdown used across the resume: **bold** and [label](url). */
  var LINK_RE = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;
  function inline(s) {
    return esc(s)
      .replace(LINK_RE, function (m, label, url) {
        var href = safeUrl(url);
        return href ? '<a href="' + href + '" target="_blank" rel="noopener">' + label + "</a>" : label;
      })
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  /* Same markdown, flattened for the plain-text export. */
  function plain(s) {
    return String(s || "")
      .replace(LINK_RE, function (m, label, url) { return label + " (" + url + ")"; })
      .replace(/\*\*/g, "");
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lines(arr) { return (arr || []).join("\n"); }
  function nonEmpty(arr) { return (arr || []).filter(function (s) { return String(s || "").trim() !== ""; }); }

  function getAt(obj, path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }
  function setAt(obj, path, val) {
    var ks = path.split("."), last = ks.pop();
    var t = ks.reduce(function (o, k) { return o[k]; }, obj);
    t[last] = val;
  }

  /* -------------------------------------------------------------- storage */
  var data = load() || seed();

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      return normalize(JSON.parse(raw));
    } catch (e) { return null; }
  }

  var saveTimer = null;
  function save(immediate) {
    clearTimeout(saveTimer);
    var run = function () {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
        var t = new Date();
        el("save-state").textContent = "saved " + t.toTimeString().slice(0, 8);
      } catch (e) {
        el("save-state").textContent = "not saved (storage blocked)";
      }
    };
    if (immediate) run(); else saveTimer = setTimeout(run, 500);
  }

  /* Fill in anything a hand-edited or older JSON file is missing. */
  function normalize(d) {
    var base = seed(), out = d && typeof d === "object" ? d : {};
    out.version = 1;
    out.labels = Object.assign({}, base.labels, out.labels || {});
    out.basics = Object.assign({ name: "", headline: "", location: "", phone: "", email: "", links: [] }, out.basics || {});
    if (!Array.isArray(out.basics.links)) out.basics.links = [];
    out.summary = typeof out.summary === "string" ? out.summary : "";

    out.experience = (Array.isArray(out.experience) ? out.experience : []).map(function (e) {
      e = Object.assign({ role: "", company: "", location: "", start: "", end: "", bullets: [], groups: [] }, e || {});
      if (!Array.isArray(e.bullets)) e.bullets = [];
      e.groups = (Array.isArray(e.groups) ? e.groups : []).map(function (g) {
        g = Object.assign({ client: "", bullets: [] }, g || {});
        if (!Array.isArray(g.bullets)) g.bullets = [];
        return g;
      });
      return e;
    });
    out.skills = (Array.isArray(out.skills) ? out.skills : []).map(function (k) {
      return Object.assign({ label: "", items: "" }, k || {});
    });
    out.projects = (Array.isArray(out.projects) ? out.projects : []).map(function (p) {
      p = Object.assign({ name: "", bullets: [] }, p || {});
      if (!Array.isArray(p.bullets)) p.bullets = [];
      return p;
    });
    out.awards = Array.isArray(out.awards) ? out.awards : [];
    out.education = (Array.isArray(out.education) ? out.education : []).map(function (e) {
      return Object.assign({ degree: "", institution: "", location: "", start: "", end: "" }, e || {});
    });

    /* custom sections, each with its own heading and entries */
    var usedIds = {};
    out.extras = (Array.isArray(out.extras) ? out.extras : []).map(function (x, i) {
      x = Object.assign({ id: "", label: "Section", items: [] }, x || {});
      if (!x.id || usedIds[x.id]) x.id = "x" + i + "-" + Math.random().toString(36).slice(2, 6);
      usedIds[x.id] = true;
      x.items = (Array.isArray(x.items) ? x.items : []).map(function (it) {
        it = Object.assign({ name: "", org: "", start: "", end: "", bullets: [] }, it || {});
        if (!Array.isArray(it.bullets)) it.bullets = [];
        return it;
      });
      return x;
    });

    /* section order: keep what is known and valid, append anything missing */
    var valid = FIXED_SECTIONS.concat(out.extras.map(function (x) { return "extra:" + x.id; }));
    var seen = {};
    out.order = (Array.isArray(out.order) ? out.order : []).filter(function (k) {
      if (seen[k] || valid.indexOf(k) === -1) return false;
      seen[k] = true;
      return true;
    });
    valid.forEach(function (k) { if (!seen[k]) out.order.push(k); });
    return out;
  }

  function extraById(id) {
    for (var i = 0; i < data.extras.length; i++) if (data.extras[i].id === id) return { x: data.extras[i], i: i };
    return null;
  }
  function sectionKind(key) { return key.indexOf("extra:") === 0 ? "extra" : key; }

  /* =====================================================================
     EDITOR
     ===================================================================== */
  function txt(path, label, hint, type) {
    return '<label class="fld"><span>' + esc(label) +
      (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + "</span>" +
      '<input type="' + (type || "text") + '" data-path="' + esc(path) + '" value="' + esc(getAt(data, path) || "") + '" /></label>';
  }
  function area(path, label, hint, rows) {
    return '<label class="fld"><span>' + esc(label) +
      (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + "</span>" +
      '<textarea rows="' + (rows || 4) + '" data-path="' + esc(path) + '">' + esc(getAt(data, path) || "") + "</textarea></label>";
  }
  function listArea(path, label, hint, rows) {
    return '<label class="fld"><span>' + esc(label) +
      (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + "</span>" +
      '<textarea rows="' + (rows || 5) + '" data-path="' + esc(path) + '" data-list="lines">' +
      esc(lines(getAt(data, path))) + "</textarea></label>";
  }
  function rowTools(listPath, i, len) {
    return '<div class="icon-row">' +
      '<button class="icon-btn" type="button" data-act="move" data-list="' + esc(listPath) + '" data-i="' + i + '" data-dir="-1" title="Move up" aria-label="Move up"' + (i === 0 ? " disabled" : "") + ">&#9650;</button>" +
      '<button class="icon-btn" type="button" data-act="move" data-list="' + esc(listPath) + '" data-i="' + i + '" data-dir="1" title="Move down" aria-label="Move down"' + (i === len - 1 ? " disabled" : "") + ">&#9660;</button>" +
      '<button class="icon-btn danger" type="button" data-act="del" data-list="' + esc(listPath) + '" data-i="' + i + '" title="Remove" aria-label="Remove">&#10005;</button>' +
      "</div>";
  }
  /* A section fieldset: heading, optional reorder/remove controls, body. */
  function fset(title, body, opts) {
    opts = opts || {};
    var tools = "";
    if (opts.orderIdx != null) {
      var i = opts.orderIdx, n = data.order.length;
      tools += '<button class="icon-btn" type="button" data-act="movesec" data-i="' + i + '" data-dir="-1" title="Move section up" aria-label="Move section up"' + (i === 0 ? " disabled" : "") + ">&#9650;</button>" +
        '<button class="icon-btn" type="button" data-act="movesec" data-i="' + i + '" data-dir="1" title="Move section down" aria-label="Move section down"' + (i === n - 1 ? " disabled" : "") + ">&#9660;</button>";
    }
    if (opts.removeKey) {
      tools += '<button class="icon-btn danger" type="button" data-act="delsec" data-key="' + esc(opts.removeKey) + '" title="Remove section" aria-label="Remove section">&#10005;</button>';
    }
    var add = opts.addKind
      ? '<button class="add-btn" type="button" data-act="add" data-kind="' + esc(opts.addKind) + '" data-list="' + esc(opts.addList) + '">+ ' + esc(opts.addLabel) + "</button>"
      : "";
    return '<section class="fset"><div class="fset-head"><h2 class="fset-title">' + esc(title) + "</h2>" +
      '<span class="head-tools">' + add + (tools ? '<span class="icon-row">' + tools + "</span>" : "") + "</span></div>" +
      body + "</section>";
  }

  /* ---- one builder per section kind: returns the editor markup ---- */
  var FORM = {
    summary: function () {
      return txt("labels.summary", "Section heading") + area("summary", "Summary", FMT_HINT_SHORT, 6);
    },

    experience: function () {
      return txt("labels.experience", "Section heading") +
        data.experience.map(function (e, i) {
          var p = "experience." + i;
          return '<div class="card"><div class="card-head"><span class="card-idx">' + esc(e.role || "role " + (i + 1)) + "</span>" +
            rowTools("experience", i, data.experience.length) + "</div>" +
            txt(p + ".role", "Role / title") +
            '<div class="grid2">' + txt(p + ".company", "Company") + txt(p + ".location", "Location") + "</div>" +
            '<div class="grid2">' + txt(p + ".start", "Start", "e.g. Oct 2024") + txt(p + ".end", "End", "e.g. Present") + "</div>" +
            listArea(p + ".bullets", "Bullets", FMT_HINT, 7) +
            e.groups.map(function (g, j) {
              var gp = p + ".groups." + j;
              return '<div class="card sub"><div class="card-head"><span class="card-idx">sub-group ' + (j + 1) + "</span>" +
                rowTools(p + ".groups", j, e.groups.length) + "</div>" +
                txt(gp + ".client", "Sub-heading", 'e.g. "Client: HDFC ERGO"') +
                listArea(gp + ".bullets", "Bullets", FMT_HINT, 5) + "</div>";
            }).join("") +
            '<div class="row-actions"><button class="add-btn" type="button" data-act="add" data-kind="group" data-list="' + p + '.groups">+ Add client / sub-group</button></div>' +
            "</div>";
        }).join("");
    },

    skills: function () {
      return txt("labels.skills", "Section heading") +
        data.skills.map(function (sk, i) {
          return '<div class="card sub"><div class="card-head"><span class="card-idx">' + esc(sk.label || "group " + (i + 1)) + "</span>" +
            rowTools("skills", i, data.skills.length) + "</div>" +
            txt("skills." + i + ".label", "Category") +
            area("skills." + i + ".items", "Items", "Comma-separated. " + FMT_HINT_SHORT, 2) + "</div>";
        }).join("");
    },

    projects: function () {
      return txt("labels.projects", "Section heading") +
        data.projects.map(function (p, i) {
          return '<div class="card"><div class="card-head"><span class="card-idx">' + esc(p.name || "project " + (i + 1)) + "</span>" +
            rowTools("projects", i, data.projects.length) + "</div>" +
            txt("projects." + i + ".name", "Project name") +
            listArea("projects." + i + ".bullets", "Bullets", FMT_HINT, 4) + "</div>";
        }).join("");
    },

    awards: function () {
      return txt("labels.awards", "Section heading") +
        listArea("awards", "Entries", FMT_HINT, 4);
    },

    education: function () {
      return txt("labels.education", "Section heading") +
        data.education.map(function (e, i) {
          var p = "education." + i;
          return '<div class="card"><div class="card-head"><span class="card-idx">' + esc(e.degree || "entry " + (i + 1)) + "</span>" +
            rowTools("education", i, data.education.length) + "</div>" +
            txt(p + ".degree", "Degree") +
            '<div class="grid2">' + txt(p + ".institution", "Institution") + txt(p + ".location", "Location") + "</div>" +
            '<div class="grid2">' + txt(p + ".start", "Start") + txt(p + ".end", "End") + "</div></div>";
        }).join("");
    },

    extra: function (found) {
      var xi = found.i, x = found.x, p = "extras." + xi;
      return txt(p + ".label", "Section heading") +
        x.items.map(function (it, j) {
          var ip = p + ".items." + j;
          return '<div class="card"><div class="card-head"><span class="card-idx">' + esc(it.name || "entry " + (j + 1)) + "</span>" +
            rowTools(p + ".items", j, x.items.length) + "</div>" +
            txt(ip + ".name", "Title") +
            txt(ip + ".org", "Sub-line", "Shown in italics under the title") +
            '<div class="grid2">' + txt(ip + ".start", "Start", "optional") + txt(ip + ".end", "End", "optional") + "</div>" +
            listArea(ip + ".bullets", "Bullets", FMT_HINT, 5) + "</div>";
        }).join("");
    }
  };

  var FORM_META = {
    summary: { title: "Summary" },
    experience: { title: "Experience", addKind: "experience", addList: "experience", addLabel: "Add role" },
    skills: { title: "Skills", addKind: "skill", addList: "skills", addLabel: "Add category" },
    projects: { title: "Projects", addKind: "project", addList: "projects", addLabel: "Add project" },
    awards: { title: "Certifications & achievements" },
    education: { title: "Education", addKind: "education", addList: "education", addLabel: "Add education" }
  };

  function renderForm() {
    var h = [];

    /* header block is always first and never moves */
    h.push(fset("Header",
      txt("basics.name", "Full name") +
      txt("basics.headline", "Headline", "Shown under the name") +
      '<div class="grid3">' +
        txt("basics.location", "Location") +
        txt("basics.phone", "Phone") +
        txt("basics.email", "Email", "", "email") +
      "</div>" +
      data.basics.links.map(function (l, i) {
        return '<div class="card sub"><div class="card-head"><span class="card-idx">link ' + (i + 1) + "</span>" +
          rowTools("basics.links", i, data.basics.links.length) + "</div>" +
          '<div class="grid2">' + txt("basics.links." + i + ".label", "Label") + txt("basics.links." + i + ".url", "URL", "", "url") + "</div></div>";
      }).join(""),
      { addKind: "link", addList: "basics.links", addLabel: "Add link" }));

    data.order.forEach(function (key, idx) {
      var kind = sectionKind(key);
      if (kind === "extra") {
        var found = extraById(key.slice(6));
        if (!found) return;
        h.push(fset(found.x.label || "Custom section", FORM.extra(found), {
          orderIdx: idx, removeKey: key,
          addKind: "extraItem", addList: "extras." + found.i + ".items", addLabel: "Add entry"
        }));
      } else {
        var meta = FORM_META[kind];
        if (!meta) return;
        h.push(fset(meta.title, FORM[kind](), {
          orderIdx: idx, addKind: meta.addKind, addList: meta.addList, addLabel: meta.addLabel
        }));
      }
    });

    h.push('<div class="row-actions" style="margin-top:22px">' +
      '<button class="add-btn" type="button" data-act="addsec">+ Add custom section</button></div>');

    el("form").innerHTML = h.join("");
  }

  /* =====================================================================
     PREVIEW  (this markup is what prints)
     ===================================================================== */
  function dateRange(a, b) {
    a = String(a || "").trim(); b = String(b || "").trim();
    if (a && b) return a + " – " + b;
    return a || b;
  }
  function ul(bullets) {
    var items = nonEmpty(bullets);
    if (!items.length) return "";
    return "<ul>" + items.map(function (b) { return "<li>" + inline(b) + "</li>"; }).join("") + "</ul>";
  }
  function section(label, body) {
    if (!body) return "";
    return '<section class="r-sec"><h2>' + esc(label) + "</h2>" + body + "</section>";
  }

  /* ---- one builder per section kind: returns the printed markup ---- */
  var VIEW = {
    summary: function () {
      return String(data.summary || "").trim() ? "<p>" + inline(data.summary) + "</p>" : "";
    },

    experience: function () {
      return data.experience.map(function (e) {
        var body = '<div class="r-item">' + itemTop(e.role, dateRange(e.start, e.end));
        var org = [e.company, e.location].filter(Boolean).join("  |  ");
        if (org) body += '<p class="r-org">' + inline(org) + "</p>";
        body += ul(e.bullets);
        body += e.groups.map(function (g) {
          return (String(g.client || "").trim() ? '<p class="r-client">' + inline(g.client) + "</p>" : "") + ul(g.bullets);
        }).join("");
        return body + "</div>";
      }).join("");
    },

    skills: function () {
      return data.skills.filter(function (sk) { return (sk.label || sk.items || "").trim(); })
        .map(function (sk) {
          return '<p class="r-skill"><strong>' + inline(sk.label) + (sk.label ? ":" : "") + "</strong> " + inline(sk.items) + "</p>";
        }).join("");
    },

    projects: function () {
      return data.projects.filter(function (p) { return (p.name || "").trim() || nonEmpty(p.bullets).length; })
        .map(function (p) {
          return '<div class="r-item"><p class="r-item-title">' + inline(p.name) + "</p>" + ul(p.bullets) + "</div>";
        }).join("");
    },

    awards: function () { return ul(data.awards); },

    education: function () {
      return data.education.filter(function (e) { return (e.degree || e.institution || "").trim(); })
        .map(function (e) {
          var body = '<div class="r-item">' + itemTop(e.degree, dateRange(e.start, e.end));
          var org = [e.institution, e.location].filter(Boolean).join("  |  ");
          if (org) body += '<p class="r-org">' + inline(org) + "</p>";
          return body + "</div>";
        }).join("");
    },

    extra: function (x) {
      return x.items.filter(function (it) {
        return (it.name || it.org || "").trim() || nonEmpty(it.bullets).length;
      }).map(function (it) {
        var body = '<div class="r-item">' + itemTop(it.name, dateRange(it.start, it.end));
        if (String(it.org || "").trim()) body += '<p class="r-org">' + inline(it.org) + "</p>";
        return body + ul(it.bullets) + "</div>";
      }).join("");
    }
  };

  function itemTop(title, dates) {
    return '<div class="r-item-top"><span class="r-item-title">' + inline(title) + "</span>" +
      (dates ? '<span class="r-dates">' + esc(dates) + "</span>" : "") + "</div>";
  }

  function renderPreview() {
    var b = data.basics, h = [];

    h.push('<h1 class="r-name">' + esc(b.name || "Your Name") + "</h1>");
    if (String(b.headline || "").trim()) h.push('<p class="r-sub">' + inline(b.headline) + "</p>");

    var contact = [];
    if (b.location) contact.push(esc(b.location));
    if (b.phone) contact.push(esc(b.phone));
    if (b.email) contact.push('<a href="mailto:' + esc(b.email) + '">' + esc(b.email) + "</a>");
    if (contact.length) h.push('<p class="r-sub">' + contact.join(" | ") + "</p>");

    var links = b.links.filter(function (l) { return (l.label || l.url || "").trim(); }).map(function (l) {
      var label = esc(l.label || l.url);
      return l.url ? '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + label + "</a>" : label;
    });
    if (links.length) h.push('<p class="r-sub">' + links.join(" | ") + "</p>");

    data.order.forEach(function (key) {
      var kind = sectionKind(key);
      if (kind === "extra") {
        var found = extraById(key.slice(6));
        if (found) h.push(section(found.x.label, VIEW.extra(found.x)));
      } else if (VIEW[kind]) {
        h.push(section(data.labels[kind], VIEW[kind]()));
      }
    });

    el("page").innerHTML = h.join("");
    document.title = b.name ? b.name + " - Resume" : "Resume Builder";
  }

  function renderAll() { renderForm(); renderPreview(); }

  /* =====================================================================
     PLAIN-TEXT EXPORT / IMPORT
     ===================================================================== */
  function toText() {
    var b = data.basics, out = [];
    out.push((b.name || "").toUpperCase());
    if (b.headline) out.push(b.headline);
    var c = [b.location, b.phone, b.email].filter(Boolean).join(" | ");
    if (c) out.push(c);
    var l = b.links.filter(function (x) { return x.label || x.url; })
      .map(function (x) { return x.url ? x.label + " (" + x.url + ")" : x.label; }).join(" | ");
    if (l) out.push(l);

    function head(t) { out.push("", plain(t).toUpperCase()); }
    function entry(title, dates, org, bullets) {
      out.push("", plain(title) + (dates ? "   " + dates : ""));
      if (org) out.push(plain(org));
      nonEmpty(bullets).forEach(function (x) { out.push("\u2022 " + plain(x)); });
    }

    data.order.forEach(function (key) {
      var kind = sectionKind(key);

      if (kind === "summary") {
        if (!String(data.summary || "").trim()) return;
        head(data.labels.summary);
        out.push(plain(data.summary));

      } else if (kind === "experience") {
        if (!data.experience.length) return;
        head(data.labels.experience);
        data.experience.forEach(function (e) {
          entry(e.role, dateRange(e.start, e.end), [e.company, e.location].filter(Boolean).join(" | "), e.bullets);
          e.groups.forEach(function (g) {
            if (g.client) out.push(plain(g.client));
            nonEmpty(g.bullets).forEach(function (x) { out.push("\u2022 " + plain(x)); });
          });
        });

      } else if (kind === "skills") {
        if (!data.skills.length) return;
        head(data.labels.skills);
        data.skills.forEach(function (sk) { if (sk.label || sk.items) out.push(plain(sk.label) + ": " + plain(sk.items)); });

      } else if (kind === "projects") {
        if (!data.projects.length) return;
        head(data.labels.projects);
        data.projects.forEach(function (p) {
          out.push(plain(p.name));
          nonEmpty(p.bullets).forEach(function (x) { out.push("\u2022 " + plain(x)); });
        });

      } else if (kind === "awards") {
        if (!nonEmpty(data.awards).length) return;
        head(data.labels.awards);
        nonEmpty(data.awards).forEach(function (x) { out.push("\u2022 " + plain(x)); });

      } else if (kind === "education") {
        if (!data.education.length) return;
        head(data.labels.education);
        data.education.forEach(function (e) {
          entry(e.degree, dateRange(e.start, e.end), [e.institution, e.location].filter(Boolean).join(" | "), []);
        });

      } else if (kind === "extra") {
        var found = extraById(key.slice(6));
        if (!found || !found.x.items.length) return;
        head(found.x.label);
        found.x.items.forEach(function (it) {
          entry(it.name, dateRange(it.start, it.end), it.org, it.bullets);
        });
      }
    });

    return out.join("\n") + "\n";
  }

  /* ---- resume text parser (best effort, tuned to the PDF's layout) ---- */
  var MON = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
  var ONE_DATE = "(?:" + MON + "\\s*'?\\d{2,4}|\\d{1,2}[/-]\\d{4}|\\d{4}|present|current|now|till date|ongoing)";
  var RANGE_RE = new RegExp("[\\s\\|,–—-]*(" + ONE_DATE + ")\\s*(?:-|–|—|to|until)\\s*(" + ONE_DATE + ")\\s*$", "i");
  var BULLET_RE = /^[•▪·◦*•▪\-–]\s+/;

  var SECTION_MAP = [
    [/^(?:professional|career|executive)?\s*(?:summary|profile|objective|about)\b/i, "summary"],
    [/^(?:professional|work|relevant|employment)?\s*(?:experience|history)\b/i, "experience"],
    [/^(?:technical|core)?\s*(?:skills|competencies|expertise|toolkit)\b/i, "skills"],
    [/^(?:personal|side|selected|key)?\s*projects\b/i, "projects"],
    [/^(?:certification|certificate|achievement|award|honor|honour)/i, "awards"],
    [/^education\b/i, "education"]
  ];

  function headingKey(line) {
    var t = line.replace(/[:._]+$/, "").trim();
    if (!t || t.length > 48 || BULLET_RE.test(t) || RANGE_RE.test(t)) return null;
    var letters = t.replace(/[^a-z]/gi, "");
    if (!letters) return null;
    var upperRatio = t.replace(/[^A-Z]/g, "").length / letters.length;
    var markdown = /^#{1,3}\s/.test(line);
    if (upperRatio <= 0.7 && !markdown) return null;
    t = t.replace(/^#{1,3}\s*/, "").replace(/\*\*/g, "").trim();

    for (var i = 0; i < SECTION_MAP.length; i++) {
      if (SECTION_MAP[i][0].test(t)) return { key: SECTION_MAP[i][1], label: titleCase(t) };
    }
    /* An unrecognised heading becomes a custom section - but only when it is
       clearly a heading (near-all-caps or markdown), so lines like
       "Client: HDFC ERGO" stay content. */
    if (markdown || upperRatio >= 0.9) return { key: "extra", label: titleCase(t) };
    return null;
  }
  function titleCase(s) {
    return s.toLowerCase().replace(/\b([a-z])/g, function (m, c) { return c.toUpperCase(); })
      .replace(/\bAnd\b/g, "and").replace(/\bOf\b/g, "of");
  }
  function splitPipes(s) {
    return s.split(/\s*[|·•]\s*|\s{3,}/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function stripBullet(s) { return s.replace(BULLET_RE, "").trim(); }
  function isContinuation(s) { return /^[a-z(,]/.test(s) || /^(and|or|with|using|the)\b/i.test(s); }
  /* PDF/text line wraps: "cloud-" + "native" must rejoin without a space. */
  function joinCont(prev, line) {
    return /[-\u2013\u2014/]$/.test(prev) ? prev + line : prev + " " + line;
  }
  /* A short line ending in a date range starts a new entry; a wrapped bullet
     that happens to end in a year does not. */
  function startsEntry(line, m) {
    if (!m || BULLET_RE.test(line)) return false;
    if (isContinuation(line)) return false;
    return line.slice(0, m.index).trim().length <= 90;
  }

  /* Walk the lines of an experience-shaped section into entries:
     "Title  <dates>" / "Org | Location" / bullets, with optional
     "Client: X" sub-groups. Wrapped lines are folded into the line above. */
  function parseEntries(ls) {
    var entries = [];
    ls.forEach(function (line) {
      var last = entries[entries.length - 1];
      var m = line.match(RANGE_RE);

      if (startsEntry(line, m)) {
        var head = line.slice(0, m.index).replace(/[\s|,\u2013\u2014-]+$/, "").trim();
        entries.push({ title: head, start: tidyDate(m[1]), end: tidyDate(m[2]), org: "", loc: "", bullets: [], groups: [] });
        return;
      }
      if (!last) {
        entries.push({ title: line.replace(/\*\*/g, ""), start: "", end: "", org: "", loc: "", bullets: [], groups: [] });
        return;
      }
      if (/^\**client\s*:/i.test(line) || /^\**(client|project)\b.*:\s*\S/i.test(line)) {
        last.groups.push({ client: line.replace(/\*\*/g, "").trim(), bullets: [] });
        return;
      }
      if (BULLET_RE.test(line)) {
        var sink = last.groups.length ? last.groups[last.groups.length - 1].bullets : last.bullets;
        sink.push(stripBullet(line));
        return;
      }
      var open = last.groups.length ? last.groups[last.groups.length - 1].bullets : last.bullets;
      if (open.length && isContinuation(line)) {
        open[open.length - 1] = joinCont(open[open.length - 1], line);
      } else if (!last.org) {
        var clean = line.replace(/\*\*/g, "");
        var parts = splitPipes(clean);
        last.org = parts[0] || clean;
        last.loc = parts.slice(1).join(", ");
        last.orgRaw = clean; /* custom sections keep the sub-line verbatim */
      } else if (open.length) {
        open[open.length - 1] = joinCont(open[open.length - 1], line);
      }
    });
    return entries;
  }

  function parseResumeText(text) {
    var d = normalize({});
    d.labels = seed().labels;

    var all = String(text || "").replace(/\r/g, "").replace(/\u00a0/g, " ")
      .split("\n").map(function (l) { return l.replace(/\s+$/, "").trim(); })
      .filter(function (l) { return l !== ""; });

    /* Where does the header (name / contact / links) end? The name line is
       usually all-caps too, so headings are only looked for from there on. */
    var headerEnd = -1;
    for (var i = 0; i < all.length; i++) {
      var probe = headingKey(all[i]);
      if (probe && probe.key !== "extra") { headerEnd = i; break; }
    }
    if (headerEnd === -1) {
      for (var j = 1; j < all.length; j++) {
        if (BULLET_RE.test(all[j]) || headingKey(all[j])) { headerEnd = j; break; }
      }
      if (headerEnd === -1) headerEnd = Math.min(4, all.length);
    }

    /* split into header block + sections, in document order */
    var header = all.slice(0, headerEnd), sections = [], cur = null;
    all.slice(headerEnd).forEach(function (line) {
      var hd = headingKey(line);
      if (hd) { cur = { key: hd.key, label: hd.label, lines: [] }; sections.push(cur); return; }
      if (cur) cur.lines.push(line);
    });

    /* ---- header ---- */
    if (header.length) {
      d.basics.name = titleCase(header[0].replace(/\*\*/g, ""));
      header.slice(1).forEach(function (line) {
        var parts = splitPipes(line);
        var hasContact = /@|\+?\d[\d\s()-]{6,}/.test(line);
        var hasUrl = /https?:\/\/|\[[^\]]+\]\(|linkedin|github|medium|portfolio|website/i.test(line);
        if (hasContact) {
          parts.forEach(function (p) {
            if (/@/.test(p) && !/^https?:/i.test(p)) d.basics.email = p.replace(/^mailto:/i, "");
            else if (/\+?\d[\d\s()-]{6,}/.test(p)) d.basics.phone = p;
            else if (!d.basics.location) d.basics.location = p;
          });
        } else if (hasUrl) {
          parts.forEach(function (p) {
            var md = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            var paren = p.match(/^(.+?)\s*\((https?:\/\/[^)]+)\)$/);
            if (md) d.basics.links.push({ label: md[1].trim(), url: md[2].trim() });
            else if (paren) d.basics.links.push({ label: paren[1].trim(), url: paren[2].trim() });
            else if (/^https?:\/\//i.test(p)) d.basics.links.push({ label: p.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0], url: p });
            else d.basics.links.push({ label: p, url: "" });
          });
        } else if (!d.basics.headline) {
          d.basics.headline = line.replace(/\*\*/g, "");
        }
      });
    }

    /* ---- sections, in the order the document had them ---- */
    d.order = [];
    var extraSeq = 0;

    sections.forEach(function (sec) {
      var ls = sec.lines;

      if (sec.key === "extra") {
        var id = "s" + (++extraSeq);
        var entries = parseEntries(ls);
        d.extras.push({
          id: id,
          label: sec.label,
          items: entries.map(function (e) {
            return { name: e.title, org: e.orgRaw || "", start: e.start, end: e.end, bullets: e.bullets };
          })
        });
        d.order.push("extra:" + id);
        return;
      }

      if (d.order.indexOf(sec.key) === -1) d.order.push(sec.key);
      d.labels[sec.key] = sec.label;

      if (sec.key === "summary") { d.summary = ls.join(" ").trim(); return; }

      if (sec.key === "skills") {
        ls.forEach(function (line) {
          line = stripBullet(line).replace(/\*\*/g, "");
          var m = line.match(/^([^:]{2,44}):\s*(.*)$/);
          if (m) d.skills.push({ label: m[1].trim(), items: m[2].trim() });
          else if (d.skills.length) d.skills[d.skills.length - 1].items = joinCont(d.skills[d.skills.length - 1].items, line);
          else d.skills.push({ label: "Skills", items: line });
        });
        return;
      }

      if (sec.key === "awards") {
        ls.forEach(function (line) {
          if (BULLET_RE.test(line) || !d.awards.length) d.awards.push(stripBullet(line));
          else if (isContinuation(line)) d.awards[d.awards.length - 1] = joinCont(d.awards[d.awards.length - 1], line);
          else d.awards.push(line);
        });
        return;
      }

      if (sec.key === "projects") {
        ls.forEach(function (line) {
          var last = d.projects[d.projects.length - 1];
          if (BULLET_RE.test(line)) {
            if (!last) { last = BLANK.project(); last.bullets = []; d.projects.push(last); }
            last.bullets.push(stripBullet(line));
          } else if (last && last.bullets.length && isContinuation(line)) {
            last.bullets[last.bullets.length - 1] = joinCont(last.bullets[last.bullets.length - 1], line);
          } else {
            d.projects.push({ name: line.replace(/\*\*/g, "").replace(/:$/, ""), bullets: [] });
          }
        });
        return;
      }

      if (sec.key === "experience" || sec.key === "education") {
        var entries = parseEntries(ls);
        if (sec.key === "experience") {
          d.experience = entries.map(function (e) {
            return { role: e.title, company: e.org, location: e.loc, start: e.start, end: e.end, bullets: e.bullets, groups: e.groups };
          });
        } else {
          d.education = entries.map(function (e) {
            return { degree: e.title, institution: e.org, location: e.loc, start: e.start, end: e.end };
          });
        }
      }
    });

    return normalize(d);
  }

  function tidyDate(s) {
    s = String(s).trim().replace(/\.$/, "");
    if (/^(present|current|now|ongoing|till date)$/i.test(s)) return titleCase(s);
    return s.replace(/^([a-z]{3,})/i, function (m) { return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase(); });
  }

  /* -------------------------------------------------------- PDF text read */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  function pdfToText(file) {
    return file.arrayBuffer()
      .then(function (buf) {
        var ready = window.pdfjsLib ? Promise.resolve() : loadScript(PDFJS_BASE + "pdf.min.js");
        return ready.then(function () {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "pdf.worker.min.js";
          return window.pdfjsLib.getDocument({ data: buf }).promise;
        });
      })
      .then(function (doc) {
        var pages = [];
        for (var i = 1; i <= doc.numPages; i++) pages.push(i);
        return pages.reduce(function (chain, n) {
          return chain.then(function (acc) {
            return doc.getPage(n).then(function (page) { return page.getTextContent(); })
              .then(function (tc) { return acc.concat(itemsToLines(tc.items)); });
          });
        }, Promise.resolve([]));
      })
      .then(function (ls) { return ls.join("\n"); });
  }

  /* Rebuild visual lines: group text items by y, order by x. */
  function itemsToLines(items) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str) return;
      var y = Math.round(it.transform[5] * 2) / 2;
      var x = it.transform[4];
      var row = null;
      for (var i = rows.length - 1; i >= 0 && i >= rows.length - 4; i--) {
        if (Math.abs(rows[i].y - y) <= 2.2) { row = rows[i]; break; }
      }
      if (!row) { row = { y: y, cells: [] }; rows.push(row); }
      row.cells.push({ x: x, w: it.width || it.str.length * 4.4, s: it.str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.cells.sort(function (a, b) { return a.x - b.x; });
      var out = "", prev = null;
      r.cells.forEach(function (c) {
        /* a real horizontal gap means separate columns (title vs dates) */
        if (prev !== null && c.x - prev > 8 && !/\s$/.test(out) && !/^\s/.test(c.s)) out += "   ";
        out += c.s;
        prev = c.x + c.w;
      });
      return out.replace(/\s+/g, function (m) { return m.length >= 3 ? "   " : " "; }).trim();
    }).filter(Boolean);
  }

  /* =====================================================================
     WIRING
     ===================================================================== */
  function note(msg, isError) {
    var n = el("import-note");
    n.textContent = msg;
    n.className = "import-note" + (isError ? " error" : "");
    n.hidden = false;
  }

  /* text/number inputs: patch the model, repaint only the preview so focus
     and caret position survive typing. */
  el("form").addEventListener("input", function (ev) {
    var t = ev.target, path = t.getAttribute("data-path");
    if (!path) return;
    setAt(data, path, t.getAttribute("data-list") === "lines" ? t.value.split("\n") : t.value);
    renderPreview();
    save();
  });

  /* structural buttons: mutate, then repaint the form too. */
  el("form").addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");

    /* --- whole-section actions --- */
    if (act === "movesec") {
      var si = parseInt(btn.getAttribute("data-i"), 10);
      var sj = si + parseInt(btn.getAttribute("data-dir"), 10);
      if (sj < 0 || sj >= data.order.length) return;
      var swap = data.order[si]; data.order[si] = data.order[sj]; data.order[sj] = swap;
      renderAll(); save(true);
      return;
    }
    if (act === "addsec") {
      var label = prompt("Heading for the new section:", "Open Source Contributions");
      if (label == null || !label.trim()) return;
      var id = "s" + Date.now().toString(36);
      data.extras.push({ id: id, label: label.trim(), items: [BLANK.extraItem()] });
      data.order.push("extra:" + id);
      renderAll(); save(true);
      return;
    }
    if (act === "delsec") {
      var key = btn.getAttribute("data-key");
      var found = extraById(key.slice(6));
      if (!found) return;
      if (!confirm('Remove the "' + found.x.label + '" section and its entries?')) return;
      data.extras.splice(found.i, 1);
      data.order = data.order.filter(function (k) { return k !== key; });
      renderAll(); save(true);
      return;
    }

    /* --- list-item actions --- */
    var listPath = btn.getAttribute("data-list");
    var list = getAt(data, listPath);
    if (!Array.isArray(list)) return;
    var i = parseInt(btn.getAttribute("data-i"), 10);

    if (act === "add") list.push(BLANK[btn.getAttribute("data-kind")]());
    else if (act === "del") list.splice(i, 1);
    else if (act === "move") {
      var j = i + parseInt(btn.getAttribute("data-dir"), 10);
      if (j < 0 || j >= list.length) return;
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    } else return;

    renderAll();
    save(true);
  });

  /* ---- import ---- */
  function applyParsed(d, label) {
    data = d;
    renderAll();
    save(true);
    note(label);
  }

  function handleFile(file) {
    if (!file) return;
    var name = (file.name || "").toLowerCase();

    if (name.endsWith(".json") || file.type === "application/json") {
      file.text().then(function (t) {
        try {
          var parsed = JSON.parse(t);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("expected a resume object, exported from this builder");
          }
          data = normalize(parsed);
          renderAll(); save(true);
          note("Loaded " + file.name + ".");
        } catch (e) { note("That JSON could not be read: " + e.message, true); }
      });
      return;
    }

    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      note("Reading " + file.name + " …");
      pdfToText(file)
        .then(function (text) {
          applyParsed(parseResumeText(text), "Imported " + file.name + " - PDFs lose bold/italic styling, so skim each section and re-add **bold** lead-ins where you want them.");
        })
        .catch(function (e) {
          note("Could not read that PDF (" + e.message + "). Try copying the text and using “paste the text” instead.", true);
        });
      return;
    }

    file.text().then(function (t) {
      applyParsed(parseResumeText(t), "Imported " + file.name + " - check each section, then edit as needed.");
    });
  }

  el("import-file").addEventListener("change", function (ev) {
    handleFile(ev.target.files[0]);
    ev.target.value = "";
  });

  var dz = el("dropzone");
  ["dragenter", "dragover"].forEach(function (t) {
    dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add("hot"); });
  });
  ["dragleave", "drop"].forEach(function (t) {
    dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.remove("hot"); });
  });
  dz.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  dz.addEventListener("click", function (e) {
    if (e.target.id !== "paste-open") el("import-file").click();
  });

  el("paste-open").addEventListener("click", function (e) {
    e.stopPropagation();
    el("paste-panel").hidden = false;
    el("paste-text").focus();
  });
  el("paste-cancel").addEventListener("click", function () { el("paste-panel").hidden = true; });
  el("paste-parse").addEventListener("click", function () {
    var t = el("paste-text").value;
    if (!t.trim()) { note("Nothing to parse - paste your resume text first.", true); return; }
    applyParsed(parseResumeText(t), "Parsed pasted text - check each section, then edit as needed.");
    el("paste-panel").hidden = true;
  });

  /* ---- export ---- */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function slug() {
    return (data.basics.name || "resume").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "resume";
  }

  var menu = el("export-menu"), toggle = el("export-toggle"), list = el("export-list");
  function closeMenu() { list.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
  toggle.addEventListener("click", function () {
    list.hidden = !list.hidden;
    toggle.setAttribute("aria-expanded", String(!list.hidden));
  });
  document.addEventListener("click", function (e) { if (!menu.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  list.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    closeMenu();

    if (act === "export-json") download(slug() + "-resume.json", JSON.stringify(data, null, 2), "application/json");
    else if (act === "export-txt") download(slug() + "-resume.txt", toText(), "text/plain");
    else if (act === "reset") {
      if (confirm("Replace everything with the sample resume? Your current draft will be lost.")) {
        data = seed(); renderAll(); save(true); note("Loaded the sample resume.");
      }
    } else if (act === "clear") {
      if (confirm("Clear every field? Your current draft will be lost.")) {
        var empty = normalize({ extras: [], order: FIXED_SECTIONS.slice() });
        empty.experience = [BLANK.experience()];
        empty.skills = [BLANK.skill()];
        empty.education = [BLANK.education()];
        data = empty; renderAll(); save(true); note("Cleared. Start typing, or import a resume.");
      }
    }
  });

  el("download-pdf").addEventListener("click", function () { window.print(); });

  /* Cmd/Ctrl+P and Cmd/Ctrl+S both go to the print dialog (= save as PDF). */
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); window.print(); }
  });

  /* ---- zoom ---- */
  var zoomSel = el("zoom");
  var A4_PX = 793.7; /* 210mm at 96dpi */
  function applyZoom() {
    var v = zoomSel.value;
    if (v === "fit") {
      var avail = el("preview-scroll").clientWidth - 48;
      v = Math.max(0.3, Math.min(1, avail / A4_PX));
    }
    el("page").style.setProperty("--zoom", v);
  }
  zoomSel.addEventListener("change", function () {
    applyZoom();
    try { localStorage.setItem(STORE_KEY + ":zoom", zoomSel.value); } catch (err) {}
  });
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (zoomSel.value !== "fit") return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyZoom, 120);
  });
  try {
    var z = localStorage.getItem(STORE_KEY + ":zoom");
    if (z) zoomSel.value = z;
  } catch (err) {}
  applyZoom();

  /* ---- go ---- */
  renderAll();
  el("save-state").textContent = localStorage.getItem(STORE_KEY) ? "restored your draft" : "sample resume loaded";
})();
