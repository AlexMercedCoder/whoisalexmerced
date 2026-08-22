/**
 * WebMCP setup for whoisalexmerced.com.
 *
 * Loads the shared Alex Merced tool layer and opts into the packs this site
 * needs. The library and its tools are read only, and do nothing in browsers
 * without WebMCP support.
 *
 * Do not edit the vendored alex-merced-webmcp.js beside this file: it is synced
 * from alexmerced.com. Change the packs here instead.
 */
(function () {
  'use strict';
  if (!window.AlexMercedWebMCP) return;
  window.AlexMercedWebMCP.init({
    site: 'whoisalexmerced.com',
    packs: ["biography"]
  });
})();
