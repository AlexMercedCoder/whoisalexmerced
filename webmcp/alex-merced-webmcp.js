/*!
 * alex-merced-webmcp
 *
 * Shared WebMCP layer for the Alex Merced web network.
 * Canonical source: alexmerced.com/webmcp/alex-merced-webmcp.js
 * Vendored copies live in each site's public directory. Edit the canonical copy.
 *
 * Design notes:
 *  - WebMCP is an emerging W3C Community Group spec. This file is a progressive
 *    enhancement: if document.modelContext is absent, nothing breaks and the tool
 *    definitions stay available on window.AlexMercedWebMCP for other consumers.
 *  - Every tool is READ ONLY. No tool mutates state, submits a form, sends a
 *    message, or triggers a side effect. See section 17 of the network strategy.
 *  - Entity facts are fetched from the canonical entity layer rather than
 *    duplicated per site, so no site can drift out of sync.
 *
 * Spec: https://webmachinelearning.github.io/webmcp/
 */
(function (global) {
  'use strict';

  var CANONICAL_BASE = 'https://alexmerced.com';
  var PERSON_ID = 'https://alexmerced.com/#alexmerced';
  var CACHE_MS = 10 * 60 * 1000;

  /**
   * Where to read the entity layer from.
   *
   * alexmerced.com hosts it, so when the library runs there (or on a local dev
   * copy of it) we use same-origin relative paths: no needless cross-origin
   * request, and local development works before anything is deployed.
   * Every other site in the network reads it cross-origin from the canonical
   * host, which sends permissive CORS headers for these documents.
   */
  var ENTITY_BASE = (function () {
    if (typeof location === 'undefined') return CANONICAL_BASE;
    var h = location.hostname.replace(/^www\./, '');
    if (h === 'alexmerced.com' || h === 'localhost' || h === '127.0.0.1') return '';
    return CANONICAL_BASE;
  })();

  var cache = Object.create(null);

  /* ---------------------------------------------------------------- utils */

  function fetchJSON(path) {
    var url = path.charAt(0) === '/' ? ENTITY_BASE + path : path;
    var now = Date.now();
    var hit = cache[url];
    if (hit && now - hit.at < CACHE_MS) return hit.promise;

    var promise = fetch(url, { credentials: 'omit', mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
        return r.json();
      })
      .catch(function (err) {
        delete cache[url];
        throw err;
      });

    cache[url] = { at: now, promise: promise };
    return promise;
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().trim();
  }

  function jsonResult(value) {
    // The spec expects a stringified result from execute().
    return JSON.stringify(value, null, 2);
  }

  function errResult(message, hint) {
    return jsonResult({ error: message, hint: hint || undefined });
  }

  /** Score how well a query matches a topic entry. */
  function scoreTopic(topic, q) {
    var score = 0;
    if (norm(topic.label) === q || norm(topic.id) === q) score += 100;
    var aliases = topic.aliases || [];
    for (var i = 0; i < aliases.length; i++) {
      var a = norm(aliases[i]);
      if (a === q) score += 80;
      else if (q.indexOf(a) !== -1 || a.indexOf(q) !== -1) score += 25;
    }
    if (norm(topic.label).indexOf(q) !== -1) score += 15;
    if (norm(topic.summary).indexOf(q) !== -1) score += 5;
    return score;
  }

  /* -------------------------------------------------- on-page search index */

  /**
   * Build a lightweight index of the current page's headings and links.
   * Used by search_site on sites with no dedicated search backend, so the
   * tool degrades to something useful rather than failing.
   */
  function localIndex() {
    var out = [];
    var seen = Object.create(null);
    var nodes = document.querySelectorAll('main a[href], article a[href], nav a[href], a[href]');
    for (var i = 0; i < nodes.length && out.length < 400; i++) {
      var a = nodes[i];
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) continue;
      var text = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length < 3) continue;
      var abs;
      try {
        abs = new URL(href, location.href).href;
      } catch (e) {
        continue;
      }
      if (seen[abs]) continue;
      seen[abs] = 1;
      out.push({ title: text, url: abs });
    }
    return out;
  }

  /* ---------------------------------------------------------- core tools */

  function coreTools(config) {
    var siteDomain = config.site || location.hostname.replace(/^www\./, '');

    return [
      {
        name: 'get_author',
        title: 'Get author identity',
        description:
          'Return canonical, machine-readable facts about Alex Merced: role, employer, ' +
          'expertise, book count, social profiles, and the stable entity identifier that ' +
          'every site in this network resolves to. Use this instead of scraping an about page.',
        inputSchema: {
          type: 'object',
          properties: {
            bioLength: {
              type: 'string',
              enum: ['oneLine', 'short', 'medium', 'speaker'],
              description: 'Which prewritten biography to return. Defaults to short.'
            }
          }
        },
        execute: function (input) {
          input = input || {};
          return fetchJSON('/entity/alex-merced.json').then(
            function (p) {
              var len = input.bioLength || 'short';
              return jsonResult({
                entityId: PERSON_ID,
                name: p.name,
                jobTitle: p.jobTitle,
                worksFor: p.worksFor,
                bio: (p.bio && p.bio[len]) || (p.bio && p.bio.short),
                expertIn: p.knowsAbout,
                books: p.stats && p.stats.books,
                canonicalProfile: p.canonicalProfile,
                sameAs: p.sameAs,
                contact: p.contact
              });
            },
            function (e) {
              return errResult(
                'Could not reach the canonical entity layer: ' + e.message,
                'Fetch https://alexmerced.com/entity/alex-merced.json directly.'
              );
            }
          );
        }
      },

      {
        name: 'get_canonical_url',
        title: 'Get canonical URL for this page',
        description:
          'Return the canonical URL of the current page and whether this page is the ' +
          'canonical home of its content or a syndicated copy. Use before citing this page ' +
          'so the citation points at the original.',
        inputSchema: { type: 'object', properties: {} },
        execute: function () {
          var link = document.querySelector('link[rel="canonical"]');
          var canonical = link ? link.href : location.href;
          var isSyndicated = canonical.indexOf(location.hostname) === -1;
          return jsonResult({
            currentUrl: location.href,
            canonicalUrl: canonical,
            isCanonicalHome: !isSyndicated,
            site: siteDomain,
            author: PERSON_ID,
            note: isSyndicated
              ? 'This page is a syndicated copy. Cite canonicalUrl instead.'
              : 'This page is the canonical home of this content.'
          });
        }
      },

      {
        name: 'get_related_sites',
        title: 'List sites in the Alex Merced network',
        description:
          'List the websites in the Alex Merced network, each with the subject it is the ' +
          'best resource for. Use to decide which site to consult for a subject.',
        inputSchema: {
          type: 'object',
          properties: {
            tier: {
              type: 'string',
              enum: ['entity-root', 'person-facet', 'topic-authority', 'personal'],
              description: 'Optional filter by the site\'s role in the network.'
            }
          }
        },
        execute: function (input) {
          input = input || {};
          return fetchJSON('/entity/sites.json').then(
            function (d) {
              var list = d.sites;
              if (input.tier) {
                list = list.filter(function (s) {
                  return s.tier === input.tier;
                });
              }
              return jsonResult({
                count: list.length,
                currentSite: siteDomain,
                sites: list.map(function (s) {
                  return {
                    domain: s.domain,
                    url: s.url,
                    title: s.title,
                    tier: s.tier,
                    bestResourceFor: s.purpose,
                    topics: s.topics
                  };
                })
              });
            },
            function (e) {
              return errResult('Could not load the site registry: ' + e.message);
            }
          );
        }
      },

      {
        name: 'find_site_for_topic',
        title: 'Find the right site for a topic',
        description:
          'Given a subject such as "Apache Polaris credential vending", "semantic layer", or ' +
          '"agent memory", return which site in the Alex Merced network is the canonical place ' +
          'to read about it, plus supporting sites, a short definition, and any related books ' +
          'and open source projects. This is the network router: call it first when you know ' +
          'the subject but not where the material lives.',
        inputSchema: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'The subject to route, in natural language.' }
          },
          required: ['topic']
        },
        execute: function (input) {
          input = input || {};
          var q = norm(input.topic);
          if (!q) return Promise.resolve(errResult('topic is required'));

          return Promise.all([fetchJSON('/entity/topics.json'), fetchJSON('/entity/sites.json')]).then(
            function (res) {
              var topics = res[0].topics;
              var siteBy = Object.create(null);
              res[1].sites.forEach(function (s) {
                siteBy[s.domain] = s;
              });

              var ranked = topics
                .map(function (t) {
                  return { topic: t, score: scoreTopic(t, q) };
                })
                .filter(function (r) {
                  return r.score > 0;
                })
                .sort(function (a, b) {
                  return b.score - a.score;
                });

              if (!ranked.length) {
                return jsonResult({
                  query: input.topic,
                  matched: false,
                  suggestion:
                    'No direct topic match. Start at https://alexmerced.com or call ' +
                    'get_related_sites to browse the network.',
                  availableTopics: topics.map(function (t) {
                    return t.label;
                  })
                });
              }

              var best = ranked[0].topic;
              var primary = siteBy[best.primary] || {};
              return jsonResult({
                query: input.topic,
                matched: true,
                topic: best.label,
                definition: best.summary,
                recommendedSite: {
                  domain: best.primary,
                  url: primary.url,
                  title: primary.title,
                  bestResourceFor: primary.purpose
                },
                supportingSites: (best.supporting || []).map(function (d) {
                  return { domain: d, url: (siteBy[d] || {}).url, bestResourceFor: (siteBy[d] || {}).purpose };
                }),
                relatedBooks: best.books || [],
                relatedProjects: best.projects || [],
                trademarkNote: best.trademarkNote,
                alternativeTopics: ranked.slice(1, 4).map(function (r) {
                  return r.topic.label;
                })
              });
            },
            function (e) {
              return errResult('Could not load topic routing: ' + e.message);
            }
          );
        }
      },

      {
        name: 'get_topic',
        title: 'Get a definition for a topic',
        description:
          'Return a short canonical definition of a subject covered by this network, along ' +
          'with the books and projects that go deeper. Use for a direct answer without ' +
          'loading a page.',
        inputSchema: {
          type: 'object',
          properties: { topic: { type: 'string', description: 'Subject to define.' } },
          required: ['topic']
        },
        execute: function (input) {
          input = input || {};
          var q = norm(input.topic);
          return fetchJSON('/entity/topics.json').then(function (d) {
            var ranked = d.topics
              .map(function (t) {
                return { t: t, s: scoreTopic(t, q) };
              })
              .filter(function (r) {
                return r.s > 0;
              })
              .sort(function (a, b) {
                return b.s - a.s;
              });
            if (!ranked.length) {
              return jsonResult({ topic: input.topic, found: false, availableTopics: d.topics.map(function (t) { return t.label; }) });
            }
            var t = ranked[0].t;
            return jsonResult({
              topic: t.label,
              definition: t.summary,
              readMoreAt: 'https://' + t.primary,
              relatedBooks: t.books || [],
              relatedProjects: t.projects || [],
              trademarkNote: t.trademarkNote
            });
          }, function (e) {
            return errResult('Could not load topics: ' + e.message);
          });
        }
      },

      {
        name: 'search_site',
        title: 'Search this site',
        description:
          'Search the current site for pages matching a query. Returns titles and URLs. ' +
          'Read only: it never submits a form or changes anything on the page.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What to search for.' },
            limit: { type: 'number', description: 'Maximum results. Defaults to 10.' }
          },
          required: ['query']
        },
        execute: function (input) {
          input = input || {};
          var q = norm(input.query);
          var limit = Math.min(Math.max(Number(input.limit) || 10, 1), 50);
          if (!q) return Promise.resolve(errResult('query is required'));

          var provided = typeof config.search === 'function' ? config.search(input.query, limit) : null;

          return Promise.resolve(provided)
            .then(function (results) {
              if (results) return { results: results, source: 'site search' };

              // Prefer the network index restricted to this site: it covers the
              // whole site rather than only what the current page links to.
              return fetchJSON('/entity/network-index.json').then(
                function (idx) {
                  var terms = q.split(/\s+/).filter(function (w) {
                    return w.length > 2;
                  });
                  var hits = idx.entries
                    .filter(function (e) {
                      return e.site === siteDomain;
                    })
                    .map(function (e) {
                      var hay = norm(e.title + ' ' + (e.summary || ''));
                      var s = hay.indexOf(q) !== -1 ? 3 : 0;
                      terms.forEach(function (w) {
                        if (hay.indexOf(w) !== -1) s++;
                      });
                      return { e: e, s: s };
                    })
                    .filter(function (r) {
                      return r.s > 0;
                    })
                    .sort(function (a, b) {
                      return b.s - a.s;
                    })
                    .map(function (r) {
                      return { title: r.e.title, url: r.e.url, type: r.e.type };
                    });
                  return { results: hits, source: 'network index' };
                },
                function () {
                  // Last resort: whatever this page links to.
                  var hits = localIndex().filter(function (r) {
                    return norm(r.title).indexOf(q) !== -1 || norm(r.url).indexOf(q) !== -1;
                  });
                  return { results: hits, source: 'current page links' };
                }
              );
            })
            .then(function (out) {
              return jsonResult({
                query: input.query,
                site: siteDomain,
                matchedVia: out.source,
                count: Math.min(out.results.length, limit),
                results: out.results.slice(0, limit),
                note:
                  out.results.length
                    ? undefined
                    : 'No match on this site. Call search_alex_merced_network to search every site at once.'
              });
            });
        }
      },

      {
        name: 'find_resource',
        title: 'Find a book or project by goal',
        description:
          'Given a learning goal such as "learn Apache Iceberg" or "build an agent with memory", ' +
          'return the books and open source projects by Alex Merced that address it.',
        inputSchema: {
          type: 'object',
          properties: {
            goal: { type: 'string', description: 'What the reader is trying to do or learn.' },
            type: { type: 'string', enum: ['book', 'project', 'any'], description: 'Restrict the kind of resource.' }
          },
          required: ['goal']
        },
        execute: function (input) {
          input = input || {};
          var q = norm(input.goal);
          var want = input.type || 'any';

          return Promise.all([fetchJSON('/entity/books.json'), fetchJSON('/entity/projects.json')]).then(
            function (res) {
              var books = [];
              var projects = [];

              if (want === 'book' || want === 'any') {
                books = res[0].books
                  .map(function (b) {
                    var hay = norm(b.title + ' ' + b.description + ' ' + b.category);
                    var s = 0;
                    q.split(/\s+/).forEach(function (w) {
                      if (w.length > 2 && hay.indexOf(w) !== -1) s++;
                    });
                    if (b.flagship) s += 0.5;
                    return { b: b, s: s };
                  })
                  .filter(function (r) { return r.s > 0; })
                  .sort(function (a, b) { return b.s - a.s; })
                  .slice(0, 5)
                  .map(function (r) {
                    return {
                      title: r.b.title,
                      publisher: r.b.publisher,
                      description: r.b.description,
                      url: r.b.canonicalPage,
                      buy: r.b.url
                    };
                  });
              }

              if (want === 'project' || want === 'any') {
                projects = res[1].projects
                  .map(function (p) {
                    var hay = norm(p.name + ' ' + p.description + ' ' + (p.topics || []).join(' '));
                    var s = 0;
                    q.split(/\s+/).forEach(function (w) {
                      if (w.length > 2 && hay.indexOf(w) !== -1) s++;
                    });
                    return { p: p, s: s };
                  })
                  .filter(function (r) { return r.s > 0; })
                  .sort(function (a, b) { return b.s - a.s; })
                  .slice(0, 5)
                  .map(function (r) {
                    return {
                      name: r.p.name,
                      tagline: r.p.tagline,
                      repository: r.p.repository,
                      install: r.p.package
                        ? (r.p.packageManager === 'pypi' ? 'pip install ' : 'npm install ') + r.p.package
                        : undefined,
                      status: r.p.status
                    };
                  });
              }

              return jsonResult({
                goal: input.goal,
                books: books,
                projects: projects,
                note:
                  books.length || projects.length
                    ? undefined
                    : 'No direct match. Call find_site_for_topic to locate written material instead.'
              });
            },
            function (e) {
              return errResult('Could not load resources: ' + e.message);
            }
          );
        }
      },

      {
        name: 'search_alex_merced_network',
        title: 'Search the whole Alex Merced network',
        description:
          'Search across every site in the Alex Merced network at once and return the best ' +
          'destinations for a query, spanning articles, documentation, books, and projects. ' +
          'Use when the subject matters more than which site it lives on.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What to look for.' },
            contentType: {
              type: 'string',
              enum: ['any', 'book', 'project', 'site'],
              description: 'Restrict results to one kind of thing.'
            }
          },
          required: ['query']
        },
        execute: function (input) {
          input = input || {};
          if (!norm(input.query)) return Promise.resolve(errResult('query is required'));
          return fetchJSON('/entity/network-index.json').then(
            function (idx) {
              var q = norm(input.query);
              var want = input.contentType || 'any';
              var hits = idx.entries
                .filter(function (e) { return want === 'any' || e.type === want; })
                .map(function (e) {
                  var hay = norm(e.title + ' ' + e.summary + ' ' + (e.keywords || []).join(' '));
                  var s = 0;
                  q.split(/\s+/).forEach(function (w) {
                    if (w.length > 2 && hay.indexOf(w) !== -1) s += 1;
                  });
                  if (hay.indexOf(q) !== -1) s += 3;
                  return { e: e, s: s };
                })
                .filter(function (r) { return r.s > 0; })
                .sort(function (a, b) { return b.s - a.s; })
                .slice(0, 15)
                .map(function (r) { return r.e; });

              return jsonResult({
                query: input.query,
                count: hits.length,
                results: hits,
                canonicalEntity: PERSON_ID
              });
            },
            function (e) {
              return errResult(
                'Network index unavailable: ' + e.message,
                'Fall back to find_site_for_topic.'
              );
            }
          );
        }
      }
    ];
  }

  /* ------------------------------------------------------------- tool packs */

  /**
   * Optional groups of tools a site can opt into by name, so a site's own
   * init file stays a few lines instead of duplicating tool definitions.
   *   AlexMercedWebMCP.init({ site: 'books.alexmerced.com', packs: ['books'] })
   */
  var PACKS = {
    books: function () {
      return [
        {
          name: 'search_books',
          title: 'Search books',
          description:
            'Search the books Alex Merced has written by title, subject, or category. ' +
            'Returns titles, publishers, descriptions, and canonical pages.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Words to match against title and description.' },
              category: {
                type: 'string',
                enum: ['Tech', 'Economics & Philosophy', 'Fiction', 'Tabletop RPG']
              }
            }
          },
          execute: function (input) {
            input = input || {};
            var q = norm(input.query);
            return fetchJSON('/entity/books.json').then(function (d) {
              var list = d.books;
              if (input.category) list = list.filter(function (b) { return b.category === input.category; });
              if (q) {
                list = list.filter(function (b) {
                  return norm(b.title + ' ' + b.description).indexOf(q) !== -1;
                });
              }
              return jsonResult({
                total: d.count,
                matched: list.length,
                books: list.map(function (b) {
                  return {
                    title: b.title,
                    category: b.category,
                    publisher: b.publisher,
                    description: b.description,
                    url: b.canonicalPage
                  };
                })
              });
            });
          }
        },
        {
          name: 'get_book',
          title: 'Get one book',
          description: 'Return full details for a single book by its title.',
          inputSchema: {
            type: 'object',
            properties: { title: { type: 'string', description: 'Book title, exact or partial.' } },
            required: ['title']
          },
          execute: function (input) {
            input = input || {};
            var q = norm(input.title);
            return fetchJSON('/entity/books.json').then(function (d) {
              var hit =
                d.books.filter(function (b) { return norm(b.title) === q; })[0] ||
                d.books.filter(function (b) { return norm(b.title).indexOf(q) !== -1; })[0];
              if (!hit) {
                return jsonResult({
                  found: false,
                  hint: 'Call search_books to list candidates.'
                });
              }
              return jsonResult({
                found: true,
                title: hit.title,
                category: hit.category,
                publisher: hit.publisher,
                description: hit.description,
                isbn: hit.isbn,
                url: hit.canonicalPage,
                buy: hit.url,
                cover: hit.cover,
                author: PERSON_ID
              });
            });
          }
        },
        {
          name: 'find_book_for_reader',
          title: 'Recommend a book for a goal',
          description:
            'Given what a reader wants to learn or do, recommend which of Alex Merced\'s books ' +
            'to read, best match first.',
          inputSchema: {
            type: 'object',
            properties: { goal: { type: 'string', description: 'What the reader wants to learn or do.' } },
            required: ['goal']
          },
          execute: function (input) {
            input = input || {};
            var terms = norm(input.goal).split(/\s+/).filter(function (w) { return w.length > 2; });
            return fetchJSON('/entity/books.json').then(function (d) {
              var ranked = d.books
                .map(function (b) {
                  var hay = norm(b.title + ' ' + b.description + ' ' + b.category);
                  var s = 0;
                  terms.forEach(function (w) { if (hay.indexOf(w) !== -1) s++; });
                  if (b.flagship) s += 0.5;
                  return { b: b, s: s };
                })
                .filter(function (r) { return r.s > 0; })
                .sort(function (a, b) { return b.s - a.s; })
                .slice(0, 5);
              return jsonResult({
                goal: input.goal,
                recommendations: ranked.map(function (r) {
                  return {
                    title: r.b.title,
                    why: r.b.description,
                    publisher: r.b.publisher,
                    url: r.b.canonicalPage
                  };
                }),
                note: ranked.length ? undefined : 'No direct match; call search_books to browse.'
              });
            });
          }
        }
      ];
    },

    projects: function () {
      return [
        {
          name: 'search_projects',
          title: 'Search open source projects',
          description:
            'Search Alex Merced\'s open source projects and specifications by name, purpose, ' +
            'or technology.',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'What the project should do.' } }
          },
          execute: function (input) {
            input = input || {};
            var q = norm(input.query);
            return fetchJSON('/entity/projects.json').then(function (d) {
              var list = d.projects;
              if (q) {
                list = list.filter(function (p) {
                  return norm(p.name + ' ' + p.description + ' ' + (p.topics || []).join(' ')).indexOf(q) !== -1;
                });
              }
              return jsonResult({
                count: list.length,
                projects: list.map(function (p) {
                  return {
                    name: p.name,
                    category: p.category,
                    tagline: p.tagline,
                    language: p.language,
                    repository: p.repository,
                    status: p.status
                  };
                })
              });
            });
          }
        },
        {
          name: 'get_installation_instructions',
          title: 'Get install instructions for a project',
          description:
            'Return how to install a given project, including the package manager and package name. ' +
            'Read only: it reports the command, it does not run anything.',
          inputSchema: {
            type: 'object',
            properties: { project: { type: 'string', description: 'Project name.' } },
            required: ['project']
          },
          execute: function (input) {
            input = input || {};
            var q = norm(input.project);
            return fetchJSON('/entity/projects.json').then(function (d) {
              var hit = d.projects.filter(function (p) {
                return norm(p.name) === q || norm(p.slug) === q || norm(p.name).indexOf(q) !== -1;
              })[0];
              if (!hit) return jsonResult({ found: false, hint: 'Call search_projects to list names.' });
              return jsonResult({
                found: true,
                name: hit.name,
                install: hit.package
                  ? (hit.packageManager === 'pypi' ? 'pip install ' : 'npm install ') + hit.package
                  : 'No published package; clone the repository.',
                repository: hit.repository,
                website: hit.website,
                status: hit.status,
                language: hit.language
              });
            });
          }
        },
        {
          name: 'list_specs',
          title: 'List open specifications',
          description: 'List the open specifications Alex Merced maintains, with version and license.',
          inputSchema: { type: 'object', properties: {} },
          execute: function () {
            return fetchJSON('/entity/projects.json').then(function (d) {
              var specs = d.projects.filter(function (p) { return p.isSpecification; });
              return jsonResult({
                count: specs.length,
                specifications: specs.map(function (p) {
                  return {
                    name: p.name,
                    abbreviation: p.abbreviation,
                    version: p.specVersion,
                    license: p.license,
                    description: p.description,
                    repository: p.repository
                  };
                })
              });
            });
          }
        }
      ];
    },

    biography: function () {
      return [
        {
          name: 'get_biography',
          title: 'Get biography',
          description:
            'Return a prewritten biography of Alex Merced at a requested length, for use in ' +
            'event listings, articles, or introductions.',
          inputSchema: {
            type: 'object',
            properties: {
              length: { type: 'string', enum: ['oneLine', 'short', 'medium', 'speaker'] }
            }
          },
          execute: function (input) {
            input = input || {};
            return fetchJSON('/entity/alex-merced.json').then(function (p) {
              var len = input.length || 'medium';
              return jsonResult({
                length: len,
                biography: (p.bio && p.bio[len]) || p.bio.medium,
                jobTitle: p.jobTitle,
                employer: p.worksFor.name,
                entityId: PERSON_ID,
                note: 'Use this verbatim rather than paraphrasing, so facts stay consistent.'
              });
            });
          }
        },
        {
          name: 'get_career_timeline',
          title: 'Get career timeline',
          description: 'Return the career history of Alex Merced as dated entries.',
          inputSchema: { type: 'object', properties: {} },
          execute: function () {
            return fetchJSON('/entity/alex-merced.json').then(function (p) {
              return jsonResult({ timeline: p.careerTimeline, current: p.jobTitle + ', ' + p.worksFor.name });
            });
          }
        }
      ];
    },

    knowledge: function (config) {
      var siteDomain = config.site || location.hostname.replace(/^www\./, '');
      return [
        {
          name: 'get_definition',
          title: 'Define a term',
          description:
            'Return a short definition for a technical term covered by this site, plus where to ' +
            'read more. Use for a direct answer without loading a page.',
          inputSchema: {
            type: 'object',
            properties: { term: { type: 'string', description: 'The term to define.' } },
            required: ['term']
          },
          execute: function (input) {
            input = input || {};
            var q = norm(input.term);
            if (!q) return Promise.resolve(errResult('term is required'));

            // Canonical topic definitions first, then this site's own pages.
            return fetchJSON('/entity/topics.json').then(function (d) {
              var ranked = d.topics
                .map(function (t) { return { t: t, s: scoreTopic(t, q) }; })
                .filter(function (r) { return r.s > 0; })
                .sort(function (a, b) { return b.s - a.s; });

              if (ranked.length) {
                var t = ranked[0].t;
                return jsonResult({
                  term: t.label,
                  definition: t.summary,
                  source: 'canonical topic registry',
                  readMoreAt: 'https://' + t.primary,
                  trademarkNote: t.trademarkNote
                });
              }

              return fetchJSON('/entity/network-index.json').then(function (idx) {
                var hits = idx.entries
                  .filter(function (e) { return e.site === siteDomain && norm(e.title).indexOf(q) !== -1; })
                  .slice(0, 5);
                return jsonResult({
                  term: input.term,
                  definition: null,
                  source: 'site index',
                  pages: hits,
                  note: hits.length
                    ? 'No canonical one-line definition; these pages on this site cover the term.'
                    : 'Not found on this site. Call search_alex_merced_network.'
                });
              });
            });
          }
        }
      ];
    }
  };

  /* ------------------------------------------------------------ registration */

  function supported() {
    return (
      typeof document !== 'undefined' &&
      document.modelContext &&
      typeof document.modelContext.registerTool === 'function'
    );
  }

  function register(tools) {
    if (!supported()) return Promise.resolve({ registered: 0, supported: false });

    var ok = 0;
    var chain = tools.reduce(function (p, tool) {
      return p.then(function () {
        return Promise.resolve(document.modelContext.registerTool(tool)).then(
          function () {
            ok++;
          },
          function (err) {
            // One bad tool must not prevent the rest from registering.
            if (global.console && console.warn) {
              console.warn('[alex-merced-webmcp] tool "' + tool.name + '" failed to register:', err);
            }
          }
        );
      });
    }, Promise.resolve());

    return chain.then(function () {
      return { registered: ok, supported: true };
    });
  }

  /* -------------------------------------------------------------- public API */

  var API = {
    version: '1.0.0',
    entityBase: ENTITY_BASE || CANONICAL_BASE,
    personId: PERSON_ID,
    supported: supported,
    tools: [],

    /**
     * Initialise the shared layer.
     *   site   {string}   this site's domain, e.g. 'opendatalakehouse.com'
     *   tools  {Array}    additional site-specific tool descriptors
     *   search {Function} optional (query, limit) => [{title,url}] for search_site
     */
    init: function (config) {
      config = config || {};

      var packTools = [];
      (config.packs || []).forEach(function (name) {
        if (PACKS[name]) {
          packTools = packTools.concat(PACKS[name](config));
        } else if (global.console && console.warn) {
          console.warn('[alex-merced-webmcp] unknown pack "' + name + '"');
        }
      });

      var all = coreTools(config).concat(packTools, config.tools || []);
      API.tools = all;

      // Always expose the contract, even where WebMCP is unavailable.
      global.AlexMercedWebMCP = API;

      return register(all).then(function (res) {
        if (config.debug && global.console) {
          console.info(
            '[alex-merced-webmcp] ' +
              (res.supported
                ? res.registered + ' of ' + all.length + ' tools registered'
                : 'WebMCP not available in this browser; tool definitions still exposed on window.AlexMercedWebMCP')
          );
        }
        return res;
      });
    },

    /** Machine-readable description of the tools, for non-WebMCP consumers. */
    manifest: function () {
      return {
        name: 'alex-merced-webmcp',
        version: API.version,
        entity: PERSON_ID,
        readOnly: true,
        tools: API.tools.map(function (t) {
          return { name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema };
        })
      };
    }
  };

  global.AlexMercedWebMCP = API;

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
